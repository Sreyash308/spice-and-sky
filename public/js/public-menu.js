/**
 * Public Menu Client Logic
 * Mobile-First QR Menu | Instant Realtime Updates | Prioritized Categories | Dynamic Dietary Filtering
 */

document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  let categories = [];
  let menuItems = [];
  let currentDietFilter = 'ALL';
  let searchQuery = '';
  let activeCategorySlug = '';
  let scrollSpyObserver = null;

  const DRINK_CATEGORY_SLUGS = [
    'hot-coffee',
    'iced-coffee',
    'coffee-extras',
    'milkshakes',
    'signature-coffee-drinks',
    'mojitos'
  ];

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
    updateView();
  });

  // Dietary Filter Listener
  dietButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dietButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDietFilter = btn.getAttribute('data-diet');
      updateView();
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
        updateView();
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

  function getFilteredItems() {
    const normQuery = searchQuery
      ? searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    const tokens = normQuery ? normQuery.split(' ').filter(Boolean) : [];

    return menuItems.filter(item => {
      const cat = categories.find(c => c.id === item.category_id);
      const catSlug = cat ? cat.slug : '';
      const isDrinkCat = DRINK_CATEGORY_SLUGS.includes(catSlug);

      // Dietary filter:
      if (currentDietFilter === 'VEG') {
        // Hide all drinks and non-veg subcategories
        if (isDrinkCat) return false;
        if (item.food_type !== 'VEG') return false;
      } else if (currentDietFilter === 'NON_VEG') {
        // Hide all drinks and veg subcategories
        if (isDrinkCat) return false;
        if (item.food_type !== 'NON_VEG') return false;
      } else if (currentDietFilter === 'DRINK') {
        // Show only applicable drink subcategories
        if (!isDrinkCat) return false;
      }

      // Smart multi-token search query
      if (tokens.length > 0) {
        const catName = cat ? cat.name : '';
        const aliases = [];
        const catLower = (catName || '').toLowerCase();
        if (catLower.includes('main course')) aliases.push('starter', 'starters', 'main course', 'maincourse');
        if (catLower.includes('toast')) aliases.push('toast', 'toasts', 'bread', 'sides', 'extras');
        if (catLower.includes('fried rice')) aliases.push('fried rice', 'rice bowl');
        if (catLower.includes('rice bowl')) aliases.push('rice bowl', 'rice bowls', 'specials');
        if (catLower.includes('pasta')) aliases.push('pasta', 'pastas', 'spaghetti', 'penne', 'lasagne', 'lasagna');

        const combined = `${item.name} ${catName} ${aliases.join(' ')} ${item.description || ''} ${item.food_type || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/&/g, 'and')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ');

        for (const token of tokens) {
          if (!combined.includes(token)) return false;
        }
      }

      return true;
    });
  }

  function getVisibleCategories(filteredItems) {
    return categories.filter(cat => {
      const isDrinkCat = DRINK_CATEGORY_SLUGS.includes(cat.slug);

      if (currentDietFilter === 'VEG') {
        if (isDrinkCat) return false;
      } else if (currentDietFilter === 'NON_VEG') {
        if (isDrinkCat) return false;
      } else if (currentDietFilter === 'DRINK') {
        if (!isDrinkCat) return false;
      }

      return filteredItems.some(item => item.category_id === cat.id);
    });
  }

  function updateView() {
    const filteredItems = getFilteredItems();
    const visibleCategories = getVisibleCategories(filteredItems);

    renderCategoryNav(visibleCategories);
    renderCatalog(filteredItems, visibleCategories);
    setupScrollSpy();
  }

  function renderCategoryNav(visibleCategories) {
    categoryNav.innerHTML = '';
    if (visibleCategories.length === 0) return;

    if (!visibleCategories.some(c => c.slug === activeCategorySlug)) {
      activeCategorySlug = visibleCategories[0].slug;
    }

    visibleCategories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = `category-tab-btn ${cat.slug === activeCategorySlug ? 'active' : ''}`;
      btn.textContent = cat.name;
      btn.setAttribute('data-cat-slug', cat.slug);
      btn.addEventListener('click', () => {
        activeCategorySlug = cat.slug;
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

  function renderCatalog(filteredItems, visibleCategories) {
    catalogContainer.innerHTML = '';

    if (filteredItems.length === 0 || visibleCategories.length === 0) {
      catalogContainer.innerHTML = `
        <div class="empty-state">
          <h3>No matching items found</h3>
          <p>Try searching for another dish or clearing your dietary filters.</p>
        </div>`;
      return;
    }

    // Group items by category in the prioritized visible sequence
    visibleCategories.forEach(cat => {
      const catItems = filteredItems.filter(i => i.category_id === cat.id);
      if (catItems.length === 0) return;

      const section = document.createElement('section');
      section.className = 'category-section';
      section.id = `cat-section-${cat.slug}`;
      section.setAttribute('data-cat-slug', cat.slug);

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

  function setupScrollSpy() {
    if (scrollSpyObserver) {
      scrollSpyObserver.disconnect();
      scrollSpyObserver = null;
    }

    const sections = document.querySelectorAll('.category-section');
    if (!sections.length || !('IntersectionObserver' in window)) return;

    scrollSpyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionSlug = entry.target.getAttribute('data-cat-slug');
          if (sectionSlug) {
            activeCategorySlug = sectionSlug;
            document.querySelectorAll('.category-tab-btn').forEach(btn => {
              const matches = btn.getAttribute('data-cat-slug') === sectionSlug;
              btn.classList.toggle('active', matches);
              if (matches) {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
              }
            });
          }
        }
      });
    }, {
      root: null,
      rootMargin: '-130px 0px -60% 0px',
      threshold: 0.05
    });

    sections.forEach(sec => scrollSpyObserver.observe(sec));
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
