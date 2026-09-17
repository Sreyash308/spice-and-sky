/**
 * Owner & Admin Dashboard Logic
 * Business Intelligence | Menu CRUD | Order Snapshots | Realtime Synchronization
 */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;
  if (window.SpiceClient && !window.SpiceClient.escapeHtml) {
    window.SpiceClient.escapeHtml = escapeHtml;
  }
}

function getItemDietInfo(oi, allMenuItems) {
  let type = oi?.food_type;
  const itemsList = Array.isArray(allMenuItems) ? allMenuItems : (typeof menuItems !== 'undefined' && Array.isArray(menuItems) ? menuItems : []);
  
  if (!type && oi?.menu_item_id && itemsList.length > 0) {
    const found = itemsList.find(m => m.id === oi.menu_item_id);
    if (found) {
      type = found.food_type;
    }
  }
  if (!type) {
    const title = (oi?.item_name_snapshot || oi?.name || '').toLowerCase();
    if (title.includes('chicken') || title.includes('mutton') || title.includes('egg') || title.includes('fish') || title.includes('pepperoni') || title.includes('non-veg') || title.includes('non veg')) {
      type = 'NON_VEG';
    } else {
      type = 'VEG';
    }
  }

  const isNonVeg = type === 'NON_VEG';
  const isDrink = type === 'DRINK';

  return {
    food_type: type,
    isNonVeg,
    isVeg: !isNonVeg && !isDrink,
    isDrink,
    badgeClass: isNonVeg ? 'non-veg' : (isDrink ? 'drink' : 'veg'),
    label: isNonVeg ? 'Non-Veg' : (isDrink ? 'Drink' : 'Veg')
  };
}

if (typeof window !== 'undefined') {
  if (!window.getItemDietInfo) window.getItemDietInfo = getItemDietInfo;
  if (window.SpiceClient && !window.SpiceClient.getItemDietInfo) {
    window.SpiceClient.getItemDietInfo = getItemDietInfo;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  // Guard: Require ADMIN role
  const currentUser = SpiceClient.requireRole('ADMIN', '/admin/login');
  if (!currentUser) return;

  const adminBadge = document.getElementById('adminBadge');
  if (adminBadge && currentUser) {
    const adminName = currentUser.username || currentUser.display_name || 'admin@143';
    adminBadge.textContent = `👑 ${adminName}`;
  }

  // Sign out button
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await SpiceClient.signOut('ADMIN');
      window.location.replace('/admin/login');
    });
  }

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
    if (activeTab === 'dashboard') loadDashboardData();
    if (activeTab === 'orders') loadOrdersData();
  });

  SpiceClient.on('menu_updated', () => {
    if (activeTab === 'menu') loadMenuData();
  });

  // Helper: Extract complete payment breakdown safely from order attributes or notes fallback
  function getOrderPaymentBreakdown(o) {
    const total = Number(o && o.total != null ? o.total : 0) || 0;
    const notes = String((o && o.notes) || '');

    let mode = o && o.payment_mode ? String(o.payment_mode).toUpperCase() : null;
    if (!mode || mode === 'UNDEFINED' || mode === 'NULL') {
      if (/Payment:\s*SPLIT/i.test(notes)) mode = 'SPLIT';
      else if (/Payment:\s*CASH/i.test(notes)) mode = 'CASH';
      else if (/Payment:\s*ONLINE/i.test(notes)) mode = 'ONLINE';
      else mode = 'ONLINE';
    }

    let cash = (o && o.cash_amount != null && !isNaN(Number(o.cash_amount))) ? Number(o.cash_amount) : null;
    let online = (o && o.online_amount != null && !isNaN(Number(o.online_amount))) ? Number(o.online_amount) : null;

    if (mode === 'SPLIT') {
      const cashMatch = notes.match(/Cash:\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
      const onlineMatch = notes.match(/Online:\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
      if ((cash == null || cash === 0) && cashMatch) {
        cash = Number(cashMatch[1]);
      }
      if ((online == null || online === 0 || online === total) && onlineMatch) {
        online = Number(onlineMatch[1]);
      }
      if (cash != null && (online == null || online === total)) {
        online = Math.max(0, Math.round((total - cash) * 100) / 100);
      } else if (online != null && (cash == null || cash === 0)) {
        cash = Math.max(0, Math.round((total - online) * 100) / 100);
      }
    } else if (mode === 'CASH') {
      if (cash == null) cash = total;
      if (online == null) online = 0;
    } else {
      if (online == null) online = total;
      if (cash == null) cash = 0;
    }

    cash = (cash != null && !isNaN(cash)) ? Math.round(cash * 100) / 100 : 0;
    online = (online != null && !isNaN(online)) ? Math.round(online * 100) / 100 : (mode === 'CASH' ? 0 : total);

    return { mode, cash, online };
  }

  // Helper: Render consistent payment mode badge
  function formatPaymentPill(o) {
    if (o.status === 'CANCELLED' || o.payment_status === 'CANCELLED') {
      return `<span class="pill" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; font-size: 0.72rem; white-space: nowrap;">🚫 Cancelled</span>`;
    }
    if (o.status !== 'COMPLETED') {
      return `<span style="color: var(--text-muted); font-size: 0.78rem;">Pending</span>`;
    }
    const { mode, cash, online } = getOrderPaymentBreakdown(o);

    if (mode === 'SPLIT') {
      return `<span class="pill" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 0.72rem; white-space: nowrap;" title="Cash: ₹${cash}, Online: ₹${online}">⚖️ Split (₹${cash} C / ₹${online} O)</span>`;
    } else if (mode === 'CASH') {
      return `<span class="pill" style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-size: 0.72rem; white-space: nowrap;">💵 Cash (₹${cash})</span>`;
    } else {
      return `<span class="pill" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 0.72rem; white-space: nowrap;">📱 UPI (₹${online})</span>`;
    }
  }

  // --- TAB 1: DASHBOARD ---
  async function loadDashboardData() {
    try {
      const res = await fetch('/api/admin/analytics');
      const json = await res.json();
      if (json.success) {
        const a = json.data;

        // Metric Cards
        const activeServing = a.activeServing || { count: 0, runningTotal: 0, tables: [] };
        const activeServingRevEl = document.getElementById('kpiActiveServingRev');
        const activeServingCountEl = document.getElementById('kpiActiveServingCount');
        const tablesCount = activeServing.tablesCount || (new Set((activeServing.tables || []).map(t => t.table_number)).size);
        const orderCount = activeServing.count || 0;
        if (activeServingRevEl) activeServingRevEl.textContent = SpiceClient.formatCurrency(activeServing.runningTotal || 0);
        if (activeServingCountEl) activeServingCountEl.textContent = `${orderCount} active order${orderCount === 1 ? '' : 's'} (${tablesCount} table${tablesCount === 1 ? '' : 's'})`;

        document.getElementById('kpiTodayRev').textContent = SpiceClient.formatCurrency(a.today?.revenue || 0);
        document.getElementById('kpiTodayOrders').textContent = `${a.today?.count || 0} orders today`;

        const todayCashRevEl = document.getElementById('kpiTodayCashRev');
        const todayCashOrdersEl = document.getElementById('kpiTodayCashOrders');
        const todayOnlineRevEl = document.getElementById('kpiTodayOnlineRev');
        const todayOnlineOrdersEl = document.getElementById('kpiTodayOnlineOrders');

        if (todayCashRevEl) todayCashRevEl.textContent = SpiceClient.formatCurrency(a.today?.cashRevenue || 0);
        if (todayCashOrdersEl) todayCashOrdersEl.textContent = `${a.today?.cashOrders || 0} cash orders`;
        if (todayOnlineRevEl) todayOnlineRevEl.textContent = SpiceClient.formatCurrency(a.today?.onlineRevenue || 0);
        if (todayOnlineOrdersEl) todayOnlineOrdersEl.textContent = `${a.today?.onlineOrders || 0} online orders`;

        document.getElementById('kpiAvgBill').textContent = SpiceClient.formatCurrency(a.today?.averageBill || 0);

        document.getElementById('kpiWeekRev').textContent = SpiceClient.formatCurrency(a.weekly?.revenue || 0);
        document.getElementById('kpiWeekOrders').textContent = `${a.weekly?.count || 0} orders this week`;

        document.getElementById('kpiMonthRev').textContent = SpiceClient.formatCurrency(a.monthly?.revenue || 0);
        document.getElementById('kpiMonthOrders').textContent = `${a.monthly?.count || 0} orders this month`;

        document.getElementById('kpiAllTimeRev').textContent = SpiceClient.formatCurrency(a.allTime?.revenue || 0);
        document.getElementById('kpiAllTimeOrders').textContent = `${a.allTime?.count || 0} total orders`;

        // Currently Serving Tables Monitor
        const servingContainer = document.getElementById('servingTablesContainer');
        const servingBadge = document.getElementById('servingTablesSummaryBadge');
        if (servingBadge) servingBadge.textContent = `${orderCount} Active`;

        if (servingContainer) {
          servingContainer.innerHTML = '';
          if (!activeServing.tables || activeServing.tables.length === 0) {
            servingContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem; grid-column: 1 / -1; margin: 0;">No tables currently serving right now.</p>`;
          } else {
            activeServing.tables.forEach(t => {
              const card = document.createElement('div');
              card.style.cssText = 'background: #ffffff; border: 1.5px solid #86efac; border-radius: 12px; padding: 12px 14px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.08); display: flex; justify-content: space-between; align-items: center;';
              card.innerHTML = `
                <div>
                  <div style="font-weight: 800; font-family: var(--font-heading); color: #15803d; font-size: 1.05rem;">
                    Table ${t.table_number} <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">#${t.order_number}</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                    ${t.itemCount} items &bull; <strong style="color: var(--spice-gold); font-size: 0.9rem;">${SpiceClient.formatCurrency(t.total)}</strong>
                  </div>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="btn btn-secondary view-serving-btn" style="padding: 4px 8px; font-size: 0.78rem;">View</button>
                  <button type="button" class="btn btn-primary complete-serving-btn" style="padding: 4px 8px; font-size: 0.78rem; background: #16a34a; border-color: #16a34a;">⚡ Bill</button>
                  <button type="button" class="btn btn-danger cancel-serving-btn" style="padding: 4px 8px; font-size: 0.78rem;">Cancel</button>
                </div>
              `;

              card.querySelector('.view-serving-btn').addEventListener('click', async () => {
                const fullOrder = await fetchOrderDetails(t.id || t.order_number);
                if (fullOrder) openOrderModal(fullOrder);
              });

              card.querySelector('.complete-serving-btn').addEventListener('click', async () => {
                if (confirm(`Complete bill for Table ${t.table_number} (Order #${t.order_number})?`)) {
                  await completeOrderDirect(t.id || t.order_number);
                }
              });

              card.querySelector('.cancel-serving-btn').addEventListener('click', async () => {
                if (confirm(`Are you sure you want to CANCEL Order #${t.order_number} for Table ${t.table_number}? This action cannot be undone.`)) {
                  await cancelOrderDirect(t.id || t.order_number);
                }
              });

              servingContainer.appendChild(card);
            });
          }
        }

        // Recent Orders Feed (highest order number down to num - 9)
        const recentTbody = document.getElementById('dashboardRecentOrdersTbody');
        recentTbody.innerHTML = '';
        const recents = (a.recentOrders || [])
          .sort((a, b) => Number(b.order_number || 0) - Number(a.order_number || 0));

        if (recents.length === 0) {
          recentTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No orders recorded yet.</td></tr>`;
        } else {
          recents.slice(0, 10).forEach(o => {
            const tr = document.createElement('tr');
            const orderItemList = (o.items && o.items.length > 0) ? o.items : (o.order_items && o.order_items.length > 0 ? o.order_items : []);
            const rawSummary = orderItemList.length > 0
              ? orderItemList.map(i => `${i.quantity}x ${i.item_name_snapshot || i.name || 'Item'}`).join(', ')
              : (Number(o.total) > 0 ? `Cafe Dining (${SpiceClient.formatCurrency(o.total)})` : 'No items');
            const itemsSummary = orderItemList.length > 0
              ? orderItemList.map(i => `${i.quantity}x ${SpiceClient.escapeHtml(i.item_name_snapshot || i.name || 'Item')}`).join(', ')
              : (Number(o.total) > 0 ? `Cafe Dining (${SpiceClient.formatCurrency(o.total)})` : 'No items');
            const timeStr = SpiceClient.formatDateTimeIST(o.created_at).split(',')[1] || '';
            const isCompleted = o.status === 'COMPLETED';
            const isServing = !isCompleted && o.status !== 'CANCELLED';
            const statusPill = isCompleted
              ? '<span class="pill pill-veg" style="font-size: 0.75rem;">✅ Completed</span>'
              : (o.status === 'CANCELLED' 
                ? '<span class="pill pill-non-veg" style="font-size: 0.75rem;">❌ Cancelled</span>'
                : '<span class="pill" style="background: rgba(22, 163, 74, 0.12); color: #16a34a; border: 1px solid rgba(22, 163, 74, 0.3); font-size: 0.75rem;">🟢 Serving</span>');

            tr.innerHTML = `
              <td><strong>#${o.order_number}</strong></td>
              <td><span class="pill pill-drink">Table ${o.table_number}</span></td>
              <td>${statusPill}</td>
              <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${SpiceClient.escapeHtml(rawSummary)}">${itemsSummary}</td>
              <td style="font-weight: 700; color: var(--spice-gold);">${SpiceClient.formatCurrency(o.total)}</td>
              <td>${formatPaymentPill(o)}</td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
              <td>
                <button type="button" class="btn btn-secondary view-dash-order-btn" style="padding: 4px 8px; font-size: 0.8rem;">View</button>
                ${isServing ? `
                  <button type="button" class="btn btn-primary complete-dash-order-btn" style="padding: 4px 8px; font-size: 0.8rem; background: #16a34a; border-color: #16a34a; margin-left: 4px;">⚡ Bill</button>
                  <button type="button" class="btn btn-danger cancel-dash-order-btn" style="padding: 4px 8px; font-size: 0.8rem; margin-left: 4px;">Cancel</button>
                ` : ''}
              </td>
            `;

            tr.querySelector('.view-dash-order-btn').addEventListener('click', () => {
              openOrderModal(o);
            });

            const completeBtn = tr.querySelector('.complete-dash-order-btn');
            if (completeBtn) {
              completeBtn.addEventListener('click', async () => {
                if (confirm(`Complete bill for Table ${o.table_number} (Order #${o.order_number})?`)) {
                  await completeOrderDirect(o.id);
                }
              });
            }

            const cancelBtn = tr.querySelector('.cancel-dash-order-btn');
            if (cancelBtn) {
              cancelBtn.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to CANCEL Order #${o.order_number} for Table ${o.table_number}? This action cannot be undone.`)) {
                  await cancelOrderDirect(o.id);
                }
              });
            }

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
  const orderStatusFilter = document.getElementById('orderStatusFilter');
  const reloadOrdersBtn = document.getElementById('reloadOrdersBtn');
  const ordersTableTbody = document.getElementById('ordersTableTbody');

  reloadOrdersBtn.addEventListener('click', () => loadOrdersData());
  orderSearchInput.addEventListener('input', () => filterAndRenderOrders());
  orderTableFilter.addEventListener('change', () => filterAndRenderOrders());
  if (orderStatusFilter) orderStatusFilter.addEventListener('change', () => filterAndRenderOrders());

  async function loadOrdersData() {
    ordersTableTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Fetching orders...</td></tr>`;
    try {
      const res = await fetch('/api/orders');
      const json = await res.json();
      if (json.success) {
        ordersList = (json.data || []).sort((a, b) => Number(b.order_number || 0) - Number(a.order_number || 0));
        filterAndRenderOrders();
      }
    } catch (err) {
      ordersTableTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">Failed to load orders.</td></tr>`;
    }
  }

  function filterAndRenderOrders() {
    const q = orderSearchInput.value.trim().toLowerCase();
    const tableF = orderTableFilter.value;
    const statusF = orderStatusFilter ? orderStatusFilter.value : '';

    const filtered = ordersList.filter(o => {
      if (tableF && String(o.table_number) !== tableF) return false;
      if (statusF) {
        if (statusF === 'SERVING') {
          if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return false;
        } else if (o.status !== statusF) {
          return false;
        }
      }
      if (q) {
        const matchNum = String(o.order_number).includes(q);
        const matchWaiter = (o.waiter_name_snapshot || '').toLowerCase().includes(q);
        if (!matchNum && !matchWaiter) return false;
      }
      return true;
    });

    ordersTableTbody.innerHTML = '';
    if (filtered.length === 0) {
      ordersTableTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No matching orders found.</td></tr>`;
      return;
    }

    filtered.forEach(o => {
      const tr = document.createElement('tr');
      const orderItemList = (o.items && o.items.length > 0) ? o.items : (o.order_items && o.order_items.length > 0 ? o.order_items : []);
      const rawItemsList = orderItemList.length > 0
        ? orderItemList.map(i => `${i.quantity}x ${i.item_name_snapshot || i.name || 'Item'}${i.variant_name_snapshot ? ` (${i.variant_name_snapshot})` : ''}`).join(', ')
        : (Number(o.total) > 0 ? `Cafe Dining (${SpiceClient.formatCurrency(o.total)})` : 'No items recorded');
      const itemsList = orderItemList.length > 0
        ? orderItemList.map(i => `${i.quantity}x ${SpiceClient.escapeHtml(i.item_name_snapshot || i.name || 'Item')}${i.variant_name_snapshot ? ` (${SpiceClient.escapeHtml(i.variant_name_snapshot)})` : ''}`).join(', ')
        : (Number(o.total) > 0 ? `<span style="color: var(--text-secondary); font-weight: 500;">Cafe Dining (${SpiceClient.formatCurrency(o.total)})</span>` : '<span style="color: var(--text-muted); font-style: italic;">No items recorded</span>');
      const isCompleted = o.status === 'COMPLETED';
      const isServing = !isCompleted && o.status !== 'CANCELLED';
      const statusPill = isCompleted
        ? '<span class="pill pill-veg" style="font-size: 0.75rem;">✅ Completed</span>'
        : (o.status === 'CANCELLED'
          ? '<span class="pill pill-non-veg" style="font-size: 0.75rem;">❌ Cancelled</span>'
          : '<span class="pill" style="background: rgba(22, 163, 74, 0.12); color: #16a34a; border: 1px solid rgba(22, 163, 74, 0.3); font-size: 0.75rem;">🟢 Serving</span>');

      tr.innerHTML = `
        <td><strong>#${o.order_number}</strong></td>
        <td>${SpiceClient.formatDateTimeIST(o.created_at)}</td>
        <td><span class="pill pill-drink">Table ${o.table_number}</span></td>
        <td>${statusPill}</td>
        <td>${SpiceClient.escapeHtml(o.waiter_name_snapshot || 'Staff')}</td>
        <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${SpiceClient.escapeHtml(rawItemsList)}">${itemsList}</td>
        <td style="font-weight: 700; color: var(--spice-gold); font-family: var(--font-heading);">${SpiceClient.formatCurrency(o.total)}</td>
        <td>${formatPaymentPill(o)}</td>
        <td>
          <button type="button" class="btn btn-secondary view-order-btn" style="padding: 4px 8px; font-size: 0.8rem;">View Bill</button>
          ${isServing ? `
            <button type="button" class="btn btn-primary complete-order-btn" style="padding: 4px 8px; font-size: 0.8rem; background: #16a34a; border-color: #16a34a; margin-left: 4px;">⚡ Bill</button>
            <button type="button" class="btn btn-danger cancel-order-btn" style="padding: 4px 8px; font-size: 0.8rem; margin-left: 4px;">Cancel</button>
          ` : ''}
        </td>
      `;

      tr.querySelector('.view-order-btn').addEventListener('click', () => {
        openOrderModal(o);
      });

      const completeBtn = tr.querySelector('.complete-order-btn');
      if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
          if (confirm(`Complete bill for Table ${o.table_number} (Order #${o.order_number})?`)) {
            await completeOrderDirect(o.id);
          }
        });
      }

      const cancelBtn = tr.querySelector('.cancel-order-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to CANCEL Order #${o.order_number} for Table ${o.table_number}? This action cannot be undone.`)) {
            await cancelOrderDirect(o.id);
          }
        });
      }

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
  const adminModalStatus = document.getElementById('adminModalStatus');
  const adminModalItemsTbody = document.getElementById('adminModalItemsTbody');
  const adminModalTotal = document.getElementById('adminModalTotal');
  const adminModalSubtotalRow = document.getElementById('adminModalSubtotalRow');
  const adminModalSubtotal = document.getElementById('adminModalSubtotal');
  const adminModalDiscountRow = document.getElementById('adminModalDiscountRow');
  const adminModalDiscountLabel = document.getElementById('adminModalDiscountLabel');
  const adminModalDiscountAmount = document.getElementById('adminModalDiscountAmount');
  const adminPrintBillBtn = document.getElementById('adminPrintBillBtn');
  const adminCompleteBillBtn = document.getElementById('adminCompleteBillBtn');
  const closeAdminOrderModalBtn = document.getElementById('closeAdminOrderModalBtn');

  async function fetchOrderDetails(idOrNum) {
    try {
      const res = await fetch(`/api/orders/${idOrNum}`);
      const json = await res.json();
      return json.success ? json.data : null;
    } catch (e) {
      return null;
    }
  }

  async function completeOrderDirect(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to complete order.');
      alert(`✅ Order #${json.data.order_number} completed and added to permanent history!`);
      loadDashboardData();
      loadOrdersData();
    } catch (err) {
      alert(`Error completing bill: ${err.message}`);
    }
  }

  async function cancelOrderDirect(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to cancel order.');
      alert(`❌ Order #${json.data ? json.data.order_number : ''} has been cancelled.`);
      loadDashboardData();
      loadOrdersData();
    } catch (err) {
      alert(`Error cancelling order: ${err.message}`);
    }
  }

  function openOrderModal(order) {
    if (!order) return;
    activeModalOrder = order;
    adminModalTable.textContent = `Table ${order.table_number}`;
    adminModalOrderNum.textContent = `Order #${order.order_number}`;
    adminModalDate.textContent = `Date: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[0]}`;
    adminModalTime.textContent = `Time: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[1] || ''}`;
    adminModalWaiter.textContent = `Server: ${order.waiter_name_snapshot || 'Staff'}`;

    if (adminModalStatus) {
      const isCompleted = order.status === 'COMPLETED';
      const isCancelled = order.status === 'CANCELLED' || order.payment_status === 'CANCELLED';
      if (isCancelled) {
        adminModalStatus.textContent = 'Status: CANCELLED (Payment: Cancelled)';
        adminModalStatus.style.color = '#dc2626';
      } else if (isCompleted) {
        adminModalStatus.textContent = 'Status: COMPLETED';
        adminModalStatus.style.color = '#16a34a';
      } else {
        adminModalStatus.textContent = 'Status: CURRENTLY SERVING';
        adminModalStatus.style.color = 'var(--spice-gold)';
      }
    }

    if (adminCompleteBillBtn) {
      const isServing = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
      adminCompleteBillBtn.style.display = isServing ? 'inline-block' : 'none';
      adminCompleteBillBtn.onclick = async () => {
        if (confirm(`Complete bill for Table ${order.table_number} (Order #${order.order_number})?`)) {
          await completeOrderDirect(order.id);
          adminOrderModal.classList.remove('active');
        }
      };
    }

    const adminCancelBillBtn = document.getElementById('adminCancelBillBtn');
    if (adminCancelBillBtn) {
      const isServing = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
      adminCancelBillBtn.style.display = isServing ? 'inline-block' : 'none';
      adminCancelBillBtn.onclick = async () => {
        if (confirm(`Are you sure you want to CANCEL Order #${order.order_number} for Table ${order.table_number}? This action cannot be undone.`)) {
          await cancelOrderDirect(order.id);
          adminOrderModal.classList.remove('active');
        }
      };
    }

    const subtotal = Number(order.subtotal != null ? order.subtotal : (order.total || 0));
    let discPct = Number(order.discount_percent || 0);
    let discAmt = Number(order.discount_amount || 0);

    if (discPct === 0 && order.notes) {
      const match = String(order.notes).match(/Discount:\s*([0-9]+(?:\.[0-9]+)?)%\s*(?:\(-?(?:₹|Rs\.?)?([0-9]+(?:\.[0-9]+)?)\))?/i);
      if (match) {
        discPct = parseFloat(match[1]) || 0;
        if (match[2]) discAmt = parseFloat(match[2]) || 0;
      }
    }

    if (discPct > 0 && discAmt === 0) {
      discAmt = Math.round((subtotal * discPct / 100) * 100) / 100;
    }
    const finalTotal = Number(order.total != null ? order.total : Math.max(0, subtotal - discAmt));
    const hasDiscount = (discPct > 0 || discAmt > 0);

    if (adminModalSubtotalRow) {
      adminModalSubtotalRow.style.display = hasDiscount ? 'table-row' : 'none';
    }
    if (adminModalDiscountRow) {
      adminModalDiscountRow.style.display = hasDiscount ? 'table-row' : 'none';
    }

    if (hasDiscount) {
      if (adminModalSubtotal) adminModalSubtotal.textContent = SpiceClient.formatCurrency(subtotal);
      if (adminModalDiscountLabel) adminModalDiscountLabel.textContent = `Discount (${discPct}%):`;
      if (adminModalDiscountAmount) {
        adminModalDiscountAmount.textContent = `-${SpiceClient.formatCurrency(discAmt)}`;
        adminModalDiscountAmount.style.color = '#15803d';
      }
    }
    adminModalTotal.textContent = SpiceClient.formatCurrency(finalTotal);

    adminModalItemsTbody.innerHTML = '';
    const items = (order.items && order.items.length > 0) ? order.items : (order.order_items && order.order_items.length > 0 ? order.order_items : []);
    if (items.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="2" style="color: var(--text-secondary); font-weight: 600;">Standard Cafe Order (Table ${order.table_number})</td>
        <td style="text-align: right; font-weight: 700;">${SpiceClient.formatCurrency(order.total)}</td>
      `;
      adminModalItemsTbody.appendChild(tr);
    } else {
      items.forEach(oi => {
        const tr = document.createElement('tr');
        const diet = getItemDietInfo(oi, menuItems);
        const rawTitle = (oi.item_name_snapshot || oi.name || 'Item') + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
        const itemTitle = SpiceClient.escapeHtml(rawTitle);
        const lineTotal = (oi.line_total !== undefined && oi.line_total !== null) 
          ? Number(oi.line_total) 
          : ((Number(oi.unit_price_snapshot || oi.price || 0)) * Number(oi.quantity || 1));
        tr.innerHTML = `
          <td>
            <div class="receipt-item-line">
              <span class="bill-diet-badge ${diet.badgeClass}" title="${diet.label}">
                <span class="diet-shape"></span>
              </span>
              <span class="bill-item-name">${itemTitle}</span>
            </div>
          </td>
          <td style="text-align: center; vertical-align: top;">${oi.quantity || 1}</td>
          <td style="text-align: right; vertical-align: top; font-weight: 600;">${SpiceClient.formatCurrency(lineTotal)}</td>
        `;
        adminModalItemsTbody.appendChild(tr);
      });
    }

    // Render Payment Details on Admin Printable/Screen Receipt
    const adminBillPaymentBox = document.getElementById('adminBillPaymentBox');
    const adminBillPaymentModeText = document.getElementById('adminBillPaymentModeText');
    const adminBillCashRow = document.getElementById('adminBillCashRow');
    const adminBillCashPaidText = document.getElementById('adminBillCashPaidText');
    const adminBillOnlineRow = document.getElementById('adminBillOnlineRow');
    const adminBillOnlinePaidText = document.getElementById('adminBillOnlinePaidText');

    if (adminBillPaymentBox) {
      const { mode, cash, online } = getOrderPaymentBreakdown(order);

      if (adminBillPaymentModeText) {
        if (mode === 'SPLIT') {
          adminBillPaymentModeText.textContent = 'PARTIAL (CASH + UPI)';
        } else if (mode === 'ONLINE') {
          adminBillPaymentModeText.textContent = 'UPI / ONLINE';
        } else {
          adminBillPaymentModeText.textContent = 'FULL CASH';
        }
      }

      if (adminBillCashRow && adminBillCashPaidText) {
        if (mode === 'SPLIT' || mode === 'CASH') {
          adminBillCashRow.style.display = 'flex';
          adminBillCashPaidText.textContent = SpiceClient.formatCurrency(cash);
        } else {
          adminBillCashRow.style.display = 'none';
        }
      }

      if (adminBillOnlineRow && adminBillOnlinePaidText) {
        if (mode === 'SPLIT' || mode === 'ONLINE') {
          adminBillOnlineRow.style.display = 'flex';
          adminBillOnlinePaidText.textContent = SpiceClient.formatCurrency(online);
        } else {
          adminBillOnlineRow.style.display = 'none';
        }
      }
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

  // Modal Image Upload & Preview Controls
  const modalChooseImageBtn = document.getElementById('modalChooseImageBtn');
  const modalItemImageFile = document.getElementById('modalItemImageFile');
  const modalChooseImageText = document.getElementById('modalChooseImageText');
  const modalRemoveImageBtn = document.getElementById('modalRemoveImageBtn');
  const modalItemImageUrl = document.getElementById('modalItemImageUrl');
  const modalItemImageValue = document.getElementById('modalItemImageValue');
  const modalImagePreview = document.getElementById('modalImagePreview');
  const modalImagePlaceholder = document.getElementById('modalImagePlaceholder');
  const modalImageStatusBadge = document.getElementById('modalImageStatusBadge');
  const saveMenuItemBtn = document.getElementById('saveMenuItemBtn');

  let selectedImageBase64 = null;
  let selectedImageFilename = null;
  let selectedImageMime = 'image/webp';

  function setModalImagePreview(url, statusText = 'Custom image', isNewUpload = false) {
    if (url && url.trim().length > 0) {
      modalImagePreview.src = url;
      modalImagePreview.style.display = 'block';
      modalImagePlaceholder.style.display = 'none';
      modalItemImageValue.value = url;
      if (modalChooseImageText) modalChooseImageText.textContent = 'Change Image';
      if (modalRemoveImageBtn) modalRemoveImageBtn.style.display = 'inline-flex';
      if (modalImageStatusBadge) {
        modalImageStatusBadge.textContent = statusText;
        modalImageStatusBadge.style.color = '#15803d';
        modalImageStatusBadge.style.background = '#f0fdf4';
      }
    } else {
      modalImagePreview.src = '';
      modalImagePreview.style.display = 'none';
      modalImagePlaceholder.style.display = 'block';
      modalItemImageValue.value = '';
      if (modalItemImageUrl) modalItemImageUrl.value = '';
      if (modalItemImageFile) modalItemImageFile.value = '';
      if (modalChooseImageText) modalChooseImageText.textContent = 'Upload Image';
      if (modalRemoveImageBtn) modalRemoveImageBtn.style.display = 'none';
      if (modalImageStatusBadge) {
        modalImageStatusBadge.textContent = 'Default fallback';
        modalImageStatusBadge.style.color = 'var(--text-muted)';
        modalImageStatusBadge.style.background = 'rgba(0,0,0,0.04)';
      }
    }
  }

  function compressImage(dataUrl, maxWidth, maxHeight, quality, callback) {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const mime = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/webp';
      const output = canvas.toDataURL(mime, quality);
      callback(output);
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
  }

  if (modalChooseImageBtn && modalItemImageFile) {
    modalChooseImageBtn.addEventListener('click', () => {
      modalItemImageFile.click();
    });

    modalItemImageFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const rawDataUrl = event.target.result;
        compressImage(rawDataUrl, 800, 800, 0.85, (compressed) => {
          selectedImageBase64 = compressed;
          selectedImageFilename = file.name;
          selectedImageMime = file.type || 'image/webp';
          setModalImagePreview(compressed, 'New image ready', true);
          if (modalItemImageUrl) modalItemImageUrl.value = '';
        });
      };
      reader.readAsDataURL(file);
    });
  }

  if (modalItemImageUrl) {
    modalItemImageUrl.addEventListener('input', () => {
      const url = modalItemImageUrl.value.trim();
      if (url) {
        selectedImageBase64 = null;
        selectedImageFilename = null;
        setModalImagePreview(url, 'URL image linked');
      } else if (!selectedImageBase64) {
        setModalImagePreview(null);
      }
    });
  }

  if (modalRemoveImageBtn) {
    modalRemoveImageBtn.addEventListener('click', () => {
      selectedImageBase64 = null;
      selectedImageFilename = null;
      setModalImagePreview(null);
    });
  }

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

    // If a new image was selected from disk, upload it first
    let finalImageUrl = modalItemImageValue.value ? modalItemImageValue.value.trim() : null;

    if (selectedImageBase64) {
      try {
        if (saveMenuItemBtn) {
          saveMenuItemBtn.disabled = true;
          saveMenuItemBtn.textContent = 'Uploading Image...';
        }
        const uploadRes = await fetch('/api/admin/menu/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_data: selectedImageBase64,
            filename: selectedImageFilename || 'menu-item.webp',
            content_type: selectedImageMime
          })
        });
        const uploadJson = await uploadRes.json();
        if (uploadJson.success && uploadJson.image_url) {
          finalImageUrl = uploadJson.image_url;
        } else {
          console.warn('Image upload error:', uploadJson.error);
        }
      } catch (uploadErr) {
        console.warn('Image upload exception:', uploadErr.message);
      } finally {
        if (saveMenuItemBtn) {
          saveMenuItemBtn.disabled = false;
          saveMenuItemBtn.textContent = 'Save Changes';
        }
      }
    }

    const payload = {
      name: modalItemName.value.trim(),
      category_id: categoryId,
      price: Number(modalItemPrice.value),
      food_type: modalItemType.value,
      description: modalItemDesc.value.trim(),
      image_url: finalImageUrl,
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

      const catName = cat ? cat.name : '';
      const tableImgUrl = (window.SpiceSkyImages && window.SpiceSkyImages.getMenuItemImageUrl)
        ? window.SpiceSkyImages.getMenuItemImageUrl(item, catName)
        : (item.image_url || '/images/menu/fallbacks/food.webp');

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${tableImgUrl}" alt="${SpiceClient.escapeHtml(item.name)}" style="width: 38px; height: 38px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-subtle); flex-shrink: 0; background: #faf8f5;" onerror="this.src='/images/menu/fallbacks/food.webp'">
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span class="badge-diet ${dietClass}"></span>
                <strong>${SpiceClient.escapeHtml(item.name)}</strong>
                ${!item.is_available ? `<span class="pill pill-unavailable" style="font-size: 0.72rem; padding: 2px 6px;">UNAVAILABLE</span>` : ''}
              </div>
              ${item.verification_note && !item.verification_note.startsWith('http') && !item.verification_note.startsWith('/images/') ? `<div class="verification-alert">⚠️ ${SpiceClient.escapeHtml(item.verification_note)}</div>` : ''}
              ${!item.is_active ? `<span class="pill pill-unavailable" style="margin-top: 4px;">ARCHIVED</span>` : ''}
            </div>
          </div>
        </td>
        <td>${cat ? SpiceClient.escapeHtml(cat.name) : '--'}</td>
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

    selectedImageBase64 = null;
    selectedImageFilename = null;

    if (item) {
      menuModalTitle.textContent = `Edit "${item.name}"`;
      modalItemId.value = item.id;
      modalItemName.value = item.name;
      modalItemCategory.value = item.category_id;
      modalItemPrice.value = item.price;
      modalItemType.value = item.food_type;
      modalItemDesc.value = item.description || '';
      modalVerificationNote.value = (item.verification_note && !item.verification_note.startsWith('http') && !item.verification_note.startsWith('/images/')) ? item.verification_note : '';

      const cat = categories.find(c => c.id === item.category_id);
      const catName = cat ? cat.name : '';
      const resolvedImg = (item.image_url && item.image_url.trim().length > 0)
        ? item.image_url
        : ((window.SpiceSkyImages && window.SpiceSkyImages.getMenuItemImageUrl)
            ? window.SpiceSkyImages.getMenuItemImageUrl(item, catName)
            : null);

      if (resolvedImg && resolvedImg !== '/images/menu/fallbacks/food.webp') {
        const isCustom = resolvedImg.startsWith('http') || resolvedImg.includes('/storage/');
        setModalImagePreview(resolvedImg, isCustom ? 'Custom uploaded photo' : 'Current menu photo');
        if (modalItemImageUrl) {
          modalItemImageUrl.value = resolvedImg.startsWith('http') ? resolvedImg : '';
        }
      } else {
        setModalImagePreview(null);
      }
    } else {
      menuModalTitle.textContent = 'Add New Menu Item';
      modalItemId.value = '';
      modalItemName.value = '';
      if (categories.length > 0) modalItemCategory.value = categories[0].id;
      modalItemPrice.value = '199';
      modalItemType.value = 'VEG';
      modalItemDesc.value = '';
      modalVerificationNote.value = '';
      setModalImagePreview(null);
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

        // 3. Daily Sales & Payment Mode Breakdown (Per-Day Analysis)
        const dailyBody = document.getElementById('analyticsDailyTableBody');
        if (dailyBody) {
          dailyBody.innerHTML = '';
          const days = a.dailyBreakdown || [];
          if (days.length === 0) {
            dailyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">No sales history recorded yet.</td></tr>`;
          } else {
            days.forEach(d => {
              const tr = document.createElement('tr');
              const total = Number(d.revenue || d.totalRevenue || 0);
              const cash = Number(d.cashRevenue || 0);
              const online = Number(d.onlineRevenue || 0);
              const cashPct = total > 0 ? Math.round((cash / total) * 100) : 0;
              const onlinePct = total > 0 ? (100 - cashPct) : 0;

              tr.innerHTML = `
                <td style="font-weight: 700; white-space: nowrap;">📅 ${d.date}</td>
                <td><span class="pill pill-veg" style="font-size: 0.8rem;">${d.orders || d.count || 0} completed</span></td>
                <td style="font-weight: 800; color: var(--spice-gold); font-size: 0.95rem;">${SpiceClient.formatCurrency(total)}</td>
                <td style="color: #15803d; font-weight: 700;">${SpiceClient.formatCurrency(cash)}</td>
                <td style="color: #2563eb; font-weight: 700;">${SpiceClient.formatCurrency(online)}</td>
                <td style="min-width: 150px;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 4px;">
                    <span style="color: #15803d;">Cash ${cashPct}%</span>
                    <span style="color: #2563eb;">Online ${onlinePct}%</span>
                  </div>
                  <div style="background: #e2e8f0; border-radius: 9999px; height: 6px; overflow: hidden; display: flex; width: 100%;">
                    <div style="background: #16a34a; width: ${cashPct}%; height: 100%;"></div>
                    <div style="background: #2563eb; width: ${onlinePct}%; height: 100%;"></div>
                  </div>
                </td>
              `;
              dailyBody.appendChild(tr);
            });
          }
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

  // --- ORDER HISTORY MANAGEMENT WITH IN-PAGE CONFIRMATION MODAL ---
  const confirmResetModal = document.getElementById('confirmResetModal');
  const confirmResetIcon = document.getElementById('confirmResetIcon');
  const confirmResetTitle = document.getElementById('confirmResetTitle');
  const confirmResetSubtitle = document.getElementById('confirmResetSubtitle');
  const confirmResetMessage = document.getElementById('confirmResetMessage');
  const cancelResetModalBtn = document.getElementById('cancelResetModalBtn');
  const executeResetModalBtn = document.getElementById('executeResetModalBtn');

  let pendingResetAction = null; // 'TODAY' or 'ALL'

  function openResetModal(type) {
    if (!confirmResetModal) return;
    pendingResetAction = type;
    if (type === 'TODAY') {
      if (confirmResetIcon) confirmResetIcon.textContent = '📅';
      if (confirmResetTitle) confirmResetTitle.textContent = "Erase Today's History Only";
      if (confirmResetSubtitle) confirmResetSubtitle.textContent = 'Only orders placed today will be deleted';
      if (confirmResetMessage) {
        confirmResetMessage.innerHTML = `
          <div style="font-weight: 700; color: #c2410c; margin-bottom: 8px;">Are you sure you want to erase today's orders?</div>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
            <li>All orders placed <strong>TODAY</strong> will be deleted from the database.</li>
            <li>Today's sales count and revenue will reset to <strong>₹0</strong>.</li>
            <li>Orders from previous days will remain safe and unaffected.</li>
          </ul>
        `;
      }
      if (executeResetModalBtn) {
        executeResetModalBtn.style.background = '#ea580c';
        executeResetModalBtn.textContent = "Yes, Erase Today's History";
      }
    } else {
      if (confirmResetIcon) confirmResetIcon.textContent = '🚨';
      if (confirmResetTitle) confirmResetTitle.textContent = 'Reset Entire Order History';
      if (confirmResetSubtitle) confirmResetSubtitle.textContent = 'Permanent wipe of all historical orders';
      if (confirmResetMessage) {
        confirmResetMessage.innerHTML = `
          <div style="font-weight: 700; color: #dc2626; margin-bottom: 8px;">Are you sure you want to reset ALL order history?</div>
          <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
            <li><strong>ALL</strong> past and current orders will be permanently wiped.</li>
            <li>All active table orders will be cleared.</li>
            <li>Fresh orders will start sequentially from <strong>#1</strong>.</li>
            <li>Menu items, categories, and staff accounts remain preserved.</li>
          </ul>
        `;
      }
      if (executeResetModalBtn) {
        executeResetModalBtn.style.background = '#dc2626';
        executeResetModalBtn.textContent = 'Yes, Wipe Everything to #1';
      }
    }

    if (executeResetModalBtn) executeResetModalBtn.disabled = false;
    confirmResetModal.classList.add('active');
  }

  function closeResetModal() {
    pendingResetAction = null;
    if (confirmResetModal) confirmResetModal.classList.remove('active');
  }

  if (cancelResetModalBtn) {
    cancelResetModalBtn.addEventListener('click', closeResetModal);
  }

  if (confirmResetModal) {
    confirmResetModal.addEventListener('click', (e) => {
      if (e.target === confirmResetModal) closeResetModal();
    });
  }

  if (executeResetModalBtn) {
    executeResetModalBtn.addEventListener('click', async () => {
      const isToday = pendingResetAction === 'TODAY';
      const endpoint = isToday ? '/api/admin/orders/reset-today' : '/api/admin/orders/reset';

      try {
        executeResetModalBtn.disabled = true;
        executeResetModalBtn.textContent = 'Processing...';

        const token = (typeof SpiceClient !== 'undefined' && SpiceClient.getStoredToken)
          ? SpiceClient.getStoredToken()
          : localStorage.getItem('spice_token');

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          }
        });
        const data = await res.json();

        if (data.success) {
          closeResetModal();
          alert(data.message || (isToday ? "Today's order history erased successfully." : 'All order history reset to #1. Page will refresh.'));
          // Strictly reload the page so all tables, caches, and state refresh from Supabase
          window.location.reload();
        } else {
          alert('Action failed: ' + (data.error || 'Unknown error'));
          executeResetModalBtn.disabled = false;
          executeResetModalBtn.textContent = isToday ? "Yes, Erase Today's History" : 'Yes, Wipe Everything to #1';
        }
      } catch (err) {
        alert('Request error: ' + err.message);
        executeResetModalBtn.disabled = false;
        executeResetModalBtn.textContent = isToday ? "Yes, Erase Today's History" : 'Yes, Wipe Everything to #1';
      }
    });
  }

  const resetOrdersBtn = document.getElementById('resetOrdersBtn');
  if (resetOrdersBtn) {
    resetOrdersBtn.addEventListener('click', () => openResetModal('ALL'));
  }

  const resetTodayOrdersBtn = document.getElementById('resetTodayOrdersBtn');
  if (resetTodayOrdersBtn) {
    resetTodayOrdersBtn.addEventListener('click', () => openResetModal('TODAY'));
  }

  const ordersTabResetTodayBtn = document.getElementById('ordersTabResetTodayBtn');
  if (ordersTabResetTodayBtn) {
    ordersTabResetTodayBtn.addEventListener('click', () => openResetModal('TODAY'));
  }

  // Initial Load
  updateSupabaseStatus();
  loadDashboardData();
});
