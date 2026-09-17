/**
 * Waiter POS Terminal Logic
 * Fast Phone-First Interaction | 9 Tables | Server-Authoritative Bill Generation
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
  function updateWaiterDisplay(user) {
    if (!user) return;
    const username = user.username || user.display_name || (user.email ? user.email.split('@')[0] : 'Waiter');
    const badgeText = document.getElementById('waiterUsernameText');
    const badge = document.getElementById('waiterStaffBadge');
    if (badgeText) {
      badgeText.textContent = username;
    } else if (badge) {
      badge.textContent = username;
    }
    if (badge) {
      badge.style.display = 'inline-flex';
    }

    const greet = document.getElementById('waiterGreetingName');
    if (greet) greet.textContent = username;
    const greetBadge = document.getElementById('waiterGreetingBadge');
    if (greetBadge) greetBadge.style.display = 'inline-flex';

    const drawerServer = document.getElementById('drawerServerName');
    if (drawerServer) drawerServer.textContent = username;
  }

  const ALLOWED_WAITER_USERS = ['shan', 'yawar', 'nawaz'];

  // Instant synchronous hydration before async init
  const initialUser = (typeof SpiceClient !== 'undefined' && SpiceClient.getStoredUser) ? SpiceClient.getStoredUser() : null;
  if (initialUser && initialUser.role === 'WAITER' && ALLOWED_WAITER_USERS.includes(((initialUser.username || initialUser.display_name || (initialUser.email ? initialUser.email.split('@')[0] : '')) || '').toLowerCase())) {
    updateWaiterDisplay(initialUser);
  }

  await SpiceClient.init();

  // Guard: Require WAITER role (Shan, Yawar, Nawaz only)
  const currentUser = SpiceClient.requireRole('WAITER', '/waiter/login');
  if (!currentUser) return;

  const currentUname = ((currentUser.username || currentUser.display_name || (currentUser.email ? currentUser.email.split('@')[0] : '')) || '').toLowerCase();
  if (currentUser.role !== 'WAITER' || !ALLOWED_WAITER_USERS.includes(currentUname)) {
    await SpiceClient.signOut('WAITER');
    window.location.replace('/waiter/login');
    return;
  }

  updateWaiterDisplay(currentUser);

  function getCurrentStaffUsername() {
    return (currentUser && (currentUser.username || currentUser.display_name)) || (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'Waiter');
  }

  const waiterSignOutBtn = document.getElementById('waiterSignOutBtn');

  if (waiterSignOutBtn) {
    waiterSignOutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      waiterSignOutBtn.disabled = true;
      waiterSignOutBtn.textContent = 'Signing out...';
      try {
        await SpiceClient.signOut('WAITER');
      } catch (err) {}
      window.location.replace('/waiter/login');
    });
  }

  // State
  let activeTable = 1;
  let categories = [];
  let menuItems = [];
  let currentCategory = 'ALL';
  let searchQuery = '';
  let isSubmitting = false;

  // Multi-Order state: tableNum (1-9) -> Array of active serving orders
  let activeOrdersByTable = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

  // Currently selected order ID for each table: tableNum -> orderId (UUID/number) OR 'new'
  let selectedOrderIdByTable = { 1: 'new', 2: 'new', 3: 'new', 4: 'new', 5: 'new', 6: 'new', 7: 'new', 8: 'new', 9: 'new' };

  // Cart for each order: key is String(orderId) OR ('new_' + tableNum)
  // Value: [ { menu_item_id, variant_id, name, variant_name, price, quantity } ]
  let orderCarts = {};
  let lastBilledOrder = null;

  // DOM Elements
  const tablesGrid = document.getElementById('tablesGrid');
  const tableOrdersBar = document.getElementById('tableOrdersBar');
  const activeTableCallout = document.getElementById('activeTableCallout');
  const tableServingPill = document.getElementById('tableServingPill');
  const waiterSearchInput = document.getElementById('waiterSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const waiterCategoriesNav = document.getElementById('waiterCategoriesNav');
  const waiterCatalog = document.getElementById('waiterCatalog');

  const viewCartBtn = document.getElementById('viewCartBtn') || document.getElementById('orderPeekTrigger');
  const orderPeekTrigger = viewCartBtn;
  const cartBadgeCount = document.getElementById('cartBadgeCount');
  const cartBadgeTotal = document.getElementById('cartBadgeTotal');
  const cartBadgeSub = document.getElementById('cartBadgeSub');
  const peekTableLine = document.getElementById('peekTableLine');
  const peekTotalLine = document.getElementById('peekTotalLine');
  const peekCountLine = document.getElementById('peekCountLine');
  const saveServingBtn = document.getElementById('saveServingBtn');
  const generateBillBtn = document.getElementById('generateBillBtn');

  const orderDrawer = document.getElementById('orderDrawer');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerItemsList = document.getElementById('drawerItemsList');
  const drawerTotalAmount = document.getElementById('drawerTotalAmount');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const clearOrderBtn = document.getElementById('clearOrderBtn');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');
  const drawerSaveServingBtn = document.getElementById('drawerSaveServingBtn');
  const drawerGenerateBtn = document.getElementById('drawerGenerateBtn');

  const variantModal = document.getElementById('variantModal');
  const variantItemTitle = document.getElementById('variantItemTitle');
  const variantOptionsList = document.getElementById('variantOptionsList');
  const cancelVariantBtn = document.getElementById('cancelVariantBtn');

  const billModal = document.getElementById('billModal');
  const billTableText = document.getElementById('billTableText');
  const billOrderNumText = document.getElementById('billOrderNumText');
  const billDateText = document.getElementById('billDateText');
  const billTimeText = document.getElementById('billTimeText');
  const billWaiterText = document.getElementById('billWaiterText');
  const billStatusText = document.getElementById('billStatusText');
  const billItemsTbody = document.getElementById('billItemsTbody');
  const billTotalText = document.getElementById('billTotalText');
  const editBillBtn = document.getElementById('editBillBtn');
  const printBillBtn = document.getElementById('printBillBtn');
  const newOrderBtn = document.getElementById('newOrderBtn');
  const billSubtotalRow = document.getElementById('billSubtotalRow');
  const billSubtotalText = document.getElementById('billSubtotalText');
  const billDiscountRow = document.getElementById('billDiscountRow');
  const billDiscountLabelText = document.getElementById('billDiscountLabelText');
  const billDiscountAmountText = document.getElementById('billDiscountAmountText');

  // Payment Mode Modal Elements
  const paymentModal = document.getElementById('paymentModal');
  const paymentModalSubtitle = document.getElementById('paymentModalSubtitle');
  const paymentTotalAmount = document.getElementById('paymentTotalAmount');
  const paymentSubtotalAmount = document.getElementById('paymentSubtotalAmount');
  const paymentDiscountRow = document.getElementById('paymentDiscountRow');
  const paymentDiscountLabel = document.getElementById('paymentDiscountLabel');
  const paymentDiscountAmount = document.getElementById('paymentDiscountAmount');
  const billDiscountBadge = document.getElementById('billDiscountBadge');
  const quickDiscountChips = document.getElementById('quickDiscountChips');
  const billDiscountInput = document.getElementById('billDiscountInput');
  const payModeCashBtn = document.getElementById('payModeCashBtn');
  const payModeOnlineBtn = document.getElementById('payModeOnlineBtn');
  const payModeSplitBtn = document.getElementById('payModeSplitBtn');
  const splitPaymentSection = document.getElementById('splitPaymentSection');
  const splitCashInput = document.getElementById('splitCashInput');
  const splitOnlineInput = document.getElementById('splitOnlineInput');
  const splitBalanceIndicator = document.getElementById('splitBalanceIndicator');
  const paymentSummaryNotice = document.getElementById('paymentSummaryNotice');
  const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
  const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
  const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
  const breakdownTotalText = document.getElementById('breakdownTotalText');
  const breakdownCashText = document.getElementById('breakdownCashText');
  const breakdownOnlineText = document.getElementById('breakdownOnlineText');
  const quickCashChips = document.getElementById('quickCashChips');
  const cashInputHint = document.getElementById('cashInputHint');

  const billPaymentBox = document.getElementById('billPaymentBox');
  const billPaymentModeText = document.getElementById('billPaymentModeText');
  const billCashRow = document.getElementById('billCashRow');
  const billCashLabelText = document.getElementById('billCashLabelText');
  const billCashPaidText = document.getElementById('billCashPaidText');
  const billOnlineRow = document.getElementById('billOnlineRow');
  const billOnlineLabelText = document.getElementById('billOnlineLabelText');
  const billOnlinePaidText = document.getElementById('billOnlinePaidText');

  // --- MULTI-ORDER HELPERS ---
  function getCurrentCartKey() {
    const orderId = selectedOrderIdByTable[activeTable] || 'new';
    return orderId === 'new' ? `new_${activeTable}` : String(orderId);
  }

  function getCurrentOrderItems() {
    const key = getCurrentCartKey();
    if (!orderCarts[key]) {
      orderCarts[key] = [];
    }
    return orderCarts[key];
  }

  function getSelectedActiveOrder() {
    const orderId = selectedOrderIdByTable[activeTable];
    if (!orderId || orderId === 'new') return null;
    const list = activeOrdersByTable[activeTable] || [];
    return list.find(o => String(o.id) === String(orderId)) || null;
  }

  // Table Selector Events (Table 1 through 9) - Wire immediately for instant responsiveness
  tablesGrid.querySelectorAll('.table-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTable = Number(btn.getAttribute('data-table'));
      selectTable(selectedTable);
    });
  });

  updateTableGridIndicators();
  renderOrderTabs();
  updateBottomBar();

  // Load Menu Data
  waiterCatalog.innerHTML = `
    <div style="text-align: center; padding: 40px 16px; color: var(--text-muted); grid-column: 1 / -1;">
      <p style="font-size: 1rem;">Loading menu catalog...</p>
    </div>`;
  await loadMenu();
  await loadActiveOrders();

  // Periodically sync active serving tables
  setInterval(loadActiveOrders, 15000);

  // Listen to Realtime Menu Updates
  SpiceClient.on('menu_updated', () => {
    loadMenu(false);
  });

  function updateTableGridIndicators() {
    tablesGrid.querySelectorAll('.table-btn').forEach(b => {
      const tNum = Number(b.getAttribute('data-table'));
      const activeList = activeOrdersByTable[tNum] || [];
      const orderCount = activeList.length;
      const isServing = orderCount > 0;

      b.classList.toggle('serving', isServing);

      let dot = b.querySelector('.serving-dot');
      let badge = b.querySelector('.table-order-badge');

      if (orderCount === 1) {
        if (badge) badge.remove();
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'serving-dot';
          b.appendChild(dot);
        }
      } else if (orderCount > 1) {
        if (dot) dot.remove();
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'table-order-badge';
          b.appendChild(badge);
        }
        badge.textContent = orderCount;
      } else {
        if (dot) dot.remove();
        if (badge) badge.remove();
      }
    });

    const activeOrder = getSelectedActiveOrder();
    const activeList = activeOrdersByTable[activeTable] || [];

    if (tableServingPill) {
      if (activeOrder) {
        tableServingPill.style.display = 'inline-block';
        tableServingPill.textContent = `🟢 Serving (#${activeOrder.order_number})`;
      } else if (activeList.length > 1) {
        tableServingPill.style.display = 'inline-block';
        tableServingPill.textContent = `🟢 ${activeList.length} Orders Open`;
      } else if (activeList.length === 1) {
        tableServingPill.style.display = 'inline-block';
        tableServingPill.textContent = `🟢 Serving (#${activeList[0].order_number})`;
      } else {
        tableServingPill.style.display = 'none';
      }
    }
  }

  function renderOrderTabs() {
    if (!tableOrdersBar) return;
    tableOrdersBar.innerHTML = '';

    const orders = activeOrdersByTable[activeTable] || [];
    const currSelectedId = selectedOrderIdByTable[activeTable] || 'new';

    const label = document.createElement('span');
    label.className = 'order-tab-label';
    label.textContent = `T${activeTable} Orders:`;
    tableOrdersBar.appendChild(label);

    // Render active order pills
    orders.forEach(ord => {
      const isSelected = String(ord.id) === String(currSelectedId);
      const cart = orderCarts[String(ord.id)] || [];
      const totalAmt = (cart.length > 0)
        ? cart.reduce((sum, i) => sum + (i.price * i.quantity), 0)
        : Number(ord.total || 0);

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `order-tab-pill ${isSelected ? 'active' : ''}`;
      pill.innerHTML = `
        <span class="tab-serving-dot"></span>
        <span>Order #${ord.order_number}</span>
        <span class="tab-amount">${SpiceClient.formatCurrency(totalAmt)}</span>
        <span class="tab-cancel-x" title="Cancel Order #${ord.order_number}">&times;</span>
      `;
      pill.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-cancel-x')) {
          e.stopPropagation();
          if (confirm(`Are you sure you want to CANCEL Order #${ord.order_number} for Table ${activeTable}? This action cannot be undone.`)) {
            handleCancelActiveOrder(ord.id);
          }
          return;
        }
        selectOrderTab(ord.id);
      });
      tableOrdersBar.appendChild(pill);
    });

    // "+ New Order" pill
    const isNewSelected = currSelectedId === 'new';
    const newCart = orderCarts[`new_${activeTable}`] || [];
    const newTotal = newCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    const newPill = document.createElement('button');
    newPill.type = 'button';
    newPill.className = `order-tab-pill new-order-tab ${isNewSelected ? 'active' : ''}`;
    newPill.innerHTML = `
      <span>➕ New Order</span>
      ${newCart.length > 0 ? `<span class="tab-amount">${SpiceClient.formatCurrency(newTotal)}</span>` : ''}
    `;
    newPill.addEventListener('click', () => {
      selectOrderTab('new');
    });
    tableOrdersBar.appendChild(newPill);
  }

  function selectOrderTab(orderId) {
    selectedOrderIdByTable[activeTable] = orderId;
    renderOrderTabs();
    updateTableGridIndicators();
    updateBottomBar();
    renderCatalog();
  }

  function selectTable(num) {
    if (num < 1 || num > 9) return;
    activeTable = num;

    tablesGrid.querySelectorAll('.table-btn').forEach(b => {
      b.classList.toggle('active', Number(b.getAttribute('data-table')) === num);
    });

    activeTableCallout.textContent = `Table ${num} Selected`;

    const orders = activeOrdersByTable[num] || [];
    if (!selectedOrderIdByTable[num] || (selectedOrderIdByTable[num] !== 'new' && !orders.some(o => String(o.id) === String(selectedOrderIdByTable[num])))) {
      selectedOrderIdByTable[num] = orders.length > 0 ? orders[0].id : 'new';
    }

    updateTableGridIndicators();
    renderOrderTabs();
    updateBottomBar();
    renderCatalog();

    // On mobile screens, smoothly center the selected table button
    const activeBtn = tablesGrid.querySelector(`.table-btn[data-table="${num}"]`);
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  async function loadActiveOrders() {
    try {
      const res = await fetch('/api/orders/active');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const newGrouped = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

        json.data.forEach(order => {
          const tNum = Number(order.table_number);
          if (tNum >= 1 && tNum <= 9) {
            newGrouped[tNum].push(order);

            const cartKey = String(order.id);
            if (!orderCarts[cartKey]) {
              orderCarts[cartKey] = (order.items || order.order_items || []).map(i => {
                const matched = menuItems.find(m => m.id === i.menu_item_id);
                const variants = matched ? (matched.menu_item_variants || []) : [];
                let variantId = i.variant_id || null;
                let variantName = i.variant_name_snapshot || i.variant_name || null;
                let unitPrice = Number(i.unit_price_snapshot !== undefined ? i.unit_price_snapshot : i.price);

                if (variants.length > 0) {
                  let v = null;
                  if (variantId) {
                    v = variants.find(varItem => String(varItem.id) === String(variantId));
                  }
                  if (!v && variantName) {
                    const vn = String(variantName).trim().toLowerCase();
                    v = variants.find(varItem => String(varItem.name).trim().toLowerCase() === vn)
                      || variants.find(varItem => {
                        const vn2 = String(varItem.name).trim().toLowerCase();
                        return vn2.includes(vn) || vn.includes(vn2);
                      });
                  }
                  if (!v && !isNaN(unitPrice) && unitPrice > 0) {
                    v = variants.find(varItem => Math.abs(Number(varItem.price) - unitPrice) < 0.01);
                  }
                  if (v) {
                    variantId = v.id;
                    variantName = v.name;
                    unitPrice = Number(v.price);
                  }
                }

                return {
                  menu_item_id: i.menu_item_id,
                  variant_id: variantId,
                  name: i.item_name_snapshot || i.name,
                  variant_name: variantName,
                  price: unitPrice,
                  quantity: Number(i.quantity),
                  food_type: i.food_type || (matched ? matched.food_type : null)
                };
              });
            }
          }
        });

        activeOrdersByTable = newGrouped;

        // Ensure selectedOrderIdByTable is valid and never forcefully hijack user intent
        for (let t = 1; t <= 9; t++) {
          const orders = activeOrdersByTable[t];
          const currSelected = selectedOrderIdByTable[t];
          if (currSelected && currSelected !== 'new') {
            const exists = orders.some(o => String(o.id) === String(currSelected));
            if (!exists) {
              selectedOrderIdByTable[t] = 'new';
            }
          }
        }

        updateTableGridIndicators();
        renderOrderTabs();
        updateBottomBar();
        renderCatalog();
      }
    } catch (err) {
      console.warn('Failed to load active orders:', err);
    }
  }

  // Search & Filter Events
  function handleSearch(val) {
    searchQuery = (val || '').trim();
    if (clearSearchBtn) {
      clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    }
    // When typing a search query, switch category view to ALL so search scans entire menu
    if (searchQuery && currentCategory !== 'ALL') {
      currentCategory = 'ALL';
      document.querySelectorAll('.waiter-cat-pill').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-cat') === 'ALL');
      });
    }
    renderCatalog();
  }

  waiterSearchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  waiterSearchInput.addEventListener('search', (e) => {
    handleSearch(e.target.value);
  });

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      waiterSearchInput.value = '';
      handleSearch('');
      waiterSearchInput.focus();
    });
  }

  // Drawer Events
  orderPeekTrigger.addEventListener('click', () => openDrawer());
  closeDrawerBtn.addEventListener('click', () => closeDrawer());
  orderDrawer.addEventListener('click', (e) => {
    if (e.target === orderDrawer) closeDrawer();
  });

  clearOrderBtn.addEventListener('click', () => {
    const activeOrder = getSelectedActiveOrder();
    const orderTitle = activeOrder ? `Order #${activeOrder.order_number}` : 'this new order';
    if (confirm(`Clear all items for Table ${activeTable} (${orderTitle})?`)) {
      const key = getCurrentCartKey();
      orderCarts[key] = [];
      updateBottomBar();
      renderOrderTabs();
      renderCatalog();
      closeDrawer();
    }
  });

  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', async () => {
      const activeOrder = getSelectedActiveOrder();
      if (!activeOrder || !activeOrder.id) return;
      if (confirm(`Are you sure you want to CANCEL Order #${activeOrder.order_number} for Table ${activeTable}? This action cannot be undone.`)) {
        await handleCancelActiveOrder(activeOrder.id);
      }
    });
  }

  if (saveServingBtn) {
    saveServingBtn.addEventListener('click', () => handleSaveServingOrder());
  }
  if (drawerSaveServingBtn) {
    drawerSaveServingBtn.addEventListener('click', () => {
      closeDrawer();
      handleSaveServingOrder();
    });
  }

  generateBillBtn.addEventListener('click', () => openPaymentModal());
  drawerGenerateBtn.addEventListener('click', () => {
    closeDrawer();
    openPaymentModal();
  });

  cancelVariantBtn.addEventListener('click', () => {
    variantModal.classList.remove('active');
  });

  printBillBtn.addEventListener('click', () => {
    SpiceClient.printReceipt(document.getElementById('printableReceipt'));
  });

  if (editBillBtn) {
    editBillBtn.addEventListener('click', async () => {
      billModal.classList.remove('active');
      if (lastBilledOrder && lastBilledOrder.id) {
        try {
          await fetch(`/api/orders/${lastBilledOrder.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'CONFIRMED' })
          });
          lastBilledOrder.status = 'CONFIRMED';
          const tNum = Number(lastBilledOrder.table_number);
          if (!activeOrdersByTable[tNum]) activeOrdersByTable[tNum] = [];
          if (!activeOrdersByTable[tNum].some(o => String(o.id) === String(lastBilledOrder.id))) {
            activeOrdersByTable[tNum].push(lastBilledOrder);
          }

          orderCarts[String(lastBilledOrder.id)] = (lastBilledOrder.items || lastBilledOrder.order_items || []).map(i => {
            const matched = menuItems.find(m => m.id === i.menu_item_id);
            const variants = matched ? (matched.menu_item_variants || []) : [];
            let variantId = i.variant_id || null;
            let variantName = i.variant_name_snapshot || i.variant_name || null;
            let unitPrice = Number(i.unit_price_snapshot !== undefined ? i.unit_price_snapshot : i.price);

            if (variants.length > 0) {
              let v = null;
              if (variantId) {
                v = variants.find(varItem => String(varItem.id) === String(variantId));
              }
              if (!v && variantName) {
                const vn = String(variantName).trim().toLowerCase();
                v = variants.find(varItem => String(varItem.name).trim().toLowerCase() === vn)
                  || variants.find(varItem => {
                    const vn2 = String(varItem.name).trim().toLowerCase();
                    return vn2.includes(vn) || vn.includes(vn2);
                  });
              }
              if (!v && !isNaN(unitPrice) && unitPrice > 0) {
                v = variants.find(varItem => Math.abs(Number(varItem.price) - unitPrice) < 0.01);
              }
              if (v) {
                variantId = v.id;
                variantName = v.name;
                unitPrice = Number(v.price);
              }
            }

            return {
              menu_item_id: i.menu_item_id,
              variant_id: variantId,
              name: i.item_name_snapshot || i.name,
              variant_name: variantName,
              price: unitPrice,
              quantity: Number(i.quantity),
              food_type: i.food_type || (matched ? matched.food_type : null)
            };
          });

          selectTable(tNum);
          selectOrderTab(lastBilledOrder.id);
        } catch (e) {
          console.warn('Reopen bill error:', e);
        }
      }
      openDrawer();
    });
  }

  newOrderBtn.addEventListener('click', () => {
    billModal.classList.remove('active');
    lastBilledOrder = null;
    selectedOrderIdByTable[activeTable] = 'new';
    orderCarts[`new_${activeTable}`] = [];
    updateTableGridIndicators();
    renderOrderTabs();
    updateBottomBar();
    renderCatalog();
  });

  // --- PAYMENT MODE & MANUAL CASH MODAL LOGIC ---
  let currentPaymentMode = 'CASH'; // 'CASH' | 'ONLINE' | 'SPLIT'
  let currentDiscountPercent = 0;
  let currentDiscountAmount = 0;
  let currentSubtotalForPayment = 0;
  let orderTotalForPayment = 0;

  function updateDiscountChipsUI(pct) {
    if (!quickDiscountChips) return;
    const chips = quickDiscountChips.querySelectorAll('.discount-chip');
    chips.forEach(chip => {
      const chipPct = parseFloat(chip.dataset.pct);
      if (Math.abs(chipPct - pct) < 0.01) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  function applyDiscountCalculation() {
    const subtotal = currentSubtotalForPayment;
    let pct = Number(currentDiscountPercent) || 0;
    if (isNaN(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    currentDiscountPercent = pct;

    currentDiscountAmount = Math.round((subtotal * pct / 100) * 100) / 100;
    orderTotalForPayment = Math.max(0, Math.round((subtotal - currentDiscountAmount) * 100) / 100);

    if (billDiscountBadge) {
      if (pct > 0) {
        billDiscountBadge.textContent = `${pct}% (${SpiceClient.formatCurrency(currentDiscountAmount)} discount)`;
        billDiscountBadge.style.background = '#dcfce7';
        billDiscountBadge.style.color = '#15803d';
        billDiscountBadge.style.borderColor = '#86efac';
      } else {
        billDiscountBadge.textContent = '0% (₹0 discount)';
        billDiscountBadge.style.background = '#ffedd5';
        billDiscountBadge.style.color = '#c2410c';
        billDiscountBadge.style.borderColor = '#fdba74';
      }
    }

    if (paymentSubtotalAmount) {
      paymentSubtotalAmount.textContent = SpiceClient.formatCurrency(subtotal);
    }
    if (paymentDiscountRow) {
      paymentDiscountRow.style.display = pct > 0 ? 'flex' : 'none';
    }
    if (paymentDiscountLabel) {
      paymentDiscountLabel.textContent = `Discount (${pct}%):`;
    }
    if (paymentDiscountAmount) {
      paymentDiscountAmount.textContent = `-${SpiceClient.formatCurrency(currentDiscountAmount)}`;
    }
    if (paymentTotalAmount) {
      paymentTotalAmount.textContent = SpiceClient.formatCurrency(orderTotalForPayment);
    }
    if (breakdownTotalText) {
      breakdownTotalText.textContent = SpiceClient.formatCurrency(orderTotalForPayment);
    }

    updateCashCalculation();
  }

  function openPaymentModal() {
    const order = getCurrentOrderItems();
    if (order.length === 0) {
      alert('Cart is empty. Please add items to generate bill.');
      return;
    }

    currentSubtotalForPayment = order.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
    currentDiscountPercent = 0;
    currentDiscountAmount = 0;

    if (billDiscountInput) {
      billDiscountInput.value = 0;
    }
    updateDiscountChipsUI(0);
    applyDiscountCalculation();

    if (paymentModalSubtitle) {
      paymentModalSubtitle.textContent = `Table ${activeTable} • ${order.length} item(s) • Subtotal: ${SpiceClient.formatCurrency(currentSubtotalForPayment)}`;
    }

    // Default to Full UPI (can easily opt for Partial Cash or Full Cash)
    setPaymentMode('ONLINE');
    if (paymentModal) paymentModal.classList.add('active');
  }

  function closePaymentModal() {
    if (paymentModal) paymentModal.classList.remove('active');
  }

  function updateCashCalculation() {
    if (!splitCashInput || !breakdownCashText || !breakdownOnlineText) return;
    const rawVal = splitCashInput.value.trim();
    let cashVal = rawVal === '' ? 0 : parseFloat(rawVal);
    if (isNaN(cashVal)) cashVal = 0;

    const target = Math.round(orderTotalForPayment * 100) / 100;

    if (cashVal < 0) {
      if (splitBalanceIndicator) {
        splitBalanceIndicator.style.color = '#dc2626';
        splitBalanceIndicator.innerHTML = '⚠️ Cash amount cannot be negative.';
      }
      if (paymentSummaryNotice) {
        paymentSummaryNotice.innerHTML = '<span style="color: #dc2626; font-weight: 700;">Cash amount cannot be negative.</span>';
      }
      if (confirmPaymentBtn) {
        confirmPaymentBtn.disabled = true;
        confirmPaymentBtn.style.opacity = '0.5';
        confirmPaymentBtn.style.pointerEvents = 'none';
      }
      return;
    }

    if (cashVal > target) {
      const diff = Math.round((cashVal - target) * 100) / 100;
      if (splitBalanceIndicator) {
        splitBalanceIndicator.style.color = '#dc2626';
        splitBalanceIndicator.innerHTML = `⚠️ Cash entered (${SpiceClient.formatCurrency(cashVal)}) exceeds Total Bill (${SpiceClient.formatCurrency(target)}) by ${SpiceClient.formatCurrency(diff)}.`;
      }
      if (paymentSummaryNotice) {
        paymentSummaryNotice.innerHTML = `<span style="color: #dc2626; font-weight: 700;">Cash cannot exceed total bill amount (${SpiceClient.formatCurrency(target)}).</span>`;
      }
      if (breakdownCashText) breakdownCashText.textContent = SpiceClient.formatCurrency(cashVal);
      if (breakdownOnlineText) breakdownOnlineText.textContent = '₹0';
      if (confirmPaymentBtn) {
        confirmPaymentBtn.disabled = true;
        confirmPaymentBtn.style.opacity = '0.5';
        confirmPaymentBtn.style.pointerEvents = 'none';
      }
      return;
    }

    // Amount to be paid Online = Total Bill - Cash
    const onlineDue = Math.max(0, Math.round((target - cashVal) * 100) / 100);
    if (splitOnlineInput) splitOnlineInput.value = onlineDue;

    if (breakdownCashText) breakdownCashText.textContent = SpiceClient.formatCurrency(cashVal);
    if (breakdownOnlineText) breakdownOnlineText.textContent = SpiceClient.formatCurrency(onlineDue);

    if (Math.abs(cashVal - target) < 0.01) {
      currentPaymentMode = 'CASH';
      if (payModeCashBtn) payModeCashBtn.classList.add('active');
      if (payModeSplitBtn) payModeSplitBtn.classList.remove('active');
      if (payModeOnlineBtn) payModeOnlineBtn.classList.remove('active');
      if (cashInputHint) cashInputHint.textContent = '100% Full Cash';

      if (splitBalanceIndicator) {
        splitBalanceIndicator.style.color = '#15803d';
        splitBalanceIndicator.innerHTML = `✅ Full Cash: <strong>${SpiceClient.formatCurrency(cashVal)}</strong> in Cash &bull; ₹0 Online`;
      }
      if (paymentSummaryNotice) {
        paymentSummaryNotice.innerHTML = `Customer opted for <strong>Full Cash</strong>: <strong>${SpiceClient.formatCurrency(target)}</strong>.`;
      }
    } else if (cashVal <= 0) {
      currentPaymentMode = 'ONLINE';
      if (payModeCashBtn) payModeCashBtn.classList.remove('active');
      if (payModeSplitBtn) payModeSplitBtn.classList.remove('active');
      if (payModeOnlineBtn) payModeOnlineBtn.classList.add('active');
      if (cashInputHint) cashInputHint.textContent = '100% Online / UPI';

      if (splitBalanceIndicator) {
        splitBalanceIndicator.style.color = '#1d4ed8';
        splitBalanceIndicator.innerHTML = `✅ Full Online: ₹0 Cash &bull; <strong>${SpiceClient.formatCurrency(onlineDue)}</strong> via UPI / QR`;
      }
      if (paymentSummaryNotice) {
        paymentSummaryNotice.innerHTML = `Customer opted for <strong>Full Online / UPI</strong>: <strong>${SpiceClient.formatCurrency(target)}</strong>.`;
      }
    } else {
      currentPaymentMode = 'SPLIT';
      if (payModeCashBtn) payModeCashBtn.classList.remove('active');
      if (payModeSplitBtn) payModeSplitBtn.classList.add('active');
      if (payModeOnlineBtn) payModeOnlineBtn.classList.remove('active');
      if (cashInputHint) cashInputHint.textContent = 'Partial Cash + Online';

      if (splitBalanceIndicator) {
        splitBalanceIndicator.style.color = '#b45309';
        splitBalanceIndicator.innerHTML = `✅ Partial Cash: <strong>${SpiceClient.formatCurrency(cashVal)} Cash</strong> + <strong>${SpiceClient.formatCurrency(onlineDue)} Online</strong> = ${SpiceClient.formatCurrency(target)}`;
      }
      if (paymentSummaryNotice) {
        paymentSummaryNotice.innerHTML = `Partial payment: Customer pays <strong>${SpiceClient.formatCurrency(cashVal)} Cash</strong>, and remaining <strong>${SpiceClient.formatCurrency(onlineDue)} Online / UPI</strong>.`;
      }
    }

    if (confirmPaymentBtn) {
      confirmPaymentBtn.disabled = false;
      confirmPaymentBtn.style.opacity = '1';
      confirmPaymentBtn.style.pointerEvents = 'auto';
    }
  }

  // Backwards compatibility helper for tests
  function updateSplitBalance() {
    updateCashCalculation();
  }

  function setPaymentMode(mode) {
    currentPaymentMode = mode;
    if (mode === 'CASH') {
      if (splitCashInput) splitCashInput.value = orderTotalForPayment;
    } else if (mode === 'ONLINE') {
      if (splitCashInput) splitCashInput.value = 0;
    } else if (mode === 'SPLIT') {
      if (splitCashInput) {
        if (parseFloat(splitCashInput.value) === orderTotalForPayment || parseFloat(splitCashInput.value) === 0 || !splitCashInput.value) {
          splitCashInput.value = '';
        }
        setTimeout(() => splitCashInput.focus(), 50);
      }
    }
    updateCashCalculation();
  }

  if (closePaymentModalBtn) closePaymentModalBtn.addEventListener('click', closePaymentModal);
  if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', closePaymentModal);
  if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
      if (e.target === paymentModal) closePaymentModal();
    });
  }

  if (payModeCashBtn) payModeCashBtn.addEventListener('click', () => setPaymentMode('CASH'));
  if (payModeOnlineBtn) payModeOnlineBtn.addEventListener('click', () => setPaymentMode('ONLINE'));
  if (payModeSplitBtn) payModeSplitBtn.addEventListener('click', () => setPaymentMode('SPLIT'));

  if (splitCashInput) {
    splitCashInput.addEventListener('input', () => {
      updateCashCalculation();
    });
  }

  if (splitOnlineInput) {
    splitOnlineInput.addEventListener('input', () => {
      const o = parseFloat(splitOnlineInput.value);
      if (!isNaN(o) && o >= 0 && o <= orderTotalForPayment && splitCashInput) {
        splitCashInput.value = Math.max(0, Math.round((orderTotalForPayment - o) * 100) / 100);
      }
      updateCashCalculation();
    });
  }

  if (quickCashChips) {
    quickCashChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-chip');
      if (!btn) return;
      const val = btn.dataset.val;
      if (val === 'full') {
        if (splitCashInput) splitCashInput.value = orderTotalForPayment;
      } else if (val === '0') {
        if (splitCashInput) splitCashInput.value = 0;
      } else {
        const addNum = parseFloat(val) || 0;
        const currentNum = parseFloat(splitCashInput.value) || 0;
        const nextVal = Math.min(orderTotalForPayment, currentNum + addNum);
        if (splitCashInput) splitCashInput.value = nextVal;
      }
      updateCashCalculation();
    });
  }

  if (quickDiscountChips) {
    quickDiscountChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.discount-chip');
      if (!chip) return;
      const pct = parseFloat(chip.dataset.pct) || 0;
      currentDiscountPercent = pct;
      if (billDiscountInput) billDiscountInput.value = pct;
      updateDiscountChipsUI(pct);
      applyDiscountCalculation();
    });
  }

  if (billDiscountInput) {
    billDiscountInput.addEventListener('input', () => {
      let rawVal = parseFloat(billDiscountInput.value);
      if (isNaN(rawVal)) rawVal = 0;
      if (rawVal < 0) rawVal = 0;
      if (rawVal > 100) rawVal = 100;
      currentDiscountPercent = rawVal;
      updateDiscountChipsUI(rawVal);
      applyDiscountCalculation();
    });
  }

  if (confirmPaymentBtn) {
    confirmPaymentBtn.addEventListener('click', () => {
      let cashAmount = parseFloat(splitCashInput ? splitCashInput.value : 0) || 0;
      if (cashAmount < 0) {
        alert('Cash amount cannot be negative.');
        return;
      }
      if (cashAmount > orderTotalForPayment) {
        alert(`Cash amount (${SpiceClient.formatCurrency(cashAmount)}) cannot exceed total bill (${SpiceClient.formatCurrency(orderTotalForPayment)}).`);
        return;
      }

      cashAmount = Math.round(cashAmount * 100) / 100;
      const onlineAmount = Math.max(0, Math.round((orderTotalForPayment - cashAmount) * 100) / 100);

      let finalMode = 'SPLIT';
      if (cashAmount >= orderTotalForPayment) {
        finalMode = 'CASH';
      } else if (cashAmount <= 0) {
        finalMode = 'ONLINE';
      }

      closePaymentModal();
      handleGenerateBill({
        payment_mode: finalMode,
        cash_amount: cashAmount,
        online_amount: onlineAmount,
        discount_percent: currentDiscountPercent,
        discount_amount: currentDiscountAmount
      });
    });
  }

  async function loadMenu(showSpinner = true) {
    try {
      const res = await fetch('/api/menu');
      const json = await res.json();
      if (json.success) {
        categories = json.data.categories || [];
        menuItems = json.data.items || [];
        renderCategoriesNav();
        renderCatalog();
      }
    } catch (err) {
      console.error('Failed to load menu for waiter:', err);
    }
  }

  function renderCategoriesNav() {
    waiterCategoriesNav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = `waiter-cat-pill ${currentCategory === 'ALL' ? 'active' : ''}`;
    allBtn.setAttribute('data-cat', 'ALL');
    allBtn.textContent = 'All Categories';
    allBtn.addEventListener('click', () => {
      currentCategory = 'ALL';
      document.querySelectorAll('.waiter-cat-pill').forEach(p => p.classList.remove('active'));
      allBtn.classList.add('active');
      renderCatalog();
    });
    waiterCategoriesNav.appendChild(allBtn);

    categories.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = `waiter-cat-pill ${currentCategory === cat.id ? 'active' : ''}`;
      pill.setAttribute('data-cat', cat.id);
      pill.textContent = cat.name;
      pill.addEventListener('click', () => {
        currentCategory = cat.id;
        document.querySelectorAll('.waiter-cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        renderCatalog();
      });
      waiterCategoriesNav.appendChild(pill);
    });
  }

  // --- Search Normalization & Fuzzy Token Matching ---
  function normalizeText(str) {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getCategoryName(catId) {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.name : '';
  }

  function getItemSearchIndex(item) {
    if (item._searchIndex) return item._searchIndex;

    const catName = getCategoryName(item.category_id);
    const variants = (item.menu_item_variants || []).map(v => v.name).join(' ');

    const aliases = [];
    if (item.food_type === 'VEG') aliases.push('veg', 'vegetarian');
    if (item.food_type === 'NON_VEG') aliases.push('non veg', 'nonveg', 'chicken', 'egg', 'meat');
    if (item.food_type === 'DRINK') aliases.push('drink', 'beverage', 'cooler', 'coffee');

    const catLower = catName.toLowerCase();
    if (catLower.includes('hot')) aliases.push('hot');
    if (catLower.includes('iced')) aliases.push('iced', 'cold');
    if (catLower.includes('pizza')) aliases.push('pizza', 'pizzas');
    if (catLower.includes('pasta')) aliases.push('pasta', 'pastas', 'lasagne', 'lasagna');
    if (catLower.includes('burger')) aliases.push('burger', 'burgers');
    if (catLower.includes('main course') || catLower.includes('starter')) aliases.push('main course', 'maincourse', 'starter', 'starters', 'appetizer', 'snack');
    if (catLower.includes('toast') || catLower.includes('side') || catLower.includes('extra')) aliases.push('toast', 'toasts', 'bread', 'extras', 'sides');
    if (catLower.includes('shake')) aliases.push('shake', 'milkshake', 'smoothie');
    if (catLower.includes('mojito')) aliases.push('mojito', 'cooler', 'mocktail');
    if (catLower.includes('fried rice')) aliases.push('fried rice', 'rice');
    if (catLower.includes('rice bowl')) aliases.push('rice bowl', 'rice bowls', 'specials');
    if (catLower.includes('fries')) aliases.push('fries', 'french fries', 'potato');

    const rawCombined = [
      item.name,
      catName,
      aliases.join(' '),
      variants,
      item.description || ''
    ].join(' ');

    item._searchIndex = {
      normalizedName: normalizeText(item.name),
      normalizedCat: normalizeText(catName),
      normalizedCombined: normalizeText(rawCombined),
      catName
    };

    return item._searchIndex;
  }

  function matchItem(item, query) {
    if (!query) return { matches: true, score: 0 };

    const normQuery = normalizeText(query);
    if (!normQuery) return { matches: true, score: 0 };

    const tokens = normQuery.split(' ').filter(Boolean);
    if (tokens.length === 0) return { matches: true, score: 0 };

    const idx = getItemSearchIndex(item);

    // Every token must match somewhere in the combined index
    for (const token of tokens) {
      if (!idx.normalizedCombined.includes(token)) {
        return { matches: false, score: 0 };
      }
    }

    // Calculate relevance score
    let score = 0;

    // Exact full name match
    if (idx.normalizedName === normQuery) {
      score += 100;
    } else if (idx.normalizedName.startsWith(normQuery)) {
      score += 80;
    } else if (idx.normalizedName.includes(normQuery)) {
      score += 60;
    }

    // Token positions in name & category
    const nameWords = idx.normalizedName.split(' ');
    tokens.forEach(token => {
      if (nameWords.includes(token)) score += 30;
      else if (idx.normalizedName.includes(token)) score += 15;

      if (idx.normalizedCat.includes(token)) score += 10;
    });

    return { matches: true, score };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }

  function renderCatalog() {
    waiterCatalog.innerHTML = '';

    const currentOrder = getCurrentOrderItems();
    const hasSearch = Boolean(searchQuery && searchQuery.length > 0);

    const scored = [];
    menuItems.forEach(item => {
      if (currentCategory !== 'ALL' && item.category_id !== currentCategory) {
        return;
      }

      if (hasSearch) {
        const { matches, score } = matchItem(item, searchQuery);
        if (matches) {
          scored.push({ item, score });
        }
      } else {
        scored.push({ item, score: 0 });
      }
    });

    if (scored.length === 0) {
      waiterCatalog.innerHTML = `
        <div class="waiter-search-empty">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
          <h4>No dishes found ${hasSearch ? `matching "${escapeHtml(searchQuery)}"` : 'in this category'}</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
            ${hasSearch ? 'Try a shorter keyword like "rice", "pizza", "coffee", or "pasta".' : 'Select another category above.'}
          </p>
          ${hasSearch ? '<button type="button" class="btn btn-secondary btn-sm" id="emptyClearSearchBtn" style="margin-top: 14px; padding: 6px 16px;">Clear Search</button>' : ''}
        </div>`;

      const emptyClearBtn = document.getElementById('emptyClearSearchBtn');
      if (emptyClearBtn) {
        emptyClearBtn.addEventListener('click', () => {
          waiterSearchInput.value = '';
          handleSearch('');
          waiterSearchInput.focus();
        });
      }
      return;
    }

    // Sort items for waiter: AVAILABLE items first, UNAVAILABLE at the bottom.
    // If searching, sort by highest relevance score first.
    scored.sort((a, b) => {
      const aAvail = a.item.is_available ? 1 : 0;
      const bAvail = b.item.is_available ? 1 : 0;
      if (aAvail !== bAvail) {
        return bAvail - aAvail;
      }
      if (hasSearch && b.score !== a.score) {
        return b.score - a.score;
      }
      return a.item.name.localeCompare(b.item.name);
    });

    scored.forEach(({ item }) => {
      const card = document.createElement('div');
      const isUnavailable = !item.is_available;
      card.className = `waiter-item-card ${isUnavailable ? 'disabled' : ''}`;

      const variants = item.menu_item_variants || [];
      const hasVariants = variants.length > 0;
      const catName = getCategoryName(item.category_id);

      // Calculate quantity currently ordered for this item
      let qtyInOrder = 0;
      if (!hasVariants) {
        const match = currentOrder.find(oi => oi.menu_item_id === item.id);
        qtyInOrder = match ? match.quantity : 0;
      } else {
        const variantItems = currentOrder.filter(oi => oi.menu_item_id === item.id);
        qtyInOrder = variantItems.reduce((sum, v) => sum + v.quantity, 0);
      }

      // Display price
      let displayPrice = SpiceClient.formatCurrency(item.price);
      if (hasVariants) {
        const minPrice = Math.min(...variants.map(v => v.price));
        const maxPrice = Math.max(...variants.map(v => v.price));
        displayPrice = `${SpiceClient.formatCurrency(minPrice)} - ${SpiceClient.formatCurrency(maxPrice)}`;
      }

      let dietClass = 'veg';
      if (item.food_type === 'NON_VEG') dietClass = 'non-veg';
      else if (item.food_type === 'DRINK') dietClass = 'drink';
      else if (item.food_type === 'NEEDS_CONFIRMATION') dietClass = 'confirm';

      card.innerHTML = `
        <div class="waiter-item-info">
          <div class="waiter-item-title-row">
            <span class="badge-diet ${dietClass}"></span>
            <span class="waiter-item-title">${item.name}</span>
          </div>
          <div class="waiter-item-meta-row">
            <span class="waiter-item-price">${displayPrice} ${hasVariants ? '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(Choose size)</span>' : ''}</span>
            ${catName ? `<span class="waiter-item-cat-badge">${catName}</span>` : ''}
          </div>
          ${isUnavailable ? '<span style="color: #ef4444; font-size: 0.75rem; font-weight: 700; display: inline-block; margin-top: 4px;">UNAVAILABLE</span>' : ''}
        </div>
        <div class="waiter-item-action" id="action-wrap-${item.id}">
        </div>
      `;

      const actionWrap = card.querySelector(`#action-wrap-${item.id}`);

      if (isUnavailable) {
        actionWrap.innerHTML = `<span style="font-size: 0.8rem; color: var(--text-muted);">Disabled</span>`;
      } else if (hasVariants) {
        // Multi-size variant item
        const addVarBtn = document.createElement('button');
        addVarBtn.className = 'btn-add-item';
        addVarBtn.innerHTML = `<span>Size +</span>${qtyInOrder > 0 ? `<span class="pill pill-veg" style="padding: 1px 6px; font-size: 0.7rem;">${qtyInOrder}</span>` : ''}`;
        addVarBtn.addEventListener('click', () => openVariantModal(item));
        actionWrap.appendChild(addVarBtn);
      } else if (qtyInOrder > 0) {
        // Stepper: - / qty / +
        const stepper = document.createElement('div');
        stepper.className = 'qty-stepper';
        stepper.innerHTML = `
          <button type="button" class="qty-btn dec-btn">&minus;</button>
          <span class="qty-value">${qtyInOrder}</span>
          <button type="button" class="qty-btn inc-btn">&plus;</button>
        `;

        stepper.querySelector('.dec-btn').addEventListener('click', () => {
          updateItemQuantity(item.id, null, -1);
        });
        stepper.querySelector('.inc-btn').addEventListener('click', () => {
          updateItemQuantity(item.id, null, 1);
        });

        actionWrap.appendChild(stepper);
      } else {
        // Quick Add Button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add-item';
        addBtn.textContent = 'Add +';
        addBtn.addEventListener('click', () => {
          addItemToTableOrder(item.id, null, item.name, null, item.price, item.food_type);
        });
        actionWrap.appendChild(addBtn);
      }

      waiterCatalog.appendChild(card);
    });
  }

  function openVariantModal(item) {
    variantItemTitle.textContent = item.name;
    variantOptionsList.innerHTML = '';

    const variants = item.menu_item_variants || [];
    variants.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.justifyContent = 'space-between';
      btn.innerHTML = `
        <span style="font-weight: 700; color: var(--text-white);">${v.name}</span>
        <span style="color: var(--spice-gold); font-weight: 700;">${SpiceClient.formatCurrency(v.price)}</span>
      `;
      btn.addEventListener('click', () => {
        addItemToTableOrder(item.id, v.id, item.name, v.name, v.price, item.food_type);
        variantModal.classList.remove('active');
      });
      variantOptionsList.appendChild(btn);
    });

    variantModal.classList.add('active');
  }

  function addItemToTableOrder(itemId, variantId, name, variantName, price, foodType) {
    const order = getCurrentOrderItems();
    const existing = order.find(oi => oi.menu_item_id === itemId && oi.variant_id === variantId);

    if (existing) {
      existing.quantity += 1;
    } else {
      const matched = menuItems.find(m => m.id === itemId);
      order.push({
        menu_item_id: itemId,
        variant_id: variantId || null,
        name,
        variant_name: variantName || null,
        price: Number(price),
        quantity: 1,
        food_type: foodType || (matched ? matched.food_type : null)
      });
    }

    updateBottomBar();
    renderOrderTabs();
    renderCatalog();
  }

  function updateItemQuantity(itemId, variantId, delta) {
    const order = getCurrentOrderItems();
    const existingIndex = order.findIndex(oi => oi.menu_item_id === itemId && oi.variant_id === variantId);
    if (existingIndex === -1) return;

    order[existingIndex].quantity += delta;
    if (order[existingIndex].quantity <= 0) {
      order.splice(existingIndex, 1);
    }

    updateBottomBar();
    renderOrderTabs();
    renderCatalog();
  }

  function updateBottomBar() {
    const order = getCurrentOrderItems();
    const totalItems = order.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = order.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const activeOrder = getSelectedActiveOrder();

    let tableText = '';
    if (activeOrder) {
      tableText = `Table ${activeTable} • Order #${activeOrder.order_number}`;
    } else {
      const activeList = activeOrdersByTable[activeTable] || [];
      tableText = activeList.length > 0
        ? `Table ${activeTable} • New (${activeList.length} serving)`
        : `Table ${activeTable} • New Order`;
    }

    // Modern View Cart button elements
    if (cartBadgeCount) {
      const prevCount = parseInt(cartBadgeCount.textContent || '0', 10);
      cartBadgeCount.textContent = totalItems;
      if (totalItems > prevCount) {
        cartBadgeCount.classList.remove('bump');
        void cartBadgeCount.offsetWidth; // force DOM reflow
        cartBadgeCount.classList.add('bump');
      }
    }
    if (cartBadgeTotal) {
      cartBadgeTotal.textContent = SpiceClient.formatCurrency(subtotal);
    }
    if (cartBadgeSub) {
      cartBadgeSub.textContent = `${tableText} • ${totalItems} item${totalItems === 1 ? '' : 's'}`;
    }

    // Backward-compatible fallback for legacy peek lines if present
    if (peekTableLine) peekTableLine.textContent = tableText;
    if (peekTotalLine) peekTotalLine.textContent = SpiceClient.formatCurrency(subtotal);
    if (peekCountLine) peekCountLine.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'} • Tap to review`;

    if (saveServingBtn) {
      saveServingBtn.disabled = totalItems === 0 || isSubmitting;
      saveServingBtn.innerHTML = activeOrder
        ? `<span>🍽️ Update Serving</span>`
        : `<span>🍽️ Keep Serving</span>`;
    }

    if (generateBillBtn) {
      generateBillBtn.disabled = totalItems === 0 || isSubmitting;
    }
  }

  function openDrawer() {
    const order = getCurrentOrderItems();
    const activeOrder = getSelectedActiveOrder();
    drawerTitle.textContent = activeOrder 
      ? `Table ${activeTable} Review • Order #${activeOrder.order_number}`
      : `Table ${activeTable} • New Order Review`;
    drawerItemsList.innerHTML = '';

    if (order.length === 0) {
      drawerItemsList.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No items added for this order yet.</p>`;
      drawerTotalAmount.textContent = '₹0';
      if (drawerSaveServingBtn) drawerSaveServingBtn.disabled = true;
      drawerGenerateBtn.disabled = true;
    } else {
      let subtotal = 0;
      order.forEach(oi => {
        const lineTotal = oi.price * oi.quantity;
        subtotal += lineTotal;

        const diet = getItemDietInfo(oi, menuItems);
        const row = document.createElement('div');
        row.className = 'drawer-item-row';
        row.innerHTML = `
          <div>
            <div style="font-weight: 600; color: var(--text-white); display: flex; align-items: center; gap: 8px;">
              <span class="bill-diet-badge ${diet.badgeClass}" title="${diet.label}"><span class="diet-shape"></span></span>
              <span>${(window.escapeHtml || escapeHtml)(oi.name)} ${oi.variant_name ? `<span style="color: var(--spice-gold); font-size: 0.8rem;">(${(window.escapeHtml || escapeHtml)(oi.variant_name)})</span>` : ''}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-left: 20px;">${SpiceClient.formatCurrency(oi.price)} each</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="qty-stepper">
              <button type="button" class="qty-btn dec">&minus;</button>
              <span class="qty-value">${oi.quantity}</span>
              <button type="button" class="qty-btn inc">&plus;</button>
            </div>
            <div style="min-width: 60px; text-align: right; font-weight: 700; color: var(--spice-gold);">
              ${SpiceClient.formatCurrency(lineTotal)}
            </div>
          </div>
        `;

        row.querySelector('.dec').addEventListener('click', () => {
          updateItemQuantity(oi.menu_item_id, oi.variant_id, -1);
          openDrawer();
        });
        row.querySelector('.inc').addEventListener('click', () => {
          updateItemQuantity(oi.menu_item_id, oi.variant_id, 1);
          openDrawer();
        });

        drawerItemsList.appendChild(row);
      });

      drawerTotalAmount.textContent = SpiceClient.formatCurrency(subtotal);
      if (drawerSaveServingBtn) {
        drawerSaveServingBtn.disabled = isSubmitting;
        drawerSaveServingBtn.textContent = activeOrder ? '🍽️ Update Serving' : '🍽️ Keep Serving';
      }
      drawerGenerateBtn.disabled = isSubmitting;
    }

    if (activeOrder && activeOrder.id) {
      if (cancelOrderBtn) {
        cancelOrderBtn.style.display = 'inline-block';
        cancelOrderBtn.textContent = `🚫 Cancel #${activeOrder.order_number}`;
        cancelOrderBtn.disabled = isSubmitting;
      }
      if (clearOrderBtn) clearOrderBtn.style.display = 'none';
    } else {
      if (cancelOrderBtn) cancelOrderBtn.style.display = 'none';
      if (clearOrderBtn) clearOrderBtn.style.display = 'inline-block';
    }

    orderDrawer.classList.add('active');
  }

  function closeDrawer() {
    orderDrawer.classList.remove('active');
  }

  // CANCEL ACTIVE SERVING ORDER
  async function handleCancelActiveOrder(orderId) {
    if (!orderId || isSubmitting) return;
    isSubmitting = true;
    if (cancelOrderBtn) cancelOrderBtn.disabled = true;

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to cancel order.');

      // Remove from active orders list for this table
      const list = activeOrdersByTable[activeTable] || [];
      activeOrdersByTable[activeTable] = list.filter(o => String(o.id) !== String(orderId));
      delete orderCarts[String(orderId)];

      // If the cancelled order was the selected one, switch to remaining active order or 'new'
      if (String(selectedOrderIdByTable[activeTable]) === String(orderId)) {
        const remaining = activeOrdersByTable[activeTable];
        selectedOrderIdByTable[activeTable] = (remaining && remaining.length > 0) ? remaining[0].id : 'new';
      }

      updateTableGridIndicators();
      renderOrderTabs();
      updateBottomBar();
      renderCatalog();
      closeDrawer();
      alert(`❌ Order #${json.data ? json.data.order_number : ''} has been cancelled.`);
    } catch (err) {
      alert(`Error cancelling order: ${err.message}`);
    } finally {
      isSubmitting = false;
      if (cancelOrderBtn) cancelOrderBtn.disabled = false;
      updateBottomBar();
    }
  }

  // SAVE ORDER & KEEP SERVING (Multi-Round & Multi-Order Ordering)
  async function handleSaveServingOrder() {
    const order = getCurrentOrderItems();
    if (order.length === 0 || isSubmitting) return;

    isSubmitting = true;
    if (saveServingBtn) {
      saveServingBtn.disabled = true;
      saveServingBtn.innerHTML = `<span>⏳ Saving...</span>`;
    }
    if (drawerSaveServingBtn) drawerSaveServingBtn.disabled = true;

    try {
      const activeOrder = getSelectedActiveOrder();
      let savedOrder;

      if (activeOrder && activeOrder.id) {
        // Update existing active order
        const res = await fetch(`/api/orders/${activeOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: order.map(i => ({
              menu_item_id: i.menu_item_id,
              variant_id: i.variant_id || null,
              variant_name: i.variant_name || i.variant_name_snapshot || null,
              price: i.price !== undefined ? Number(i.price) : undefined,
              quantity: Number(i.quantity)
            })),
            waiter_id: currentUser.id,
            waiter_name: getCurrentStaffUsername(),
            status: 'CONFIRMED'
          })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to update serving order.');
        savedOrder = json.data;

        // Update locally
        const list = activeOrdersByTable[activeTable] || [];
        const idx = list.findIndex(o => String(o.id) === String(activeOrder.id));
        if (idx !== -1) list[idx] = savedOrder;
        orderCarts[String(savedOrder.id)] = [...order];
      } else {
        // Create new active serving order on this table
        const payload = {
          table_number: activeTable,
          waiter_id: currentUser.id,
          waiter_name: getCurrentStaffUsername(),
          idempotency_key: `order-${activeTable}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          status: 'CONFIRMED',
          items: order.map(i => ({
            menu_item_id: i.menu_item_id,
            variant_id: i.variant_id || null,
            variant_name: i.variant_name || i.variant_name_snapshot || null,
            price: i.price !== undefined ? Number(i.price) : undefined,
            quantity: Number(i.quantity)
          }))
        };
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed to start serving order.');
        savedOrder = json.data;

        if (!activeOrdersByTable[activeTable]) activeOrdersByTable[activeTable] = [];
        activeOrdersByTable[activeTable].push(savedOrder);
        orderCarts[String(savedOrder.id)] = [...order];
        orderCarts[`new_${activeTable}`] = [];
        selectedOrderIdByTable[activeTable] = savedOrder.id;
      }

      updateTableGridIndicators();
      renderOrderTabs();
      updateBottomBar();
      closeDrawer();
      renderCatalog();
    } catch (err) {
      alert(`Error saving order: ${err.message}`);
    } finally {
      isSubmitting = false;
      const activeOrder = getSelectedActiveOrder();
      if (saveServingBtn) {
        saveServingBtn.disabled = false;
        saveServingBtn.innerHTML = activeOrder
          ? `<span>🍽️ Update Serving</span>`
          : `<span>🍽️ Keep Serving</span>`;
      }
      if (drawerSaveServingBtn) drawerSaveServingBtn.disabled = false;
      updateBottomBar();
    }
  }

  // ATOMIC BILL GENERATION & COMPLETION (Customer is full)
  async function handleGenerateBill(paymentDetails = { payment_mode: 'CASH', cash_amount: 0, online_amount: 0 }) {
    const order = getCurrentOrderItems();
    if (order.length === 0 || isSubmitting) return;

    isSubmitting = true;
    generateBillBtn.disabled = true;
    generateBillBtn.innerHTML = `<span>⏳ Billing...</span>`;
    drawerGenerateBtn.disabled = true;

    try {
      const activeOrder = getSelectedActiveOrder();
      let orderIdToComplete;

      if (activeOrder && activeOrder.id) {
        // Sync any recent item changes first
        await fetch(`/api/orders/${activeOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: order.map(i => ({
              menu_item_id: i.menu_item_id,
              variant_id: i.variant_id || null,
              variant_name: i.variant_name || i.variant_name_snapshot || null,
              price: i.price !== undefined ? Number(i.price) : undefined,
              quantity: Number(i.quantity)
            })),
            waiter_id: currentUser.id,
            waiter_name: getCurrentStaffUsername()
          })
        });
        orderIdToComplete = activeOrder.id;
      } else {
        // Create initial order record
        const payload = {
          table_number: activeTable,
          waiter_id: currentUser.id,
          waiter_name: getCurrentStaffUsername(),
          idempotency_key: `order-${activeTable}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          status: 'CONFIRMED',
          payment_mode: paymentDetails.payment_mode || 'CASH',
          cash_amount: paymentDetails.cash_amount,
          online_amount: paymentDetails.online_amount,
          discount_percent: paymentDetails.discount_percent || 0,
          discount_amount: paymentDetails.discount_amount || 0,
          items: order.map(i => ({
            menu_item_id: i.menu_item_id,
            variant_id: i.variant_id || null,
            variant_name: i.variant_name || i.variant_name_snapshot || null,
            price: i.price !== undefined ? Number(i.price) : undefined,
            quantity: Number(i.quantity)
          }))
        };
        const createRes = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const createJson = await createRes.json();
        if (!createJson.success) throw new Error(createJson.error || 'Failed to create order.');
        orderIdToComplete = createJson.data.id;
      }

      // Mark order COMPLETED -> permanently enters history & analytics
      const completeRes = await fetch(`/api/orders/${orderIdToComplete}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_mode: paymentDetails.payment_mode || 'CASH',
          cash_amount: paymentDetails.cash_amount,
          online_amount: paymentDetails.online_amount,
          discount_percent: paymentDetails.discount_percent || 0,
          discount_amount: paymentDetails.discount_amount || 0
        })
      });
      const completeJson = await completeRes.json();
      if (!completeJson.success) throw new Error(completeJson.error || 'Failed to finalize bill.');

      const finalizedOrder = completeJson.data;
      if (finalizedOrder.discount_percent === undefined) {
        finalizedOrder.discount_percent = paymentDetails.discount_percent || 0;
      }
      if (finalizedOrder.discount_amount === undefined) {
        finalizedOrder.discount_amount = paymentDetails.discount_amount || 0;
      }
      if (finalizedOrder.subtotal === undefined) {
        finalizedOrder.subtotal = currentSubtotalForPayment || finalizedOrder.total;
      }
      if (!finalizedOrder.items || finalizedOrder.items.length === 0) {
        finalizedOrder.items = (finalizedOrder.order_items && finalizedOrder.order_items.length > 0)
          ? finalizedOrder.order_items
          : order.map(i => ({
              item_name_snapshot: i.name,
              variant_name_snapshot: i.variant_name,
              quantity: i.quantity,
              unit_price_snapshot: i.price,
              line_total: i.price * i.quantity
            }));
      }
      lastBilledOrder = finalizedOrder;

      // Remove completed order from active orders on this table
      const list = activeOrdersByTable[activeTable] || [];
      activeOrdersByTable[activeTable] = list.filter(o => String(o.id) !== String(orderIdToComplete));
      delete orderCarts[String(orderIdToComplete)];
      if (!activeOrder) {
        orderCarts[`new_${activeTable}`] = [];
      }

      // Reset selection for this table to 'new' so subsequent orders start cleanly
      selectedOrderIdByTable[activeTable] = 'new';
      orderCarts[`new_${activeTable}`] = [];

      updateTableGridIndicators();
      renderOrderTabs();
      updateBottomBar();
      renderCatalog();
      displayBillReceipt(finalizedOrder);

    } catch (err) {
      alert(`Bill Generation Failed: ${err.message}`);
    } finally {
      isSubmitting = false;
      generateBillBtn.disabled = false;
      generateBillBtn.innerHTML = `<span>⚡ Generate Bill</span>`;
      drawerGenerateBtn.disabled = false;
      updateBottomBar();
    }
  }

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

  function displayBillReceipt(order) {
    billTableText.textContent = `Table ${order.table_number}`;
    billOrderNumText.textContent = `Order #${order.order_number}`;
    billDateText.textContent = `Date: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[0]}`;
    billTimeText.textContent = `Time: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[1] || ''}`;
    billWaiterText.textContent = `Server: ${order.waiter_name_snapshot || getCurrentStaffUsername()}`;
    if (billStatusText) {
      billStatusText.textContent = `Status: ${order.status || 'COMPLETED'}`;
      billStatusText.style.color = (order.status === 'COMPLETED') ? '#16a34a' : 'var(--spice-gold)';
    }
    const subtotal = Number(order.subtotal != null ? order.subtotal : (order.total || 0));
    let discPct = Number(order.discount_percent || 0);
    let discAmt = Number(order.discount_amount || 0);

    // If discount was stored in notes, parse it: e.g. Discount: 10% (-₹60)
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

    if (billSubtotalRow) {
      billSubtotalRow.style.display = hasDiscount ? 'table-row' : 'none';
    }
    if (billDiscountRow) {
      billDiscountRow.style.display = hasDiscount ? 'table-row' : 'none';
    }

    if (hasDiscount) {
      if (billSubtotalText) billSubtotalText.textContent = SpiceClient.formatCurrency(subtotal);
      if (billDiscountLabelText) billDiscountLabelText.textContent = `Discount (${discPct}%):`;
      if (billDiscountAmountText) {
        billDiscountAmountText.textContent = `-${SpiceClient.formatCurrency(discAmt)}`;
        billDiscountAmountText.style.color = '#15803d';
      }
    }
    billTotalText.textContent = SpiceClient.formatCurrency(finalTotal);

    // Payment breakdown in bill
    if (billPaymentBox) {
      const { mode, cash, online } = getOrderPaymentBreakdown(order);

      if (billPaymentModeText) {
        if (mode === 'SPLIT') {
          billPaymentModeText.textContent = 'PARTIAL (CASH + ONLINE)';
        } else if (mode === 'ONLINE') {
          billPaymentModeText.textContent = 'FULL ONLINE / UPI';
        } else {
          billPaymentModeText.textContent = 'FULL CASH';
        }
      }

      if (billCashRow && billCashPaidText) {
        if (mode === 'SPLIT' || mode === 'CASH') {
          billCashRow.style.display = 'flex';
          if (billCashLabelText) billCashLabelText.textContent = 'Cash Paid:';
          billCashPaidText.textContent = SpiceClient.formatCurrency(cash);
        } else {
          billCashRow.style.display = 'none';
        }
      }

      if (billOnlineRow && billOnlinePaidText) {
        if (mode === 'SPLIT' || mode === 'ONLINE') {
          billOnlineRow.style.display = 'flex';
          if (billOnlineLabelText) {
            billOnlineLabelText.textContent = (mode === 'SPLIT') ? 'Amount Paid Online (Total - Cash):' : 'Online / UPI Paid:';
          }
          billOnlinePaidText.textContent = SpiceClient.formatCurrency(online);
        } else {
          billOnlineRow.style.display = 'none';
        }
      }
    }

    billItemsTbody.innerHTML = '';
    const items = (order.items && order.items.length > 0) ? order.items : (order.order_items || []);
    if (items.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="2" style="color: var(--text-secondary); font-weight: 600;">Cafe Order (Table ${order.table_number})</td>
        <td style="text-align: right; font-weight: 700;">${SpiceClient.formatCurrency(order.total)}</td>
      `;
      billItemsTbody.appendChild(tr);
    } else {
      items.forEach(oi => {
        const tr = document.createElement('tr');
        const diet = getItemDietInfo(oi, menuItems);
        const rawTitle = (oi.item_name_snapshot || oi.name || 'Item') + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
        const itemTitle = (window.escapeHtml || escapeHtml)(rawTitle);
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
          <td style="text-align: center; vertical-align: top;">${oi.quantity}</td>
          <td style="text-align: right; vertical-align: top; font-weight: 600;">${SpiceClient.formatCurrency(lineTotal)}</td>
        `;
        billItemsTbody.appendChild(tr);
      });
    }

    billModal.classList.add('active');
  }
});
