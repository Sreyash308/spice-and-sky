/**
 * Owner & Admin Dashboard Logic
 * Business Intelligence | Menu CRUD | Order Snapshots | Realtime Synchronization
 */

document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  // Guard: Require ADMIN role
  const currentUser = SpiceClient.requireRole('ADMIN', '/admin/login');
  if (!currentUser) return;

  // Sign out button
  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    SpiceClient.signOut();
    window.location.href = '/admin/login';
  });

  // State
  let categories = [];
  let menuItems = [];
  let ordersList = [];
  let activeTab = 'dashboard';
  let activeModalOrder = null;

  // DOM Elements
  const kolkataTimeBadge = document.getElementById('kolkataTimeBadge');
  const navLinks = document.querySelectorAll('.nav-link');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const pageTitle = document.getElementById('pageTitle');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const adminSidebar = document.getElementById('adminSidebar');

  // Mobile Menu Toggle
  mobileMenuToggle.addEventListener('click', () => {
    adminSidebar.classList.toggle('open');
  });

  // Kolkata Live Clock
  function updateKolkataClock() {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now);
    kolkataTimeBadge.textContent = `IST: ${formatted}`;
  }
  setInterval(updateKolkataClock, 1000);
  updateKolkataClock();

  // Tab Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tabName = link.getAttribute('data-tab');
      switchTab(tabName);
      if (window.innerWidth <= 860) {
        adminSidebar.classList.remove('open');
      }
    });
  });

  function switchTab(tabName) {
    activeTab = tabName;
    navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-tab') === tabName));
    tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));

    const titles = {
      dashboard: 'Dashboard Overview',
      orders: 'Order History & Snapshots',
      menu: 'Menu Management',
      analytics: 'Sales Analytics',
      settings: 'Cafe & Profile Settings'
    };
    pageTitle.textContent = titles[tabName] || 'Dashboard';

    if (tabName === 'dashboard') loadDashboardData();
    else if (tabName === 'orders') loadOrdersData();
    else if (tabName === 'menu') loadMenuData();
    else if (tabName === 'analytics') loadAnalyticsData();
  }

  // Realtime Listeners
  SpiceClient.on('order_created', (data) => {
    SpiceClient.showPopup({
      title: 'New Order Received',
      message: `Order #${data.order?.order_number || ''} received from Table ${data.order?.table_number || ''}!`,
      type: 'category',
      icon: '🔔',
      duration: 4000
    });
    if (activeTab === 'dashboard') loadDashboardData();
    if (activeTab === 'orders') loadOrdersData();
  });

  SpiceClient.on('menu_updated', () => {
    if (activeTab === 'menu') loadMenuData();
  });

  // --- TAB 1: DASHBOARD ---
  async function loadDashboardData() {
    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json();
      if (json.success) {
        const a = json.data;

        // Metric Cards
        document.getElementById('kpiTodayRev').textContent = SpiceClient.formatCurrency(a.today?.revenue || 0);
        document.getElementById('kpiTodayOrders').textContent = `${a.today?.count || 0} orders today`;
        document.getElementById('kpiAvgBill').textContent = SpiceClient.formatCurrency(a.today?.averageBill || 0);

        document.getElementById('kpiWeekRev').textContent = SpiceClient.formatCurrency(a.weekly?.revenue || 0);
        document.getElementById('kpiWeekOrders').textContent = `${a.weekly?.count || 0} orders this week`;

        document.getElementById('kpiMonthRev').textContent = SpiceClient.formatCurrency(a.monthly?.revenue || 0);
        document.getElementById('kpiMonthOrders').textContent = `${a.monthly?.count || 0} orders this month`;

        document.getElementById('kpiAllTimeRev').textContent = SpiceClient.formatCurrency(a.allTime?.revenue || 0);
        document.getElementById('kpiAllTimeOrders').textContent = `${a.allTime?.count || 0} total orders`;

        // Recent Orders Feed
        const recentTbody = document.getElementById('dashboardRecentOrdersTbody');
        recentTbody.innerHTML = '';
        const recents = a.recentOrders || [];

        if (recents.length === 0) {
          recentTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No orders recorded yet.</td></tr>`;
        } else {
          recents.slice(0, 8).forEach(o => {
            const tr = document.createElement('tr');
            const itemsSummary = (o.items || o.order_items || []).map(i => `${i.quantity}x ${i.item_name_snapshot}`).join(', ') || 'No items';
            const timeStr = SpiceClient.formatDateTimeIST(o.created_at).split(',')[1] || '';

            tr.innerHTML = `
              <td><strong>#${o.order_number}</strong></td>
              <td><span class="pill pill-drink">Table ${o.table_number}</span></td>
              <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsSummary}">${itemsSummary}</td>
              <td style="font-weight: 700; color: var(--spice-gold);">${SpiceClient.formatCurrency(o.total)}</td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
              <td>
                <button type="button" class="btn btn-secondary view-dash-order-btn" style="padding: 4px 10px; font-size: 0.8rem;">View Bill</button>
              </td>
            `;

            tr.querySelector('.view-dash-order-btn').addEventListener('click', () => {
              openOrderModal(o);
            });

            recentTbody.appendChild(tr);
          });
        }

        // Top Selling
        const topList = document.getElementById('dashboardTopSellingList');
        topList.innerHTML = '';
        const topItems = a.topSellingItems || [];
        if (topItems.length === 0) {
          topList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No sales data available yet.</p>`;
        } else {
          topItems.slice(0, 5).forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.style.display = 'flex';
            itemDiv.style.justifyContent = 'space-between';
            itemDiv.style.padding = '8px 0';
            itemDiv.style.borderBottom = '1px solid var(--border-subtle)';
            itemDiv.innerHTML = `
              <span style="font-weight: 600; color: var(--text-white);">${item.name}</span>
              <span><strong>${item.quantity} sold</strong> &bull; <span style="color: var(--spice-gold); font-weight: 700;">${SpiceClient.formatCurrency(item.revenue)}</span></span>
            `;
            topList.appendChild(itemDiv);
          });
        }
      }
    } catch (err) {
      console.error('Error loading dashboard analytics:', err);
    }
  }

  document.getElementById('refreshDashboardBtn').addEventListener('click', () => loadDashboardData());

  // --- TAB 2: ORDERS MANAGEMENT ---
  const orderSearchInput = document.getElementById('orderSearchInput');
  const orderTableFilter = document.getElementById('orderTableFilter');
  const reloadOrdersBtn = document.getElementById('reloadOrdersBtn');
  const ordersTableTbody = document.getElementById('ordersTableTbody');

  reloadOrdersBtn.addEventListener('click', () => loadOrdersData());
  orderSearchInput.addEventListener('input', () => filterAndRenderOrders());
  orderTableFilter.addEventListener('change', () => filterAndRenderOrders());

  async function loadOrdersData() {
    ordersTableTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Fetching orders...</td></tr>`;
    try {
      const res = await fetch('/api/orders');
      const json = await res.json();
      if (json.success) {
        ordersList = json.data || [];
        filterAndRenderOrders();
      }
    } catch (err) {
      ordersTableTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">Failed to load orders.</td></tr>`;
    }
  }

  function filterAndRenderOrders() {
    const q = orderSearchInput.value.trim().toLowerCase();
    const tableF = orderTableFilter.value;

    const filtered = ordersList.filter(o => {
      if (tableF && String(o.table_number) !== tableF) return false;
      if (q) {
        const matchNum = String(o.order_number).includes(q);
        const matchWaiter = (o.waiter_name_snapshot || '').toLowerCase().includes(q);
        if (!matchNum && !matchWaiter) return false;
      }
      return true;
    });

    ordersTableTbody.innerHTML = '';
    if (filtered.length === 0) {
      ordersTableTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No matching orders found.</td></tr>`;
      return;
    }

    filtered.forEach(o => {
      const tr = document.createElement('tr');
      const itemsList = (o.items || []).map(i => `${i.quantity}x ${i.item_name_snapshot}${i.variant_name_snapshot ? ` (${i.variant_name_snapshot})` : ''}`).join(', ') || '<span style="color: var(--text-muted); font-style: italic;">No items recorded</span>';

      tr.innerHTML = `
        <td><strong>#${o.order_number}</strong></td>
        <td>${SpiceClient.formatDateTimeIST(o.created_at)}</td>
        <td><span class="pill pill-drink">Table ${o.table_number}</span></td>
        <td>${o.waiter_name_snapshot || 'Staff'}</td>
        <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${(o.items || []).map(i => `${i.quantity}x ${i.item_name_snapshot}`).join(', ')}">${itemsList}</td>
        <td style="font-weight: 700; color: var(--spice-gold); font-family: var(--font-heading);">${SpiceClient.formatCurrency(o.total)}</td>
        <td>
          <button type="button" class="btn btn-secondary view-order-btn" style="padding: 4px 10px; font-size: 0.8rem;">View Bill</button>
        </td>
      `;

      tr.querySelector('.view-order-btn').addEventListener('click', () => {
        openOrderModal(o);
      });

      ordersTableTbody.appendChild(tr);
    });
  }

  // Admin Order Detail Modal
  const adminOrderModal = document.getElementById('adminOrderModal');
  const adminModalTable = document.getElementById('adminModalTable');
  const adminModalOrderNum = document.getElementById('adminModalOrderNum');
  const adminModalDate = document.getElementById('adminModalDate');
  const adminModalTime = document.getElementById('adminModalTime');
  const adminModalWaiter = document.getElementById('adminModalWaiter');
  const adminModalItemsTbody = document.getElementById('adminModalItemsTbody');
  const adminModalTotal = document.getElementById('adminModalTotal');
  const adminPrintBillBtn = document.getElementById('adminPrintBillBtn');
  const closeAdminOrderModalBtn = document.getElementById('closeAdminOrderModalBtn');

  function openOrderModal(order) {
    if (!order) return;
    activeModalOrder = order;
    adminModalTable.textContent = `Table ${order.table_number}`;
    adminModalOrderNum.textContent = `Order #${order.order_number}`;
    adminModalDate.textContent = `Date: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[0]}`;
    adminModalTime.textContent = `Time: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[1] || ''}`;
    adminModalWaiter.textContent = `Waiter: ${order.waiter_name_snapshot || 'Staff'}`;
    adminModalTotal.textContent = SpiceClient.formatCurrency(order.total);

    adminModalItemsTbody.innerHTML = '';
    const items = order.items || order.order_items || [];
    if (items.length === 0) {
      adminModalItemsTbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 10px;">No items recorded for this order</td></tr>';
    } else {
      items.forEach(oi => {
        const tr = document.createElement('tr');
        const itemTitle = oi.item_name_snapshot + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
        tr.innerHTML = `
          <td>${itemTitle}</td>
          <td style="text-align: center;">${oi.quantity}</td>
          <td style="text-align: right;">${SpiceClient.formatCurrency(oi.line_total)}</td>
        `;
        adminModalItemsTbody.appendChild(tr);
      });
    }

    adminOrderModal.classList.add('active');
  }

  closeAdminOrderModalBtn.addEventListener('click', () => {
    adminOrderModal.classList.remove('active');
  });

  adminOrderModal.addEventListener('click', (e) => {
    if (e.target === adminOrderModal) {
      adminOrderModal.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && adminOrderModal.classList.contains('active')) {
      adminOrderModal.classList.remove('active');
    }
  });

  adminPrintBillBtn.addEventListener('click', () => {
    SpiceClient.printReceipt(document.getElementById('printableReceipt'));
  });

  // --- TAB 3: MENU MANAGEMENT ---
  const adminMenuSearch = document.getElementById('adminMenuSearch');
  const adminMenuCatFilter = document.getElementById('adminMenuCatFilter');
  const adminMenuDietFilter = document.getElementById('adminMenuDietFilter');
  const openAddItemModalBtn = document.getElementById('openAddItemModalBtn');
  const adminMenuTbody = document.getElementById('adminMenuTbody');

  const menuItemModal = document.getElementById('menuItemModal');
  const menuModalTitle = document.getElementById('menuModalTitle');
  const menuItemForm = document.getElementById('menuItemForm');
  const modalItemId = document.getElementById('modalItemId');
  const modalItemName = document.getElementById('modalItemName');
  const modalItemCategory = document.getElementById('modalItemCategory');
  const modalItemPrice = document.getElementById('modalItemPrice');
  const modalItemType = document.getElementById('modalItemType');
  const modalItemDesc = document.getElementById('modalItemDesc');
  const modalVerificationNote = document.getElementById('modalVerificationNote');
  const closeMenuModalBtn = document.getElementById('closeMenuModalBtn');

  const newCategoryGroup = document.getElementById('newCategoryGroup');
  const newCategoryName = document.getElementById('newCategoryName');
  const confirmCreateCategoryBtn = document.getElementById('confirmCreateCategoryBtn');

  adminMenuSearch.addEventListener('input', () => filterAndRenderMenu());
  adminMenuCatFilter.addEventListener('change', () => filterAndRenderMenu());
  adminMenuDietFilter.addEventListener('change', () => filterAndRenderMenu());

  openAddItemModalBtn.addEventListener('click', () => {
    openMenuModal();
  });

  closeMenuModalBtn.addEventListener('click', () => {
    menuItemModal.classList.remove('active');
  });

  // Toggle inline new category input when dropdown choice changes
  modalItemCategory.addEventListener('change', () => {
    if (modalItemCategory.value === '__NEW_CATEGORY__') {
      if (newCategoryGroup) {
        newCategoryGroup.style.display = 'block';
        if (newCategoryName) newCategoryName.focus();
      }
    } else {
      if (newCategoryGroup) newCategoryGroup.style.display = 'none';
    }
  });

  // Dedicated button to create new category immediately
  if (confirmCreateCategoryBtn) {
    confirmCreateCategoryBtn.addEventListener('click', async () => {
      const name = (newCategoryName.value || '').trim();
      if (!name) {
        alert('Please enter a name for the new category.');
        newCategoryName.focus();
        return;
      }

      try {
        confirmCreateCategoryBtn.disabled = true;
        confirmCreateCategoryBtn.textContent = 'Adding...';

        const res = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const json = await res.json();

        if (json.success && json.data) {
          const newCat = json.data;
          categories.push(newCat);

          // Add option to modal category dropdown right before '__NEW_CATEGORY__'
          const opt = document.createElement('option');
          opt.value = newCat.id;
          opt.textContent = newCat.name;
          const createOption = modalItemCategory.querySelector('option[value="__NEW_CATEGORY__"]');
          if (createOption) {
            modalItemCategory.insertBefore(opt, createOption);
          } else {
            modalItemCategory.appendChild(opt);
          }
          modalItemCategory.value = newCat.id;

          // Add to admin filter dropdown
          const filterOpt = document.createElement('option');
          filterOpt.value = newCat.id;
          filterOpt.textContent = newCat.name;
          adminMenuCatFilter.appendChild(filterOpt);

          if (newCategoryGroup) newCategoryGroup.style.display = 'none';
          newCategoryName.value = '';
          SpiceClient.showPopup({
            title: 'Category Created',
            message: `New category "${newCat.name}" is now ready for menu items.`,
            type: 'category',
            icon: '🏷️',
            duration: 4000
          });
        } else {
          throw new Error(json.error || 'Failed to create category.');
        }
      } catch (err) {
        alert(`Error creating category: ${err.message}`);
      } finally {
        confirmCreateCategoryBtn.disabled = false;
        confirmCreateCategoryBtn.textContent = 'Add';
      }
    });
  }

  menuItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = modalItemId.value;
    const isNew = !id;

    let categoryId = modalItemCategory.value;

    // If user left dropdown on '__NEW_CATEGORY__', create it on submit
    if (categoryId === '__NEW_CATEGORY__') {
      const newCatName = (newCategoryName.value || '').trim();
      if (!newCatName) {
        alert('Please enter a category name or select an existing category.');
        if (newCategoryName) newCategoryName.focus();
        return;
      }

      try {
        const catRes = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCatName })
        });
        const catJson = await catRes.json();
        if (!catJson.success) throw new Error(catJson.error || 'Failed to create category.');
        categoryId = catJson.data.id;
        categories.push(catJson.data);
      } catch (err) {
        alert(`Failed to create category: ${err.message}`);
        return;
      }
    }

    const payload = {
      name: modalItemName.value.trim(),
      category_id: categoryId,
      price: Number(modalItemPrice.value),
      food_type: modalItemType.value,
      description: modalItemDesc.value.trim(),
      verification_note: modalVerificationNote.value.trim() || null
    };

    try {
      const url = isNew ? '/api/admin/menu' : `/api/admin/menu/${id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        menuItemModal.classList.remove('active');
        SpiceClient.showPopup({
          title: isNew ? 'Item Added to Menu' : 'Menu Item Updated',
          message: isNew ? `"${payload.name}" has been added to the menu.` : `"${payload.name}" changes saved successfully.`,
          type: 'success',
          icon: isNew ? '✅' : '✏️',
          duration: 4000
        });
        loadMenuData();
      } else {
        throw new Error(json.error || 'Save failed.');
      }
    } catch (err) {
      alert(`Error saving item: ${err.message}`);
    }
  });

  async function loadMenuData() {
    try {
      const res = await fetch('/api/menu?include_archived=true');
      const json = await res.json();
      if (json.success) {
        categories = json.data.categories || [];
        menuItems = json.data.items || [];

        // Populate Category Filter dropdowns
        adminMenuCatFilter.innerHTML = `<option value="ALL">All Categories</option>`;
        modalItemCategory.innerHTML = '';
        categories.forEach(cat => {
          const opt1 = document.createElement('option');
          opt1.value = cat.id;
          opt1.textContent = cat.name;
          adminMenuCatFilter.appendChild(opt1);

          const opt2 = document.createElement('option');
          opt2.value = cat.id;
          opt2.textContent = cat.name;
          modalItemCategory.appendChild(opt2);
        });

        // Append "+ Create New Category..." option to item modal
        const newCatOpt = document.createElement('option');
        newCatOpt.value = '__NEW_CATEGORY__';
        newCatOpt.textContent = '➕ Create New Category...';
        newCatOpt.style.fontWeight = 'bold';
        newCatOpt.style.color = 'var(--spice-terracotta)';
        modalItemCategory.appendChild(newCatOpt);

        filterAndRenderMenu();
      }
    } catch (err) {
      console.error('Failed to load admin menu:', err);
    }
  }

  function filterAndRenderMenu() {
    const q = adminMenuSearch.value.trim().toLowerCase();
    const catF = adminMenuCatFilter.value;
    const dietF = adminMenuDietFilter.value;

    const filtered = menuItems.filter(item => {
      if (catF !== 'ALL' && item.category_id !== catF) return false;
      if (dietF !== 'ALL' && item.food_type !== dietF) return false;
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });

    // Sort items: UNAVAILABLE ITEMS FIRST (ALWAYS AT THE TOP IN ADMIN)
    filtered.sort((a, b) => {
      // 1. Availability: Unavailable (false) comes first (top)
      const aAvail = a.is_available ? 1 : 0;
      const bAvail = b.is_available ? 1 : 0;
      if (aAvail !== bAvail) {
        return aAvail - bAvail; // 0 before 1 -> unavailable first!
      }
      // 2. Active items before archived
      const aAct = a.is_active ? 1 : 0;
      const bAct = b.is_active ? 1 : 0;
      if (aAct !== bAct) {
        return bAct - aAct;
      }
      // 3. Category display order
      const catA = categories.find(c => c.id === a.category_id);
      const catB = categories.find(c => c.id === b.category_id);
      const orderA = catA ? catA.display_order : 999;
      const orderB = catB ? catB.display_order : 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // 4. Alphabetical by name
      return a.name.localeCompare(b.name);
    });

    adminMenuTbody.innerHTML = '';
    if (filtered.length === 0) {
      adminMenuTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No matching menu items found.</td></tr>`;
      return;
    }

    filtered.forEach(item => {
      const cat = categories.find(c => c.id === item.category_id);
      const tr = document.createElement('tr');
      if (!item.is_active) {
        tr.style.opacity = '0.5';
      } else if (!item.is_available) {
        tr.style.background = 'rgba(239, 68, 68, 0.04)';
      }

      let dietClass = 'veg';
      let dietLabel = 'VEG';
      if (item.food_type === 'NON_VEG') {
        dietClass = 'non-veg';
        dietLabel = 'NON-VEG';
      } else if (item.food_type === 'DRINK') {
        dietClass = 'drink';
        dietLabel = 'DRINK';
      } else if (item.food_type === 'NEEDS_CONFIRMATION') {
        dietClass = 'confirm';
        dietLabel = 'CONFIRM';
      }

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="badge-diet ${dietClass}"></span>
            <strong>${item.name}</strong>
            ${!item.is_available ? `<span class="pill pill-unavailable" style="font-size: 0.72rem; padding: 2px 6px;">UNAVAILABLE</span>` : ''}
          </div>
          ${item.verification_note ? `<div class="verification-alert">⚠️ ${item.verification_note}</div>` : ''}
          ${!item.is_active ? `<span class="pill pill-unavailable" style="margin-top: 4px;">ARCHIVED</span>` : ''}
        </td>
        <td>${cat ? cat.name : '--'}</td>
        <td><span class="pill pill-${dietClass}">${dietLabel}</span></td>
        <td style="font-weight: 700; color: var(--spice-gold); font-family: var(--font-heading);">${SpiceClient.formatCurrency(item.price)}</td>
        <td>
          <label class="switch">
            <input type="checkbox" class="avail-toggle" ${item.is_available ? 'checked' : ''} ${!item.is_active ? 'disabled' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary edit-item-btn" style="padding: 4px 8px; font-size: 0.8rem;">Edit</button>
            ${item.is_active
              ? `<button type="button" class="btn btn-danger archive-item-btn" style="padding: 4px 8px; font-size: 0.8rem;">Archive</button>`
              : `
                <button type="button" class="btn btn-primary restore-item-btn" style="padding: 4px 8px; font-size: 0.8rem;">Restore</button>
                <button type="button" class="btn delete-item-btn" style="padding: 4px 10px; font-size: 0.8rem; background: #ef4444; color: #ffffff; border: 1px solid #dc2626; font-weight: 700;" title="Permanently delete from database">Delete</button>
              `
            }
          </div>
        </td>
      `;

      // Availability switch toggle
      tr.querySelector('.avail-toggle').addEventListener('change', async (e) => {
        const isAvail = e.target.checked;
        item.is_available = isAvail;
        const mainItem = menuItems.find(m => m.id === item.id);
        if (mainItem) mainItem.is_available = isAvail;

        try {
          await fetch(`/api/admin/menu/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_available: isAvail })
          });
          SpiceClient.showPopup({
            title: isAvail ? 'Item Available' : 'Item Unavailable',
            message: `"${item.name}" is now marked ${isAvail ? 'AVAILABLE' : 'UNAVAILABLE'}.`,
            type: isAvail ? 'success' : 'warning',
            icon: isAvail ? '✅' : '⏸️',
            duration: 3500
          });
          filterAndRenderMenu(); // Re-sort so unavailable items remain at top
        } catch (err) {
          alert('Failed to update availability.');
          item.is_available = !isAvail;
          if (mainItem) mainItem.is_available = !isAvail;
          filterAndRenderMenu();
        }
      });

      // Edit item
      tr.querySelector('.edit-item-btn').addEventListener('click', () => {
        openMenuModal(item);
      });

      // Archive item (soft delete)
      const archiveBtn = tr.querySelector('.archive-item-btn');
      if (archiveBtn) {
        archiveBtn.addEventListener('click', async () => {
          if (confirm(`Archive "${item.name}"? It will be hidden from the menu but preserved in order history.`)) {
            try {
              await fetch(`/api/admin/menu/${item.id}`, { method: 'DELETE' });
              SpiceClient.showPopup({
                title: 'Item Archived',
                message: `"${item.name}" is now archived and hidden from active customer menus.`,
                type: 'warning',
                icon: '📦',
                duration: 4000
              });
              loadMenuData();
            } catch (err) {
              alert('Failed to archive item.');
            }
          }
        });
      }

      // Restore item
      const restoreBtn = tr.querySelector('.restore-item-btn');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', async () => {
          try {
            await fetch(`/api/admin/menu/${item.id}/restore`, { method: 'POST' });
            SpiceClient.showPopup({
              title: 'Item Restored',
              message: `"${item.name}" has been restored to the active menu.`,
              type: 'restore',
              icon: '♻️',
              duration: 4000
            });
            loadMenuData();
          } catch (err) {
            alert('Failed to restore item.');
          }
        });
      }

      // Permanent Delete item (unlocked after archiving)
      const deleteBtn = tr.querySelector('.delete-item-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`Permanently delete "${item.name}" from database?\n\nWARNING: This action cannot be undone. All variants will be deleted. Historical order summaries will remain preserved.`)) {
            try {
              const res = await fetch(`/api/admin/menu/${item.id}/permanent`, { method: 'DELETE' });
              const json = await res.json();
              if (json.success) {
                SpiceClient.showPopup({
                  title: 'Item Permanently Deleted',
                  message: `"${item.name}" has been permanently deleted from the database.`,
                  type: 'danger',
                  icon: '🗑️',
                  duration: 4000
                });
                loadMenuData();
              } else {
                alert(json.error || 'Failed to permanently delete item.');
              }
            } catch (err) {
              alert(`Error deleting item: ${err.message}`);
            }
          }
        });
      }

      adminMenuTbody.appendChild(tr);
    });
  }

  function openMenuModal(item = null) {
    if (newCategoryGroup) {
      newCategoryGroup.style.display = 'none';
    }
    if (newCategoryName) {
      newCategoryName.value = '';
    }

    if (item) {
      menuModalTitle.textContent = `Edit "${item.name}"`;
      modalItemId.value = item.id;
      modalItemName.value = item.name;
      modalItemCategory.value = item.category_id;
      modalItemPrice.value = item.price;
      modalItemType.value = item.food_type;
      modalItemDesc.value = item.description || '';
      modalVerificationNote.value = item.verification_note || '';
    } else {
      menuModalTitle.textContent = 'Add New Menu Item';
      modalItemId.value = '';
      modalItemName.value = '';
      if (categories.length > 0) modalItemCategory.value = categories[0].id;
      modalItemPrice.value = '199';
      modalItemType.value = 'VEG';
      modalItemDesc.value = '';
      modalVerificationNote.value = '';
    }
    menuItemModal.classList.add('active');
  }

  // --- TAB 4: ANALYTICS ---
  async function loadAnalyticsData() {
    const revDiv = document.getElementById('analyticsTopRevenue');
    const tableDiv = document.getElementById('analyticsTableBreakdown');
    if (revDiv) revDiv.innerHTML = '<p style="color: var(--text-muted);">Loading revenue analytics...</p>';
    if (tableDiv) tableDiv.innerHTML = '<p style="color: var(--text-muted);">Loading table analytics...</p>';

    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json();
      if (json.success) {
        const a = json.data;

        // 1. Top Revenue Generators (Prioritized First)
        if (revDiv) {
          revDiv.innerHTML = '';
          const topItems = a.topSellingItems || [];
          if (topItems.length === 0) {
            revDiv.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No revenue data recorded yet today.</p>';
          } else {
            const maxRev = Math.max(...topItems.map(i => Number(i.revenue) || 0), 1);
            topItems.forEach((item, idx) => {
              const row = document.createElement('div');
              row.className = 'analytics-revenue-row';
              row.style.display = 'flex';
              row.style.flexDirection = 'column';
              row.style.gap = '6px';
              row.style.padding = '10px 0';
              row.style.borderBottom = '1px solid var(--border-subtle)';

              const rank = idx + 1;
              const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
              const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
              const pct = Math.min(100, Math.round(((Number(item.revenue) || 0) / maxRev) * 100));

              row.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="rank-badge ${rankClass}">${rankIcon}</span>
                    <div>
                      <strong style="font-size: 0.95rem; color: var(--text-primary); display: block;">${item.name}</strong>
                      <span style="font-size: 0.78rem; color: var(--text-muted);">${item.quantity} orders fulfilled</span>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <span style="color: var(--spice-gold); font-weight: 800; font-size: 1.05rem; font-family: var(--font-heading);">${SpiceClient.formatCurrency(item.revenue)}</span>
                  </div>
                </div>
                <div style="background: var(--bg-secondary); border-radius: 9999px; height: 6px; overflow: hidden; width: 100%; margin-top: 2px;">
                  <div style="background: linear-gradient(90deg, var(--spice-terracotta), var(--spice-gold)); height: 100%; width: ${pct}%; border-radius: 9999px; transition: width 0.3s ease;"></div>
                </div>
              `;
              revDiv.appendChild(row);
            });
          }
        }

        // 2. Table Breakdown (Secondary)
        if (tableDiv) {
          tableDiv.innerHTML = '';
          (a.salesByTable || []).forEach(t => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '9px 0';
            row.style.borderBottom = '1px solid var(--border-subtle)';
            row.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="pill pill-drink" style="font-size: 0.75rem; padding: 2px 8px;">Table ${t.table_number}</span>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">${t.orders} orders</span>
              </div>
              <strong style="color: var(--spice-gold); font-family: var(--font-heading); font-size: 0.95rem;">${SpiceClient.formatCurrency(t.revenue)}</strong>
            `;
            tableDiv.appendChild(row);
          });
        }
      }
    } catch (err) {
      console.error('Failed to load analytics tab:', err);
    }
  }

  // Supabase Connection Status in Topbar & Settings
  async function updateSupabaseStatus() {
    const liveBadge = document.getElementById('supabaseLiveBadge');
    const settingsStatus = document.getElementById('supabaseSettingsStatus');

    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (json.success) {
        const cfg = json.data;
        if (cfg.isConfigured) {
          if (liveBadge) {
            liveBadge.className = 'supabase-badge connected';
            liveBadge.innerHTML = '🟢 Supabase: Connected';
          }
          if (settingsStatus) {
            settingsStatus.style.background = '#ecfdf5';
            settingsStatus.style.border = '1px solid #a7f3d0';
            settingsStatus.style.color = '#065f46';
            settingsStatus.innerHTML = `<strong>🟢 Connected to remote Supabase database.</strong><br>Project URL: <code>${cfg.supabaseUrl}</code><br>Realtime: <strong>Active</strong>`;
          }
        } else {
          if (liveBadge) {
            liveBadge.className = 'supabase-badge local';
            liveBadge.innerHTML = '🟡 Supabase: Local Mode';
          }
          if (settingsStatus) {
            settingsStatus.style.background = '#fffbeb';
            settingsStatus.style.border = '1px solid #fde68a';
            settingsStatus.style.color = '#92400e';
            settingsStatus.innerHTML = `<strong>🟡 Running in Local / Development Mode.</strong><br><code>SUPABASE_URL</code> is not set in <code>.env</code>. The application is running using the local PostgreSQL store so all features work. Once you paste your Supabase URL &amp; Key into <code>.env</code> and restart, it connects automatically.`;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to check Supabase status:', err);
    }
  }

  // Initial Load
  updateSupabaseStatus();
  loadDashboardData();
});
