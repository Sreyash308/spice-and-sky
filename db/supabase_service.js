/**
 * Supabase Service Layer for Spice & Sky Rooftop Cafe
 * Interacts with remote Supabase PostgreSQL, Auth, and RPC functions,
 * while providing transparent local fallback for development and testing.
 */

const { createClient } = require('@supabase/supabase-js');
const localStore = require('./local_store');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

let supabase = null;
let isConfigured = false;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project-ref')) {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    isConfigured = true;
    console.log('✅ Supabase Client initialized with remote URL:', supabaseUrl);
  } catch (err) {
    console.warn('⚠️ Supabase client initialization failed, using local store:', err.message);
  }
} else {
  console.log('ℹ️ Supabase credentials not set in .env. Operating in local mode.');
}

// Per-order concurrency lock to prevent asynchronous race conditions on concurrent bill updates
const orderUpdateLocks = new Map();

async function withOrderLock(orderId, fn) {
  const key = String(orderId);
  const prevLock = orderUpdateLocks.get(key) || Promise.resolve();
  let release;
  const currentLock = new Promise(resolve => { release = resolve; });
  orderUpdateLocks.set(key, currentLock);
  try {
    await prevLock;
    return await fn();
  } finally {
    if (orderUpdateLocks.get(key) === currentLock) {
      orderUpdateLocks.delete(key);
    }
    release();
  }
}

let orderCreationLockPromise = Promise.resolve();
async function withOrderCreationLock(fn) {
  const prevLock = orderCreationLockPromise;
  let release;
  const currentLock = new Promise(resolve => { release = resolve; });
  orderCreationLockPromise = currentLock;
  try {
    await prevLock;
    return await fn();
  } finally {
    release();
  }
}


module.exports = {
  isConfigured: () => isConfigured,
  getSupabaseClient: () => supabase,
  getLocalStore: () => localStore,

  // Menu Categories
  async getCategories() {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('menu_categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (!error && data && data.length > 0) {
        localStore.syncWithRemote({ categories: data });
        return data;
      }
      if (error) console.error('Supabase getCategories error:', error.message);
    }
    return localStore.getCategories();
  },

  // Menu Items & Variants
  async getMenuItems(includeArchived = false) {
    if (isConfigured) {
      let query = supabase
        .from('menu_items')
        .select('*, menu_item_variants(*)')
        .order('display_order', { ascending: true });
      
      if (!includeArchived) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const normalized = data.map(item => {
          const isNoteAnImage = item.verification_note && (item.verification_note.startsWith('http') || item.verification_note.startsWith('/images/'));
          const img = (item.image_url && String(item.image_url).trim().length > 0)
            ? item.image_url
            : (isNoteAnImage ? item.verification_note : null);
          return {
            ...item,
            image_url: img,
            verification_note: isNoteAnImage ? null : item.verification_note
          };
        });
        localStore.syncWithRemote({ items: normalized });
        return normalized;
      }
      if (error) console.error('Supabase getMenuItems error:', error.message);
    }

    const items = localStore.getMenuItems(includeArchived);
    const variants = localStore.getVariants();
    return items.map(item => ({
      ...item,
      menu_item_variants: variants.filter(v => v.menu_item_id === item.id)
    }));
  },

  // Atomic Order Creation
  async createOrderAtomic(params) {
    const tableNum = Number(params.table_number);
    if (isNaN(tableNum) || !Number.isInteger(tableNum) || tableNum < 1 || tableNum > 9) {
      throw new Error(`Invalid table number: ${params.table_number}. Must be an integer between 1 and 9.`);
    }

    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('Order items are required and must not be empty.');
    }

    if (isConfigured) {
      // Validate waiter_id against public.profiles to prevent foreign key errors
      let validatedWaiterId = null;
      if (params.waiter_id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', params.waiter_id)
            .maybeSingle();

          if (profile) {
            validatedWaiterId = profile.id;
          } else {
            const { data: defaultWaiter } = await supabase
              .from('profiles')
              .select('id')
              .eq('role', 'WAITER')
              .limit(1)
              .maybeSingle();
            validatedWaiterId = defaultWaiter ? defaultWaiter.id : null;
          }
        } catch (e) {
          validatedWaiterId = null;
        }
      }

      // 1. Resolve item snapshots and calculate authoritative subtotal & total
      const allItems = await this.getMenuItems(true);
      let calculatedSubtotal = 0;
      const itemSnapshots = (params.items || []).map(oi => {
        const rawQty = oi.quantity;
        const numQty = Number(rawQty);
        if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
          throw new Error(`Invalid quantity: ${rawQty}. Quantity must be a positive whole integer.`);
        }

        const item = allItems.find(i => i.id === oi.menu_item_id);
        if (!item) {
          throw new Error(`Menu item not found: ${oi.menu_item_id}`);
        }
        if (!item.is_active) {
          throw new Error(`Item "${item.name}" is no longer on the menu.`);
        }
        if (!item.is_available) {
          throw new Error(`Item "${item.name}" is currently unavailable.`);
        }

        const variants = item.menu_item_variants || [];
        let variant = null;
        if (oi.variant_id && String(oi.variant_id) !== 'null' && String(oi.variant_id) !== 'undefined') {
          variant = variants.find(v => v.id === oi.variant_id);
          if (!variant) {
            throw new Error(`Variant not found for item "${item.name}".`);
          }
          if (variant.menu_item_id && variant.menu_item_id !== item.id) {
            throw new Error(`Variant "${variant.name}" does not belong to "${item.name}".`);
          }
          if (!variant.is_available) {
            throw new Error(`Variant "${variant.name}" is currently unavailable.`);
          }
        }

        const unitPrice = variant ? Number(variant.price) : Number(item.price);
        const lineTotal = unitPrice * numQty;
        calculatedSubtotal += lineTotal;
        return {
          menu_item_id: item.id,
          variant_id: variant ? variant.id : null,
          item_name_snapshot: item.name,
          variant_name_snapshot: variant ? variant.name : null,
          unit_price_snapshot: unitPrice,
          quantity: numQty,
          line_total: lineTotal
        };
      });

      // 2. Check Idempotency Key
      if (params.idempotency_key) {
        try {
          const { data: existing } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('idempotency_key', params.idempotency_key)
            .maybeSingle();

          if (existing) {
            const existingItems = existing.order_items || [];
            return localStore.recordOrderSnapshot(existing, existingItems);
          }
        } catch (e) {
          // continue
        }
      }

      // 3. Authoritative Direct Insert into Supabase (Guaranteeing subtotal & total are never null and sequential #1, #2, ...)
      try {
        return await withOrderCreationLock(async () => {
          let nextOrderNumber = 1;
          try {
            const { data: latestOrder } = await supabase
              .from('orders')
              .select('order_number')
              .order('order_number', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestOrder && typeof latestOrder.order_number === 'number' && !isNaN(latestOrder.order_number) && latestOrder.order_number >= 1) {
              nextOrderNumber = Number(latestOrder.order_number) + 1;
            }
          } catch (seqErr) {
            nextOrderNumber = Math.max(1, (localStore.orderSequence || 0) + 1);
          }

          const orderPayload = {
            order_number: nextOrderNumber,
            table_number: Number(params.table_number),
            waiter_id: validatedWaiterId,
            waiter_name_snapshot: params.waiter_name ? String(params.waiter_name).replace(/<[^>]*>?/gm, '').trim() : 'Staff',
            status: params.status || 'CONFIRMED',
            subtotal: calculatedSubtotal,
            total: calculatedSubtotal, // Zero Tax, Zero GST, Zero Service Charges
            notes: params.notes ? String(params.notes).replace(/<[^>]*>?/gm, '').trim() : null,
            idempotency_key: params.idempotency_key || null
          };

          let { data: insertedOrder, error: orderErr } = await supabase
            .from('orders')
            .insert([orderPayload])
            .select()
            .single();

          if (orderErr && orderErr.code === '23505') {
            const { data: retryLatest } = await supabase
              .from('orders')
              .select('order_number')
              .order('order_number', { ascending: false })
              .limit(1)
              .maybeSingle();
            orderPayload.order_number = (retryLatest && retryLatest.order_number ? Number(retryLatest.order_number) : nextOrderNumber) + 1;
            const retryRes = await supabase.from('orders').insert([orderPayload]).select().single();
            if (!retryRes.error && retryRes.data) {
              insertedOrder = retryRes.data;
              orderErr = null;
            }
          }

          if (!orderErr && insertedOrder) {
            const itemsToInsert = itemSnapshots.map(s => ({
              order_id: insertedOrder.id,
              menu_item_id: s.menu_item_id,
              item_name_snapshot: s.item_name_snapshot,
              variant_name_snapshot: s.variant_name_snapshot,
              unit_price_snapshot: s.unit_price_snapshot,
              quantity: s.quantity,
              line_total: s.line_total
            }));

            const { error: itemsErr } = await supabase
              .from('order_items')
              .insert(itemsToInsert);

            if (itemsErr) {
              console.warn('Supabase order_items insert warning:', itemsErr.message);
            }

            insertedOrder.items = itemSnapshots;
            insertedOrder.order_items = itemSnapshots;
            localStore.orderSequence = Math.max(localStore.orderSequence || 0, Number(insertedOrder.order_number) || 0);
            const fullOrder = localStore.recordOrderSnapshot(insertedOrder, itemSnapshots);
            return fullOrder;
          }

          if (orderErr) {
            console.warn('Direct order insert warning:', orderErr.message);
          }
          throw new Error(orderErr ? orderErr.message : 'Order insert failed');
        });
      } catch (directErr) {
        console.warn('Direct order insert exception:', directErr.message);
      }

      // 4. Fallback RPC call if direct insert was not used
      try {
        const sanitizedItems = (params.items || []).map(i => ({
          menu_item_id: i.menu_item_id,
          variant_id: (i.variant_id && String(i.variant_id) !== 'null' && String(i.variant_id) !== 'undefined') ? i.variant_id : null,
          quantity: Math.max(1, Number(i.quantity) || 1)
        }));

        const { data, error } = await supabase.rpc('create_order_atomic', {
          p_table_number: Number(params.table_number),
          p_items: sanitizedItems,
          p_notes: params.notes || null,
          p_idempotency_key: params.idempotency_key || null,
          p_waiter_id: validatedWaiterId,
          p_waiter_name: params.waiter_name || 'Staff'
        });

        if (!error && data) {
          const fullOrder = localStore.recordOrderSnapshot(data, itemSnapshots);
          return fullOrder;
        }
      } catch (rpcErr) {
        console.warn('RPC create_order_atomic fallback error:', rpcErr.message);
      }
    }

    return localStore.createOrderAtomic(params);
  },

  // Update Order Items (Edit Bill / Multi-Round Serving)
  async updateOrderItems(orderId, params) {
    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('Order items are required and must not be empty.');
    }

    return withOrderLock(orderId, async () => {
      if (isConfigured) {
        try {
          const allItems = await this.getMenuItems(true);
          let calculatedSubtotal = 0;
        const itemSnapshots = (params.items || []).map(oi => {
          const rawQty = oi.quantity;
          const numQty = Number(rawQty);
          if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
            throw new Error(`Invalid quantity: ${rawQty}. Quantity must be a positive whole integer.`);
          }

          const item = allItems.find(i => i.id === oi.menu_item_id);
          if (!item) {
            throw new Error(`Menu item not found: ${oi.menu_item_id}`);
          }
          if (!item.is_active) {
            throw new Error(`Item "${item.name}" is no longer on the menu.`);
          }
          if (!item.is_available) {
            throw new Error(`Item "${item.name}" is currently unavailable.`);
          }

          const variants = item.menu_item_variants || [];
          let variant = null;
          if (oi.variant_id && String(oi.variant_id) !== 'null' && String(oi.variant_id) !== 'undefined') {
            variant = variants.find(v => v.id === oi.variant_id);
            if (!variant) {
              throw new Error(`Variant not found for item "${item.name}".`);
            }
            if (variant.menu_item_id && variant.menu_item_id !== item.id) {
              throw new Error(`Variant "${variant.name}" does not belong to "${item.name}".`);
            }
            if (!variant.is_available) {
              throw new Error(`Variant "${variant.name}" is currently unavailable.`);
            }
          }

          const unitPrice = variant ? Number(variant.price) : Number(item.price);
          const lineTotal = unitPrice * numQty;
          calculatedSubtotal += lineTotal;
          return {
            order_id: orderId,
            menu_item_id: item.id,
            variant_id: variant ? variant.id : null,
            item_name_snapshot: item.name,
            variant_name_snapshot: variant ? variant.name : null,
            unit_price_snapshot: unitPrice,
            quantity: numQty,
            line_total: lineTotal
          };
        });

        const updatePayload = {
          subtotal: calculatedSubtotal,
          total: calculatedSubtotal,
          updated_at: new Date().toISOString()
        };
        if (params.notes !== undefined) updatePayload.notes = params.notes;
        if (params.status) updatePayload.status = params.status;
        if (params.waiter_name) updatePayload.waiter_name_snapshot = params.waiter_name;

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(orderId));
        let query = supabase.from('orders').update(updatePayload);
        if (isUUID) {
          query = query.eq('id', orderId);
        } else {
          query = query.eq('order_number', Number(orderId));
        }
        const { data: updatedOrder, error: updateErr } = await query.select().maybeSingle();

        if (!updateErr && updatedOrder) {
          await supabase.from('order_items').delete().eq('order_id', updatedOrder.id);
          await supabase.from('order_items').insert(itemSnapshots.map(s => ({
            order_id: updatedOrder.id,
            menu_item_id: s.menu_item_id,
            variant_id: s.variant_id,
            item_name_snapshot: s.item_name_snapshot,
            variant_name_snapshot: s.variant_name_snapshot,
            unit_price_snapshot: s.unit_price_snapshot,
            quantity: s.quantity,
            line_total: s.line_total
          })));

          updatedOrder.items = itemSnapshots;
          updatedOrder.subtotal = calculatedSubtotal;
          updatedOrder.total = calculatedSubtotal;
          try {
            localStore.updateOrderItems(updatedOrder.id, {
              ...params,
              items: itemSnapshots.map(s => ({
                menu_item_id: s.menu_item_id,
                variant_id: s.variant_id,
                quantity: s.quantity
              }))
            });
          } catch (e) {}
          return updatedOrder;
        }
      } catch (err) {
        console.warn('Supabase updateOrderItems error:', err.message);
        throw err;
      }
    }
    return localStore.updateOrderItems(orderId, params);
  });
},

  // Get Active Serving Orders
  async getActiveServingOrders() {
    if (isConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .neq('status', 'COMPLETED')
          .neq('status', 'CANCELLED')
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map(o => ({
            ...o,
            items: o.order_items || []
          }));
        }
      } catch (err) {
        console.warn('Supabase getActiveServingOrders error:', err.message);
      }
    }
    return localStore.getActiveServingOrders();
  },

  // Update Menu Item
  async updateMenuItem(id, updates) {
    if (isConfigured) {
      const supabaseUpdates = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Persist image_url into verification_note if no explicit note text is given
      if (updates.image_url !== undefined) {
        if (!updates.verification_note || updates.verification_note.startsWith('http') || updates.verification_note.startsWith('/images/')) {
          supabaseUpdates.verification_note = updates.image_url || null;
        }
      }

      // Try update with image_url column
      let res = await supabase
        .from('menu_items')
        .update(supabaseUpdates)
        .eq('id', id)
        .select();

      // If Supabase schema cache does not have image_url column, strip and update with verification_note
      if (res.error && res.error.message && res.error.message.includes("'image_url'")) {
        delete supabaseUpdates.image_url;
        res = await supabase
          .from('menu_items')
          .update(supabaseUpdates)
          .eq('id', id)
          .select();
      }

      if (!res.error && res.data && res.data.length > 0) {
        const row = res.data[0];
        const isNoteAnImage = row.verification_note && (row.verification_note.startsWith('http') || row.verification_note.startsWith('/images/'));
        const finalImg = (updates.image_url !== undefined)
          ? updates.image_url
          : ((row.image_url && String(row.image_url).trim().length > 0) ? row.image_url : (isNoteAnImage ? row.verification_note : null));

        const updatedItem = {
          ...row,
          image_url: finalImg,
          verification_note: isNoteAnImage ? null : row.verification_note
        };

        try {
          localStore.updateMenuItem(id, { ...updates, image_url: finalImg });
        } catch (e) {}
        return updatedItem;
      }
      if (res.error) console.error('Supabase updateMenuItem error:', res.error.message);
    }
    return localStore.updateMenuItem(id, updates);
  },

  // Add Menu Item
  async addMenuItem(itemData) {
    if (isConfigured) {
      const isNoteAnImage = itemData.verification_note && (itemData.verification_note.startsWith('http') || itemData.verification_note.startsWith('/images/'));
      const noteToSave = (!isNoteAnImage && itemData.verification_note)
        ? itemData.verification_note
        : (itemData.image_url || null);

      const insertPayload = {
        category_id: itemData.category_id,
        name: itemData.name,
        description: itemData.description || '',
        price: Number(itemData.price) || 0,
        food_type: itemData.food_type || 'VEG',
        image_url: itemData.image_url || null,
        is_available: true,
        is_active: true,
        verification_note: noteToSave
      };

      let res = await supabase
        .from('menu_items')
        .insert([insertPayload])
        .select()
        .single();

      if (res.error && res.error.message && res.error.message.includes("'image_url'")) {
        delete insertPayload.image_url;
        res = await supabase
          .from('menu_items')
          .insert([insertPayload])
          .select()
          .single();
      }

      if (!res.error && res.data) {
        const row = res.data;
        const noteIsImg = row.verification_note && (row.verification_note.startsWith('http') || row.verification_note.startsWith('/images/'));
        const finalImg = itemData.image_url || (row.image_url && String(row.image_url).trim().length > 0 ? row.image_url : (noteIsImg ? row.verification_note : null));

        const createdItem = {
          ...row,
          image_url: finalImg,
          verification_note: noteIsImg ? null : row.verification_note
        };

        try {
          localStore.addMenuItem(createdItem);
        } catch (e) {}
        return createdItem;
      }
      if (res.error) console.error('Supabase addMenuItem error:', res.error.message);
    }
    return localStore.addMenuItem(itemData);
  },

  // Archive Menu Item (Soft Delete)
  async archiveMenuItem(id) {
    return this.updateMenuItem(id, { is_active: false });
  },

  // Restore Menu Item
  async restoreMenuItem(id) {
    return this.updateMenuItem(id, { is_active: true });
  },

  // Permanent Delete Menu Item
  async deleteMenuItem(id) {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id)
        .select();
      if (error) {
        console.error('Supabase deleteMenuItem error:', error.message);
        throw new Error(error.message);
      }
      try {
        localStore.deleteMenuItem(id);
      } catch (e) {
        // Ignored if already removed locally
      }
      return data && data.length > 0 ? data[0] : { id, deleted: true };
    }
    return localStore.deleteMenuItem(id);
  },

  // Create Category
  async createCategory({ name, slug, display_order }) {
    if (isConfigured) {
      const cleanName = (name || '').trim();
      if (!cleanName) throw new Error('Category name is required');

      let cleanSlug = slug || cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let order = display_order;
      if (typeof order !== 'number') {
        const { data: existingCats } = await supabase
          .from('menu_categories')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1);
        order = (existingCats && existingCats.length > 0 ? (existingCats[0].display_order || 0) : 0) + 1;
      }

      const { data, error } = await supabase
        .from('menu_categories')
        .insert([{ name: cleanName, slug: cleanSlug, display_order: order }])
        .select()
        .single();

      if (error) {
        console.error('Supabase createCategory error:', error.message);
        throw new Error(error.message);
      }
      try {
        localStore.createCategory(data);
      } catch (e) {
        // Ignored if already added locally
      }
      return data;
    }
    return localStore.createCategory({ name, slug, display_order });
  },

  // Toggle Availability
  async toggleAvailability(id, is_available) {
    return this.updateMenuItem(id, { is_available: Boolean(is_available) });
  },

  // Get Orders
  async getOrders(filters = {}) {
    if (isConfigured) {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (filters.table_number) {
        query = query.eq('table_number', Number(filters.table_number));
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map(o => ({
          ...o,
          items: o.order_items || []
        }));
      }
      if (error) {
        console.warn('Supabase getOrders notice (using synchronized cache):', error.message);
      }
    }
    return localStore.getOrders(filters);
  },

  // Reset All Order History
  async resetAllOrderHistory() {
    localStore.resetOrderHistory();
    if (isConfigured) {
      try {
        // Delete order items first due to foreign key constraints
        const { error: itemsErr } = await supabase
          .from('order_items')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (itemsErr) console.warn('Supabase reset order_items warning:', itemsErr.message);

        // Delete orders
        const { error: ordersErr } = await supabase
          .from('orders')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (ordersErr) console.warn('Supabase reset orders warning:', ordersErr.message);
      } catch (err) {
        console.error('Supabase resetAllOrderHistory error:', err.message);
        throw err;
      }
    }
    return { success: true };
  },

  // Get Order By ID (supports UUID or order_number)
  async getOrderById(id) {
    if (isConfigured) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
      let query = supabase.from('orders').select('*, order_items(*)');
      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('order_number', Number(id));
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        const remoteItems = data.order_items || [];
        const remoteSubtotal = remoteItems.reduce((s, i) => s + (Number(i.unit_price_snapshot) * Number(i.quantity)), 0);
        // If remote order_items is consistent with authoritative subtotal, sync and return
        if (remoteItems.length > 0 && Math.abs(remoteSubtotal - Number(data.subtotal)) < 0.01) {
          localStore.recordOrderSnapshot(data, remoteItems);
          return {
            ...data,
            items: remoteItems
          };
        }
        // If remote items are stale or desynced, synchronize with localStore cache
        const localOrder = localStore.getOrderById(id);
        if (localOrder && localOrder.items && localOrder.items.length > 0) {
          return {
            ...data,
            items: localOrder.items
          };
        }
        return {
          ...data,
          items: remoteItems
        };
      }
    }
    return localStore.getOrderById(id);
  },

  // Update Order Status (supports UUID or order_number)
  async updateOrderStatus(id, status) {
    if (isConfigured) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
      let query = supabase.from('orders').update({ status, updated_at: new Date().toISOString() });
      if (isUUID) {
        query = query.eq('id', id);
      } else {
        query = query.eq('order_number', Number(id));
      }
      const { data, error } = await query.select().maybeSingle();
      if (!error && data) {
        try {
          localStore.updateOrderStatus(data.id, status);
        } catch (e) {}
        return data;
      }
      if (error) console.error('Supabase updateOrderStatus error:', error.message);
    }
    return localStore.updateOrderStatus(id, status);
  },

  // Get Analytics
  async getAnalytics() {
    if (isConfigured && (!localStore.orders || localStore.orders.length === 0)) {
      try {
        const remoteOrders = await this.getOrders();
        if (remoteOrders && remoteOrders.length > 0) {
          remoteOrders.forEach(o => {
            localStore.recordOrderSnapshot(o, o.items || o.order_items || []);
          });
        }
      } catch (e) {}
    }
    return localStore.getAnalytics();
  },

  // Upload Menu Item Image to Supabase Storage with local filesystem fallback
  async uploadMenuItemImage(filename, buffer, contentType = 'image/webp') {
    if (isConfigured) {
      try {
        const cleanName = filename
          .toLowerCase()
          .replace(/[^a-z0-9.-]+/g, '-')
          .replace(/^-+|-+$/g, '');
        const storagePath = `uploads/${Date.now()}-${cleanName}`;

        const { data, error } = await supabase.storage
          .from('menu-items')
          .upload(storagePath, buffer, {
            contentType,
            upsert: true
          });

        if (!error && data) {
          const { data: publicData } = supabase.storage
            .from('menu-items')
            .getPublicUrl(storagePath);
          return { success: true, image_url: publicData.publicUrl };
        } else if (error) {
          console.warn('Supabase storage upload error:', error.message);
        }
      } catch (err) {
        console.warn('Supabase storage upload exception:', err.message);
      }
    }

    // Local filesystem fallback
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(__dirname, '..', 'public', 'images', 'menu', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const cleanName = filename.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
      const safeFilename = `${Date.now()}-${cleanName}`;
      const fullPath = path.join(uploadDir, safeFilename);
      fs.writeFileSync(fullPath, buffer);
      return { success: true, image_url: `/images/menu/uploads/${safeFilename}` };
    } catch (fsErr) {
      console.error('Local image save error:', fsErr.message);
      throw new Error(`Failed to upload image: ${fsErr.message}`);
    }
  }
};

// Pre-warm local store cache with remote Supabase data
if (isConfigured) {
  setTimeout(async () => {
    try {
      await module.exports.getCategories();
      await module.exports.getMenuItems(true);
      const remoteOrders = await module.exports.getOrders();
      if (remoteOrders && remoteOrders.length > 0) {
        remoteOrders.forEach(o => {
          localStore.recordOrderSnapshot(o, o.items || o.order_items || []);
        });
      }
      console.log('✅ Remote Supabase categories, menu items, and historical orders synced to memory cache.');
    } catch (err) {
      console.warn('⚠️ Supabase cache pre-warm notice:', err.message);
    }
  }, 100);
}
