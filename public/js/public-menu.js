/**
 * Public Menu Client Logic
 * Mobile-First QR Menu | Instant Realtime Updates | Filter & Search
 */

document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  let categories = [];
  let menuItems = [];
  let currentDietFilter = 'ALL';
  let searchQuery = '';

  const categoryNav = document.getElementById('categoryNavScroll');
  const catalogContainer = document.getElementById('menuCatalog');
  const searchInput = document.getElementById('menuSearchInput');
  const dietButtons = document.querySelectorAll('.filter-chip');

  // Fetch and render initial catalog
  await loadMenuData();

  // Listen to Realtime Menu Updates
  SpiceClient.on('menu_updated', (payload) => {
    console.log('⚡ Realtime menu update received:', payload);
    SpiceClient.showToast('Menu updated in real time');
    loadMenuData(false); // Silent re-render
  });

  // Search Listener
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderCatalog();
  });

  // Dietary Filter Listener
  dietButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dietButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDietFilter = btn.getAttribute('data-diet');
      renderCatalog();
    });
  });

  async function loadMenuData(showLoading = true) {
    if (showLoading) {
      catalogContainer.innerHTML = `
        <div class="empty-state">
          <h3>Loading rooftop menu...</h3>
          <p>Fetching fresh items and current prices...</p>
        </div>`;
    }

    try {
      const res = await fetch('/api/menu');
      const json = await res.json();
      if (json.success) {
        categories = json.data.categories || [];
        menuItems = json.data.items || [];
        renderCategoryNav();
        renderCatalog();
        window.dispatchEvent(new CustomEvent('spice_menu_loaded'));
      }
    } catch (err) {
      console.error('Failed to load menu:', err);
      catalogContainer.innerHTML = `
        <div class="empty-state">
          <h3>Failed to load menu</h3>
          <p>Please check your connection or ask your waiter for assistance.</p>
        </div>`;
    }
  }

  function renderCategoryNav() {
    categoryNav.innerHTML = '';
    categories.forEach((cat, idx) => {
      const btn = document.createElement('button');
      btn.className = `category-tab-btn ${idx === 0 ? 'active' : ''}`;
      btn.textContent = cat.name;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const section = document.getElementById(`cat-section-${cat.slug}`);
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      categoryNav.appendChild(btn);
    });
  }

  function renderCatalog() {
    catalogContainer.innerHTML = '';

    // Filter items
    const filteredItems = menuItems.filter(item => {
      // Dietary filter
      if (currentDietFilter === 'VEG' && item.food_type !== 'VEG') return false;
      if (currentDietFilter === 'NON_VEG' && item.food_type !== 'NON_VEG') return false;
      if (currentDietFilter === 'DRINK' && item.food_type !== 'DRINK') return false;

      // Search query
      if (searchQuery) {
        const matchName = item.name.toLowerCase().includes(searchQuery);
        const matchDesc = (item.description || '').toLowerCase().includes(searchQuery);
        if (!matchName && !matchDesc) return false;
      }

      return true;
    });

    if (filteredItems.length === 0) {
      catalogContainer.innerHTML = `
        <div class="empty-state">
          <h3>No matching items found</h3>
          <p>Try searching for another dish or clearing your dietary filters.</p>
        </div>`;
      return;
    }

    // Group items by category
    categories.forEach(cat => {
      const catItems = filteredItems.filter(i => i.category_id === cat.id);
      if (catItems.length === 0) return;

      const section = document.createElement('section');
      section.className = 'category-section';
      section.id = `cat-section-${cat.slug}`;

      const titleHeader = document.createElement('div');
      titleHeader.className = 'category-title-header';
      titleHeader.innerHTML = `
        <h2 class="category-title">${cat.name}</h2>
        <span class="category-count">${catItems.length} items</span>
      `;
      section.appendChild(titleHeader);

      const itemsGrid = document.createElement('div');
      itemsGrid.className = 'menu-items-grid';

      // Sort items for customer: AVAILABLE ITEMS FIRST (TOP), UNAVAILABLE AT THE BOTTOM
      catItems.sort((a, b) => {
        const aAvail = a.is_available ? 1 : 0;
        const bAvail = b.is_available ? 1 : 0;
        if (aAvail !== bAvail) {
          return bAvail - aAvail; // 1 (available) before 0 (unavailable)
        }
        return a.name.localeCompare(b.name);
      });

      catItems.forEach(item => {
        const card = createItemCard(item, cat.name);
        itemsGrid.appendChild(card);
      });

      section.appendChild(itemsGrid);
      catalogContainer.appendChild(section);
    });
  }

  function createItemCard(item, categoryName = '') {
    const card = document.createElement('article');
    card.className = `menu-card ${!item.is_available ? 'is-unavailable' : ''}`;
    card.id = `menu-item-${item.id}`;

    // Dietary badge class
    let dietClass = 'veg';
    if (item.food_type === 'NON_VEG') dietClass = 'non-veg';
    else if (item.food_type === 'DRINK') dietClass = 'drink';
    else if (item.food_type === 'NEEDS_CONFIRMATION') dietClass = 'confirm';

    // Image URL & Fallback Resolution
    const imgUrl = (window.SpiceSkyImages && window.SpiceSkyImages.getMenuItemImageUrl)
      ? window.SpiceSkyImages.getMenuItemImageUrl(item, categoryName)
      : (item.image_url || '/images/menu/fallbacks/food.webp');

    const fallbackUrl = (window.SpiceSkyImages && window.SpiceSkyImages.getFallbackImageUrl)
      ? window.SpiceSkyImages.getFallbackImageUrl(item.food_type, categoryName)
      : '/images/menu/fallbacks/food.webp';

    // Variants (e.g. Pizzas)
    const variants = item.menu_item_variants || [];
    let priceHtml = '';

    if (variants.length > 0) {
      priceHtml = `
        <div class="pizza-variants-row">
          ${variants.map(v => `
            <span class="variant-pill">
              <span class="var-name">${v.name}</span>
              <span class="var-price">${SpiceClient.formatCurrency(v.price)}</span>
            </span>
          `).join('')}
        </div>
      `;
    } else {
      priceHtml = `<div class="item-base-price">${SpiceClient.formatCurrency(item.price)}</div>`;
    }

    card.innerHTML = `
      <div class="menu-card-inner">
        <div class="menu-card-info">
          <div class="card-top-row">
            <div class="item-name-group">
              <span class="badge-diet ${dietClass}" title="${item.food_type}"></span>
              <h3 class="item-name">${item.name}</h3>
            </div>
            ${variants.length === 0 ? `<div class="item-price-col">${priceHtml}</div>` : ''}
          </div>
          ${variants.length > 0 ? priceHtml : ''}
          ${item.description ? `<p class="item-desc">${item.description}</p>` : ''}
          ${!item.is_available ? `
            <div class="item-status-row">
              <span class="pill pill-unavailable">Currently Unavailable</span>
            </div>
          ` : ''}
        </div>
        <div class="item-card-thumb-box">
          <img
            src="${imgUrl}"
            alt="${item.name}"
            loading="lazy"
            decoding="async"
            width="104"
            height="94"
            onerror="this.onerror=null;this.src='${fallbackUrl}';"
          />
        </div>
      </div>
    `;

    return card;
  }
});
