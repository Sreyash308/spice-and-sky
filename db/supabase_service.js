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
        localStore.syncWithRemote({ items: data });
        return data;
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
        const item = allItems.find(i => i.id === oi.menu_item_id);
        const variants = item ? (item.menu_item_variants || []) : [];
        const variant = oi.variant_id ? variants.find(v => v.id === oi.variant_id) : null;
        const unitPrice = variant ? Number(variant.price) : (item ? Number(item.price) : 0);
        const qty = Math.max(1, Number(oi.quantity) || 1);
        const lineTotal = unitPrice * qty;
        calculatedSubtotal += lineTotal;
        return {
          menu_item_id: oi.menu_item_id,
          variant_id: oi.variant_id || null,
          item_name_snapshot: item ? item.name : 'Item',
          variant_name_snapshot: variant ? variant.name : null,
          unit_price_snapshot: unitPrice,
          quantity: qty,
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

      // 3. Authoritative Direct Insert into Supabase (Guaranteeing subtotal & total are never null)
      try {
        const orderPayload = {
          table_number: Number(params.table_number),
          waiter_id: validatedWaiterId,
          waiter_name_snapshot: params.waiter_name || 'Staff',
          status: 'CONFIRMED',
          subtotal: calculatedSubtotal,
          total: calculatedSubtotal, // Zero Tax, Zero GST, Zero Service Charges
          notes: params.notes || null,
          idempotency_key: params.idempotency_key || null
        };

        const { data: insertedOrder, error: orderErr } = await supabase
          .from('orders')
          .insert([orderPayload])
          .select()
          .single();

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
          const fullOrder = localStore.recordOrderSnapshot(insertedOrder, itemSnapshots);
          return fullOrder;
        }

        if (orderErr) {
          console.warn('Direct order insert warning:', orderErr.message);
        }
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

  // Update Menu Item
  async updateMenuItem(id, updates) {
    if (isConfigured) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_menu_item', {
          p_item_id: id,
          p_name: updates.name || null,
          p_price: updates.price !== undefined ? Number(updates.price) : null,
          p_description: updates.description || null,
          p_category_id: updates.category_id || null,
          p_food_type: updates.food_type || null,
          p_is_available: updates.is_available !== undefined ? Boolean(updates.is_available) : null,
          p_is_active: updates.is_active !== undefined ? Boolean(updates.is_active) : null,
          p_verification_note: updates.verification_note || null
        });
        if (!rpcError && rpcData) {
          try {
            localStore.updateMenuItem(id, updates);
          } catch (e) {}
          return rpcData;
        }
      } catch (e) {
        // RPC might not be deployed yet
      }

      const { data, error } = await supabase
        .from('menu_items')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();

      if (!error && data && data.length > 0) {
        try {
          localStore.updateMenuItem(id, updates);
        } catch (e) {}
        return data[0];
      }
      if (error) console.error('Supabase updateMenuItem error:', error.message);
    }
    return localStore.updateMenuItem(id, updates);
  },

  // Add Menu Item
  async addMenuItem(itemData) {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('menu_items')
        .insert([{
          category_id: itemData.category_id,
          name: itemData.name,
          description: itemData.description || '',
          price: Number(itemData.price) || 0,
          food_type: itemData.food_type || 'VEG',
          image_url: itemData.image_url || null,
          is_available: true,
          is_active: true,
          verification_note: itemData.verification_note || null
        }])
        .select()
        .single();
      if (!error && data) {
        try {
          localStore.addMenuItem(data);
        } catch (e) {}
        return data;
      }
      if (error) console.error('Supabase addMenuItem error:', error.message);
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
      if (!error && data && data.length > 0) {
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

  // Get Order By ID
  async getOrderById(id) {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', id)
        .single();
      if (!error && data) {
        return {
          ...data,
          items: data.order_items || []
        };
      }
    }
    return localStore.getOrderById(id);
  },

  // Update Order Status
  async updateOrderStatus(id, status) {
    if (isConfigured) {
      const { data, error } = await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        localStore.updateOrderStatus(id, status);
        return data;
      }
      if (error) console.error('Supabase updateOrderStatus error:', error.message);
    }
    return localStore.updateOrderStatus(id, status);
  },

  // Get Analytics
  async getAnalytics() {
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
