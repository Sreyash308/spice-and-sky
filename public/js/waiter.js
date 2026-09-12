/**
 * Waiter POS Terminal Logic
 * Fast Phone-First Interaction | 9 Tables | Server-Authoritative Bill Generation
 */

document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  // Guard: Require WAITER or ADMIN role
  const currentUser = SpiceClient.requireRole('WAITER', '/waiter/login');
  if (!currentUser) return;

  const waiterNameDisplay = document.getElementById('waiterNameDisplay');
  const waiterIcon = document.getElementById('waiterIcon');
  const waiterSignOutBtn = document.getElementById('waiterSignOutBtn');

  if (waiterIcon) waiterIcon.textContent = '👔';
  if (waiterNameDisplay) waiterNameDisplay.textContent = 'Waiter';

  if (waiterSignOutBtn) {
    waiterSignOutBtn.addEventListener('click', async () => {
      await SpiceClient.signOut();
      window.location.href = '/waiter/login';
    });
  }

  // State
  let activeTable = 1;
  let categories = [];
  let menuItems = [];
  let currentCategory = 'ALL';
  let searchQuery = '';
  let isSubmitting = false;

  // Active table cart: tableOrders[tableNumber] = [ { menu_item_id, variant_id, name, variant_name, price, quantity } ]
  const tableOrders = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };

  // DOM Elements
  const tablesGrid = document.getElementById('tablesGrid');
  const activeTableCallout = document.getElementById('activeTableCallout');
  const waiterSearchInput = document.getElementById('waiterSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const waiterCategoriesNav = document.getElementById('waiterCategoriesNav');
  const waiterCatalog = document.getElementById('waiterCatalog');

  const orderPeekTrigger = document.getElementById('orderPeekTrigger');
  const peekTableLine = document.getElementById('peekTableLine');
  const peekTotalLine = document.getElementById('peekTotalLine');
  const peekCountLine = document.getElementById('peekCountLine');
  const generateBillBtn = document.getElementById('generateBillBtn');

  const orderDrawer = document.getElementById('orderDrawer');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerItemsList = document.getElementById('drawerItemsList');
  const drawerTotalAmount = document.getElementById('drawerTotalAmount');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const clearOrderBtn = document.getElementById('clearOrderBtn');
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
  const billItemsTbody = document.getElementById('billItemsTbody');
  const billTotalText = document.getElementById('billTotalText');
  const printBillBtn = document.getElementById('printBillBtn');
  const newOrderBtn = document.getElementById('newOrderBtn');

  // Table Selector Events (Table 1 through 9) - Wire immediately for instant responsiveness
  tablesGrid.querySelectorAll('.table-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTable = Number(btn.getAttribute('data-table'));
      selectTable(selectedTable);
    });
  });

  updateBottomBar();

  // Load Menu Data
  waiterCatalog.innerHTML = `
    <div style="text-align: center; padding: 40px 16px; color: var(--text-muted); grid-column: 1 / -1;">
      <p style="font-size: 1rem;">Loading menu catalog...</p>
    </div>`;
  await loadMenu();

  // Listen to Realtime Menu Updates
  SpiceClient.on('menu_updated', () => {
    SpiceClient.showToast('Menu updated in real time');
    loadMenu(false);
  });

  function selectTable(num) {
    if (num < 1 || num > 9) return;
    activeTable = num;

    tablesGrid.querySelectorAll('.table-btn').forEach(b => {
      b.classList.toggle('active', Number(b.getAttribute('data-table')) === num);
    });

    activeTableCallout.textContent = `Table ${num} Selected`;
    updateBottomBar();
    renderCatalog();
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
    if (confirm(`Clear all items for Table ${activeTable}?`)) {
      tableOrders[activeTable] = [];
      updateBottomBar();
      renderCatalog();
      closeDrawer();
    }
  });

  generateBillBtn.addEventListener('click', () => handleGenerateBill());
  drawerGenerateBtn.addEventListener('click', () => {
    closeDrawer();
    handleGenerateBill();
  });

  cancelVariantBtn.addEventListener('click', () => {
    variantModal.classList.remove('active');
  });

  printBillBtn.addEventListener('click', () => {
    SpiceClient.printReceipt(document.getElementById('printableReceipt'));
  });

  newOrderBtn.addEventListener('click', () => {
    billModal.classList.remove('active');
    tableOrders[activeTable] = [];
    updateBottomBar();
    renderCatalog();
  });

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

    const currentOrder = tableOrders[activeTable] || [];
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
          addItemToTableOrder(item.id, null, item.name, null, item.price);
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
        addItemToTableOrder(item.id, v.id, item.name, v.name, v.price);
        variantModal.classList.remove('active');
      });
      variantOptionsList.appendChild(btn);
    });

    variantModal.classList.add('active');
  }

  function addItemToTableOrder(itemId, variantId, name, variantName, price) {
    const order = tableOrders[activeTable];
    const existing = order.find(oi => oi.menu_item_id === itemId && oi.variant_id === variantId);

    if (existing) {
      existing.quantity += 1;
    } else {
      order.push({
        menu_item_id: itemId,
        variant_id: variantId || null,
        name,
        variant_name: variantName || null,
        price: Number(price),
        quantity: 1
      });
    }

    updateBottomBar();
    renderCatalog();
  }

  function updateItemQuantity(itemId, variantId, delta) {
    const order = tableOrders[activeTable];
    const existingIndex = order.findIndex(oi => oi.menu_item_id === itemId && oi.variant_id === variantId);
    if (existingIndex === -1) return;

    order[existingIndex].quantity += delta;
    if (order[existingIndex].quantity <= 0) {
      order.splice(existingIndex, 1);
    }

    updateBottomBar();
    renderCatalog();
  }

  function updateBottomBar() {
    const order = tableOrders[activeTable] || [];
    const totalItems = order.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = order.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    peekTableLine.textContent = `Table ${activeTable} Order`;
    peekTotalLine.textContent = SpiceClient.formatCurrency(subtotal);
    peekCountLine.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'} • Tap to review`;

    generateBillBtn.disabled = totalItems === 0 || isSubmitting;
  }

  function openDrawer() {
    const order = tableOrders[activeTable] || [];
    drawerTitle.textContent = `Table ${activeTable} Order Review`;
    drawerItemsList.innerHTML = '';

    if (order.length === 0) {
      drawerItemsList.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No items added for Table ${activeTable} yet.</p>`;
      drawerTotalAmount.textContent = '₹0';
      drawerGenerateBtn.disabled = true;
    } else {
      let subtotal = 0;
      order.forEach(oi => {
        const lineTotal = oi.price * oi.quantity;
        subtotal += lineTotal;

        const row = document.createElement('div');
        row.className = 'drawer-item-row';
        row.innerHTML = `
          <div>
            <div style="font-weight: 600; color: var(--text-white);">${oi.name} ${oi.variant_name ? `<span style="color: var(--spice-gold); font-size: 0.8rem;">(${oi.variant_name})</span>` : ''}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${SpiceClient.formatCurrency(oi.price)} each</div>
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
          openDrawer(); // Re-render drawer
        });
        row.querySelector('.inc').addEventListener('click', () => {
          updateItemQuantity(oi.menu_item_id, oi.variant_id, 1);
          openDrawer(); // Re-render drawer
        });

        drawerItemsList.appendChild(row);
      });

      drawerTotalAmount.textContent = SpiceClient.formatCurrency(subtotal);
      drawerGenerateBtn.disabled = isSubmitting;
    }

    orderDrawer.classList.add('active');
  }

  function closeDrawer() {
    orderDrawer.classList.remove('active');
  }

  // ATOMIC BILL GENERATION
  async function handleGenerateBill() {
    const order = tableOrders[activeTable] || [];
    if (order.length === 0 || isSubmitting) return;

    isSubmitting = true;
    generateBillBtn.disabled = true;
    generateBillBtn.innerHTML = `<span>⏳ Processing...</span>`;
    drawerGenerateBtn.disabled = true;

    // Build payload for atomic server RPC
    const payload = {
      table_number: activeTable,
      waiter_id: currentUser.id,
      waiter_name: currentUser.role === 'WAITER' ? (currentUser.display_name || 'Waiter') : 'Waiter',
      idempotency_key: `order-${activeTable}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      items: order.map(i => ({
        menu_item_id: i.menu_item_id,
        variant_id: i.variant_id,
        quantity: i.quantity
      }))
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to generate bill.');
      }

      const billData = json.data;
      displayBillReceipt(billData);

    } catch (err) {
      alert(`Bill Generation Failed: ${err.message}`);
    } finally {
      isSubmitting = false;
      generateBillBtn.disabled = false;
      generateBillBtn.innerHTML = `<span>⚡ Generate Bill</span>`;
      drawerGenerateBtn.disabled = false;
    }
  }

  function displayBillReceipt(order) {
    billTableText.textContent = `Table ${order.table_number}`;
    billOrderNumText.textContent = `Order #${order.order_number}`;
    billDateText.textContent = `Date: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[0]}`;
    billTimeText.textContent = `Time: ${SpiceClient.formatDateTimeIST(order.created_at).split(',')[1] || ''}`;
    billWaiterText.textContent = `Waiter: ${order.waiter_name_snapshot || 'Waiter'}`;
    billTotalText.textContent = SpiceClient.formatCurrency(order.total);

    billItemsTbody.innerHTML = '';
    const items = order.items || [];
    items.forEach(oi => {
      const tr = document.createElement('tr');
      const itemTitle = oi.item_name_snapshot + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
      tr.innerHTML = `
        <td>${itemTitle}</td>
        <td style="text-align: center;">${oi.quantity}</td>
        <td style="text-align: right;">${SpiceClient.formatCurrency(oi.line_total)}</td>
      `;
      billItemsTbody.appendChild(tr);
    });

    billModal.classList.add('active');
  }
});
