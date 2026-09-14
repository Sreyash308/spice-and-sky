/**
 * Local Reference Store for Spice & Sky Rooftop Cafe
 * Provides authoritative data initialization, atomic order creation,
 * historical price snapshots, and analytics when operating in local/offline mode.
 */

const crypto = require('crypto');
const EventEmitter = require('events');

let LOCAL_IMAGE_MAP = {};
try {
  const auditData = require('../scripts/image_audit.json');
  auditData.forEach(item => {
    LOCAL_IMAGE_MAP[item.name] = item.image_url;
  });
  LOCAL_IMAGE_MAP['Cheesy Garlic Bread'] = '/images/menu/cheesy-garlic-bread.webp';
} catch (e) {
  // Fallback if audit JSON is not loaded
}

function parsePaymentDetails(order, fallbackOrder = null) {
  const total = Number(order && order.total != null ? order.total : (fallbackOrder && fallbackOrder.total != null ? fallbackOrder.total : 0)) || 0;
  const notes = String((order && order.notes) || (fallbackOrder && fallbackOrder.notes) || '');

  let mode = null;
  if (order && order.payment_mode) {
    mode = String(order.payment_mode).toUpperCase();
  } else if (fallbackOrder && fallbackOrder.payment_mode) {
    mode = String(fallbackOrder.payment_mode).toUpperCase();
  } else if (/Payment:\s*SPLIT/i.test(notes)) {
    mode = 'SPLIT';
  } else if (/Payment:\s*CASH/i.test(notes)) {
    mode = 'CASH';
  } else if (/Payment:\s*ONLINE/i.test(notes)) {
    mode = 'ONLINE';
  }

  let notesCash = null;
  let notesOnline = null;
  const cashMatch = notes.match(/Cash:\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (cashMatch) notesCash = Number(cashMatch[1]);
  const onlineMatch = notes.match(/Online:\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (onlineMatch) notesOnline = Number(onlineMatch[1]);

  let cash = null;
  let online = null;

  if (order && order.cash_amount != null && !isNaN(Number(order.cash_amount))) {
    cash = Number(order.cash_amount);
  } else if (fallbackOrder && fallbackOrder.cash_amount != null && !isNaN(Number(fallbackOrder.cash_amount))) {
    cash = Number(fallbackOrder.cash_amount);
  }

  if (order && order.online_amount != null && !isNaN(Number(order.online_amount))) {
    online = Number(order.online_amount);
  } else if (fallbackOrder && fallbackOrder.online_amount != null && !isNaN(Number(fallbackOrder.online_amount))) {
    online = Number(fallbackOrder.online_amount);
  }

  if (mode === 'SPLIT') {
    if ((cash == null || cash === 0) && notesCash != null && notesCash > 0) {
      cash = notesCash;
    }
    if ((online == null || online === 0 || online === total) && notesOnline != null && notesOnline > 0) {
      online = notesOnline;
    }
    if (cash != null && (online == null || online === total)) {
      online = Math.max(0, Math.round((total - cash) * 100) / 100);
    } else if (online != null && (cash == null || cash === 0)) {
      cash = Math.max(0, Math.round((total - online) * 100) / 100);
    }
  } else if (mode === 'CASH') {
    if (cash == null) cash = total;
    if (online == null) online = 0;
  } else if (mode === 'ONLINE') {
    if (online == null) online = total;
    if (cash == null) cash = 0;
  } else {
    if (notesCash != null && notesOnline != null && notesCash > 0 && notesOnline > 0) {
      mode = 'SPLIT';
      cash = notesCash;
      online = notesOnline;
    } else if (notesCash != null && notesCash > 0 && (!notesOnline || notesOnline === 0)) {
      mode = 'CASH';
      cash = total || notesCash;
      online = 0;
    } else {
      mode = 'ONLINE';
      cash = 0;
      online = total;
    }
  }

  cash = (cash != null && !isNaN(cash)) ? Math.round(Number(cash) * 100) / 100 : 0;
  online = (online != null && !isNaN(online)) ? Math.round(Number(online) * 100) / 100 : (mode === 'CASH' ? 0 : total);

  const status = (order && order.status) || (fallbackOrder && fallbackOrder.status) || 'CONFIRMED';
  const payment_status = (order && order.payment_status) || 
                         (fallbackOrder && fallbackOrder.payment_status) || 
                         (status === 'COMPLETED' ? 'PAID' : (status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'));

  return {
    payment_mode: mode || 'ONLINE',
    payment_status,
    cash_amount: cash,
    online_amount: online
  };
}

class CafeStore extends EventEmitter {
  constructor() {
    super();
    this.categories = [];
    this.menuItems = [];
    this.variants = [];
    this.orders = [];
    this.orderItems = [];
    this.profiles = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        role: 'ADMIN',
        username: 'admin@143',
        display_name: 'admin@143',
        email: 'admin@143'
      },
      {
        id: 'f80da808-79e6-45e0-801c-19064070a9a1',
        role: 'WAITER',
        username: 'Shan',
        display_name: 'Shan',
        email: 'shan@spiceandsky.com'
      },
      {
        id: 'f80da808-79e6-45e0-801c-19064070a9a2',
        role: 'WAITER',
        username: 'Yawar',
        display_name: 'Yawar',
        email: 'yawar@spiceandsky.com'
      },
      {
        id: 'f80da808-79e6-45e0-801c-19064070a9a3',
        role: 'WAITER',
        username: 'Nawaz',
        display_name: 'Nawaz',
        email: 'nawaz@spiceandsky.com'
      }
    ];
    this.orderSequence = 0;
    this.revokedTokens = new Set();
    this.initDefaultData();
  }

  initDefaultData() {
    // 18 Categories prioritized in exact specified order
    const categoryDefs = [
      { name: 'Main Course — Veg', slug: 'main-course-veg', display_order: 1 },
      { name: 'Main Course — Non-Veg', slug: 'main-course-non-veg', display_order: 2 },
      { name: 'Rice Bowls', slug: 'rice-bowls', display_order: 3 },
      { name: 'Pastas — Veg', slug: 'pastas-veg', display_order: 4 },
      { name: 'Pastas — Non-Veg', slug: 'pastas-non-veg', display_order: 5 },
      { name: 'French Fries', slug: 'french-fries', display_order: 6 },
      { name: 'Pizzas — Veg', slug: 'pizzas-veg', display_order: 7 },
      { name: 'Pizzas — Non-Veg', slug: 'pizzas-non-veg', display_order: 8 },
      { name: 'Burgers — Veg', slug: 'burgers-veg', display_order: 9 },
      { name: 'Burgers — Non-Veg', slug: 'burgers-non-veg', display_order: 10 },
      { name: 'Fried Rice', slug: 'fried-rice', display_order: 11 },
      { name: 'Toasts', slug: 'toasts', display_order: 12 },
      { name: 'Hot Coffee', slug: 'hot-coffee', display_order: 13 },
      { name: 'Iced Coffee', slug: 'iced-coffee', display_order: 14 },
      { name: 'Coffee Extras', slug: 'coffee-extras', display_order: 15 },
      { name: 'Milkshakes', slug: 'milkshakes', display_order: 16 },
      { name: 'Signature Coffee Drinks', slug: 'signature-coffee-drinks', display_order: 17 },
      { name: 'Mojitos', slug: 'mojitos', display_order: 18 }
    ];

    const catMap = {};
    categoryDefs.forEach(c => {
      const id = crypto.randomUUID();
      const catObj = { id, ...c, created_at: new Date().toISOString() };
      this.categories.push(catObj);
      catMap[c.slug] = id;
    });

    const addItem = (catSlug, name, price, foodType, desc, extra = {}) => {
      const id = crypto.randomUUID();
      const item = {
        id,
        category_id: catMap[catSlug],
        category_slug: catSlug,
        name,
        description: desc || '',
        price: Number(price),
        food_type: foodType,
        is_available: true,
        is_active: true,
        display_order: this.menuItems.length + 1,
        verification_note: extra.verification_note || null,
        image_url: extra.image_url || LOCAL_IMAGE_MAP[name] || '/images/menu/fallbacks/food.webp',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.menuItems.push(item);

      if (extra.variants) {
        extra.variants.forEach((v, idx) => {
          this.variants.push({
            id: crypto.randomUUID(),
            menu_item_id: id,
            name: v.name,
            price: Number(v.price),
            display_order: idx + 1,
            is_available: true,
            created_at: new Date().toISOString()
          });
        });
      }
      return item;
    };

    // Category 1: Main Course — Veg (formerly Starters — Veg)
    addItem('main-course-veg', 'Chilli Potato', 199, 'VEG', 'Potatoes blended in honey and chilli sauce.');
    addItem('main-course-veg', 'Chilli Paneer', 249, 'VEG', 'Paneer tossed in a traditional spicy red chilli flavour.');
    addItem('main-course-veg', 'Jalapeño Stick', 260, 'VEG', 'A mix of potato and jalapeño with a blend of cheese.');
    addItem('main-course-veg', 'Paneer Popcorn', 229, 'VEG', 'Crunchy bite-sized vegetarian snack featuring cubes of paneer coated in spiced batter and breadcrumbs.');
    addItem('main-course-veg', 'Paneer 65', 299, 'VEG', 'Spicy, crispy and flavorful paneer appetizer made by deep-frying paneer and tossing it with curry leaves, ginger, garlic and tangy spices.');
    addItem('main-course-veg', 'Loaded Fries', 299, 'VEG', 'French fries, paneer, jalapeño and peri peri dip.');
    addItem('main-course-veg', 'Broccoli Cheesey Stick', 299, 'NEEDS_CONFIRMATION', 'Chopped broccoli with shredded chicken.', {
      verification_note: 'IMPORTANT OWNER VERIFICATION: Menu listed under Veg Main Course but description specifies shredded chicken. Owner confirmation required.'
    });

    // Category 2: Main Course — Non-Veg (formerly Starters — Non-Veg)
    addItem('main-course-non-veg', 'Chilli Chicken', 279, 'NON_VEG', 'Dry / Wet. Tender chicken bites tossed in a bold, tangy and spicy Indo-Chinese gravy or dry glaze.');
    addItem('main-course-non-veg', 'Lemon Garlic Chicken', 269, 'NON_VEG', 'Chicken cooked with lemon, garlic and a rich buttery, tangy sauce.');
    addItem('main-course-non-veg', 'Honey Chicken', 289, 'NON_VEG', 'Chicken bites pan-seared and tossed in a sticky, sweet and savory glaze.');
    addItem('main-course-non-veg', 'Chicken Loaded Fries', 299, 'NON_VEG', 'French fries, chicken, jalapeño and peri peri dip.');
    addItem('main-course-non-veg', 'Spice & Sky Special Popcorn Chicken', 329, 'NON_VEG', 'Crunchy bite-sized chicken pieces coated in spiced batter and breadcrumbs with special spices.');
    addItem('main-course-non-veg', 'Chicken Popcorn', 199, 'NON_VEG', 'Crunchy bite-sized chicken pieces coated in spiced batter and breadcrumbs with special spices.');
    addItem('main-course-non-veg', 'Crispy Chicken', 279, 'NON_VEG', 'Tender chicken marinated and fried in crispy breadcrumbs.');

    // Category 3: Rice Bowls (formerly Specials)
    addItem('rice-bowls', 'Grilled Chicken with Brown Sauce', 320, 'NON_VEG', 'Rice, vegetables, salsa, cashews and brownies.');
    addItem('rice-bowls', 'Grilled Chicken with Lemon Butter Sauce', 360, 'NON_VEG', 'Mashed potatoes, vegetables, grilled chicken and lemon butter sauce.');

    // Category 4: Pastas — Veg
    addItem('pastas-veg', 'White Sauce Pasta', 249, 'VEG', 'A blend of vegetables with white sauce, cheese and spaghetti pasta.');
    addItem('pastas-veg', 'Pesto Penne Pasta', 259, 'VEG', 'Penne pasta with green pesto sauce and cheese.');
    addItem('pastas-veg', 'Pink Sauce Pasta', 279, 'VEG', 'Pink sauce pasta.', {
      verification_note: 'Original description inconsistent with dish name. Owner to confirm.'
    });
    addItem('pastas-veg', 'Aglio-Olio Pasta', 269, 'VEG', 'Aglio-olio pasta.', {
      verification_note: 'Original description inconsistent with Aglio-Olio. Owner to confirm.'
    });

    // Category 5: Pastas — Non-Veg (includes Lasagne)
    addItem('pastas-non-veg', 'White Sauce Pasta', 279, 'NON_VEG', 'Chicken with white sauce, cheese and penne/spaghetti pasta.');
    addItem('pastas-non-veg', 'Pesto Penne Pasta', 275, 'NON_VEG', 'Penne pasta with green pesto sauce, cheese and chicken.');
    addItem('pastas-non-veg', 'Pink Sauce Pasta', 289, 'NON_VEG', 'Pink sauce pasta.', {
      verification_note: 'Original description inconsistent with dish name. Owner to confirm.'
    });
    addItem('pastas-non-veg', 'Aglio-Olio Pasta', 295, 'NON_VEG', 'Aglio-olio pasta.', {
      verification_note: 'Original description inconsistent with Aglio-Olio. Owner to confirm.'
    });
    addItem('pastas-non-veg', 'Butter Chicken Sauce Pasta', 349, 'NON_VEG', 'Penne pasta served with traditional butter chicken gravy sauce.');
    addItem('pastas-non-veg', 'Lasagne', 355, 'NON_VEG', 'A dish made with multiple layers of pasta sheets, filled with vegetables or mixed chicken, baked and served with a combination of white and red sauce.');

    // Category 6: French Fries
    addItem('french-fries', 'Peri Peri Fries', 160, 'VEG', 'Crispy golden fries tossed in fiery Peri Peri spice blend.');
    addItem('french-fries', 'Classic Fries', 169, 'VEG', 'Lightly salted, golden crunchy potato fries.');
    addItem('french-fries', 'Spice & Sky Special Fries', 229, 'VEG', 'Signature loaded fries with rooftop spiced seasoning and house dips.');
    addItem('french-fries', 'Cheesy Fries', 199, 'VEG', 'Golden French fries smothered in warm, velvety melted cheese sauce.');

    // Category 7: Pizzas — Veg (6 inch, 12 inch)
    addItem('pizzas-veg', 'Classic Pizza', 199, 'VEG', 'Classic cheese pizza.', {
      variants: [{ name: '6 inch', price: 199 }, { name: '12 inch', price: 249 }]
    });
    addItem('pizzas-veg', 'Basil Margherita', 239, 'VEG', 'Fresh tomato, basil and cheese.', {
      variants: [{ name: '6 inch', price: 239 }, { name: '12 inch', price: 299 }]
    });
    addItem('pizzas-veg', 'Vegetable Pizza', 289, 'VEG', 'Black olive, corn, yellow capsicum, bell pepper and onion.', {
      variants: [{ name: '6 inch', price: 289 }, { name: '12 inch', price: 329 }]
    });
    addItem('pizzas-veg', 'Paneer Pizza', 299, 'VEG', 'Paneer and green capsicum.', {
      variants: [{ name: '6 inch', price: 299 }, { name: '12 inch', price: 349 }]
    });
    addItem('pizzas-veg', 'Mushroom Pizza', 329, 'VEG', 'Served with mushrooms.', {
      variants: [{ name: '6 inch', price: 329 }, { name: '12 inch', price: 369 }]
    });

    // Category 8: Pizzas — Non-Veg (9 inch, 12 inch)
    addItem('pizzas-non-veg', 'Chicken Pepperoni Pizza', 299, 'NON_VEG', 'Chicken pepperoni slices.', {
      verification_note: 'Normalized from OCR wording. Owner to confirm exact ingredient description.',
      variants: [{ name: '9 inch', price: 299 }, { name: '12 inch', price: 349 }]
    });
    addItem('pizzas-non-veg', 'Smoked Chicken Pizza', 329, 'NON_VEG', 'Smoky-flavored chicken pizza.', {
      variants: [{ name: '9 inch', price: 329 }, { name: '12 inch', price: 379 }]
    });
    addItem('pizzas-non-veg', 'Chicken Tikka Pizza', 349, 'NON_VEG', 'Black olive, corn, yellow capsicum, bell pepper and onion with chicken tikka.', {
      variants: [{ name: '9 inch', price: 349 }, { name: '12 inch', price: 399 }]
    });
    addItem('pizzas-non-veg', 'Barbecue Chicken Pizza', 349, 'NON_VEG', 'Served with barbecue chicken.', {
      variants: [{ name: '9 inch', price: 349 }, { name: '12 inch', price: 399 }]
    });
    addItem('pizzas-non-veg', 'Basil Chicken Pizza', 269, 'NON_VEG', 'Basil and chicken.', {
      variants: [{ name: '9 inch', price: 269 }, { name: '12 inch', price: 299 }]
    });

    // Category 9: Burgers — Veg
    addItem('burgers-veg', 'Veg Patty Burger', 129, 'VEG', 'Served with a vegetarian patty.');
    addItem('burgers-veg', 'Crispy Paneer Burger', 135, 'VEG', 'Paneer coated with crispy batter and served between two buns.');
    addItem('burgers-veg', 'Double Patty Burger', 155, 'VEG', 'Double patty with vegetables.');

    // Category 10: Burgers — Non-Veg
    addItem('burgers-non-veg', 'Chicken Patty Burger', 169, 'NON_VEG', 'Served with a chicken patty.');
    addItem('burgers-non-veg', 'Crispy Chicken Burger', 149, 'NON_VEG', 'Crispy chicken between two buns.');
    addItem('burgers-non-veg', 'Double Patty Burger', 175, 'NON_VEG', 'Double patty with vegetables and cheese slices.');

    // Category 11: Fried Rice (formerly Rice Bowls)
    addItem('fried-rice', 'Veg Fried Rice', 140, 'VEG', 'Traditional wok-tossed fried rice with fresh garden vegetables.');
    addItem('fried-rice', 'Veg Schezwan Fried Rice', 150, 'VEG', 'Spicy wok-tossed rice flavored with fiery Schezwan chili paste.');
    addItem('fried-rice', 'Brown Garlic Fried Rice', 160, 'VEG', 'Fragrant fried rice infused with golden toasted brown garlic.');
    addItem('fried-rice', 'Schezwan Veg Fried Rice', 160, 'VEG', 'Authentic spicy Schezwan rice with seasonal greens.');
    addItem('fried-rice', 'Egg Fried Rice', 158, 'NON_VEG', 'Scrambled eggs wok-tossed with aromatic seasoned rice.');
    addItem('fried-rice', 'Chicken Fried Rice', 165, 'NON_VEG', 'Tender chicken chunks tossed with vegetables and spiced rice.');
    addItem('fried-rice', 'Schezwan Egg Fried Rice', 170, 'NON_VEG', 'Spicy Schezwan egg fried rice with aromatic scallions.');
    addItem('fried-rice', 'Schezwan Chicken Fried Rice', 180, 'NON_VEG', 'Zesty Schezwan fried rice with tender spiced chicken pieces.');
    addItem('fried-rice', 'Schezwan Mix Fried Rice', 180, 'NON_VEG', 'Egg & Chicken.');

    // Category 12: Toasts (formerly Extras / Sides)
    addItem('toasts', 'Cheddar Cheese Slices', 120, 'VEG', '2 pcs.');
    addItem('toasts', 'Cheesy Garlic Bread', 150, 'VEG', '2 pcs. Warm toasted garlic bread with melted cheese.', {
      verification_note: 'Normalized from OCR "Pasta Cheese Garlic Bread". Owner to confirm exact menu name.'
    });
    addItem('toasts', 'Tossed Avocado Toss', 170, 'VEG', 'Fresh avocado chunks tossed with greens and light seasoning.');
    addItem('toasts', 'Avocado Mango Toss', 180, 'VEG', 'Refreshing combination of ripe avocado, sweet mango cubes, and citrus glaze.');
    addItem('toasts', 'Avocado Strawberry Toss', 190, 'VEG', 'Vibrant tossed salad with creamy avocado and sweet strawberries.');

    // Category 13: Hot Coffee
    addItem('hot-coffee', 'Espresso', 170, 'DRINK', 'Rich concentrated specialty coffee shot.');
    addItem('hot-coffee', 'Americano', 190, 'DRINK', 'Espresso diluted with hot water for a clean, bold cup.');
    addItem('hot-coffee', 'Long Black', 235, 'DRINK', 'Double espresso extracted over hot water, preserving the crema.');
    addItem('hot-coffee', 'Cappuccino', 219, 'DRINK', 'Equal parts espresso, silky steamed milk and dense velvety microfoam.');
    addItem('hot-coffee', 'Cortado', 230, 'DRINK', 'Equal parts espresso and warm steamed milk to reduce acidity.');
    addItem('hot-coffee', 'Flat White', 240, 'DRINK', 'Smooth double espresso blended with micro-foamed steamed milk.');
    addItem('hot-coffee', 'Latte', 220, 'DRINK', 'Mild and creamy espresso with steamed milk and a thin foam cap.');
    addItem('hot-coffee', 'Spanish Latte', 242, 'DRINK', 'Espresso balanced with steamed milk and sweetened condensed milk.');
    addItem('hot-coffee', 'Vanilla Latte', 280, 'DRINK', 'Classic latte sweetened with delicate Madagascar vanilla.');
    addItem('hot-coffee', 'Hazelnut Latte', 280, 'DRINK', 'Rich espresso and steamed milk infused with roasted hazelnut.');
    addItem('hot-coffee', 'Mocha', 280, 'DRINK', 'Espresso combined with artisanal dark chocolate and steamed milk.');
    addItem('hot-coffee', 'Vietnamese Latte', 245, 'DRINK', 'Intense dark roast coffee combined with sweetened condensed milk.');

    // Category 14: Iced Coffee
    addItem('iced-coffee', 'Americano', 220, 'DRINK', 'Chilled espresso poured over ice and cold filtered water.');
    addItem('iced-coffee', 'Cappuccino', 250, 'DRINK', 'Chilled espresso shaken with cold milk and topped with creamy foam.');
    addItem('iced-coffee', 'Long Black', 235, 'DRINK', 'Bold iced double espresso over chilled water.');
    addItem('iced-coffee', 'Latte', 220, 'DRINK', 'Refreshing iced espresso gently mixed with cold milk.');
    addItem('iced-coffee', 'Hazelnut Latte', 245, 'DRINK', 'Chilled latte layered with roasted hazelnut syrup.');
    addItem('iced-coffee', 'Vanilla Latte', 280, 'DRINK', 'Iced latte flavored with sweet vanilla bean.');
    addItem('iced-coffee', 'Spanish Latte', 240, 'DRINK', 'Chilled espresso and milk with sweet condensed milk over ice.');
    addItem('iced-coffee', 'Cranberry Espresso', 235, 'DRINK', 'Sparkling tart cranberry juice crowned with a bold espresso float.');
    addItem('iced-coffee', 'Classic Cold Coffee', 220, 'DRINK', 'Rich blended cold coffee with milk and sugar, cafe style.');
    addItem('iced-coffee', 'Caramel Macchiato', 240, 'DRINK', 'Cold milk marked with rich espresso and salted caramel drizzle.');
    addItem('iced-coffee', 'Iced Latte', 220, 'DRINK', 'Crisp iced espresso and fresh whole milk.');
    addItem('iced-coffee', 'Mocha Coffee', 245, 'DRINK', 'Chilled espresso, dark chocolate sauce and cold milk over ice.');
    addItem('iced-coffee', 'Vietnamese Latte', 240, 'DRINK', 'Iced robusta brew layered over thick sweetened condensed milk.');
    addItem('iced-coffee', 'Orange Espresso', 235, 'DRINK', 'Zesty fresh orange citrus paired with an aromatic espresso shot.');
    addItem('iced-coffee', 'Pineapple Espresso', 229, 'DRINK', 'Tropical sweet pineapple juice topped with chilled espresso.');

    // Category 15: Coffee Extras
    addItem('coffee-extras', 'Whipped Cream', 39, 'OTHER', 'Fluffy sweet whipped cream topping.');
    addItem('coffee-extras', 'Oat Milk', 69, 'OTHER', 'Dairy-free creamy oat milk substitution.');
    addItem('coffee-extras', 'Almond Milk', 79, 'OTHER', 'Silky roasted almond milk substitution.');

    // Category 16: Milkshakes
    addItem('milkshakes', 'Oreo Shake', 149, 'DRINK', 'Thick creamy milkshake blended with Oreo cookies and chocolate.');
    addItem('milkshakes', 'Banana Shake', 150, 'DRINK', 'Smooth milkshake made with sweet ripe bananas and fresh cream.');
    addItem('milkshakes', 'Hazelnut Shake', 169, 'DRINK', 'Decadent shake blended with roasted hazelnut paste.');
    addItem('milkshakes', 'Pistachio Shake', 155, 'DRINK', 'Nutty rich milkshake flavored with real green pistachios.');

    // Category 17: Signature Coffee Drinks
    addItem('signature-coffee-drinks', 'Salted Vietnamese Iced Coffee', 269, 'DRINK', 'Traditional Vietnamese coffee topped with salted cream cheese foam.');
    addItem('signature-coffee-drinks', 'Hazelnut Cream Iced Coffee', 279, 'DRINK', 'Iced coffee layered with silky whipped hazelnut cream.');
    addItem('signature-coffee-drinks', 'Biscoff Cream Iced Frappe', 275, 'DRINK', 'Blended iced coffee loaded with spiced Lotus Biscoff biscuit and cream.');
    addItem('signature-coffee-drinks', 'Mocha Cream Iced Coffee', 279, 'DRINK', 'Chilled mocha with dark chocolate fudge and velvety cream head.');
    addItem('signature-coffee-drinks', 'Pistachio Cream Iced Coffee', 277, 'DRINK', 'Chilled espresso crowned with delicate sweet pistachio foam.');
    addItem('signature-coffee-drinks', 'Hot Chocolate', 250, 'DRINK', 'Rich molten Belgian chocolate blended with warm whole milk.');

    // Category 18: Mojitos
    addItem('mojitos', 'Blueberry Mojito', 175, 'DRINK', 'Muddled fresh blueberries, mint leaves, lime juice and sparkling soda.');
    addItem('mojitos', 'Mint Mojito', 169, 'DRINK', 'Classic rooftop refresher with crushed mint sprigs, lime wedges and soda.');
    addItem('mojitos', 'Strawberry Mojito', 165, 'DRINK', 'Sweet crushed strawberries infused with garden mint and fizzy soda.');
    addItem('mojitos', 'Blue Curacao Mojito', 180, 'DRINK', 'Vibrant citrus blue curacao with fresh mint, lime and sparkling soda.');
  }

  // --- QUERY METHODS ---
  getCategories() {
    return [...this.categories].sort((a, b) => a.display_order - b.display_order);
  }

  getMenuItems(includeArchived = false) {
    return this.menuItems
      .filter(item => includeArchived ? true : item.is_active)
      .sort((a, b) => a.display_order - b.display_order);
  }

  getVariants() {
    return [...this.variants];
  }

  getMenuItemById(id) {
    return this.menuItems.find(i => i.id === id);
  }

  getVariantById(id) {
    return this.variants.find(v => v.id === id);
  }

  getVariantsByMenuItemId(menuItemId) {
    return this.variants.filter(v => v.menu_item_id === menuItemId);
  }

  enrichOrderItem(oi) {
    if (!oi) return oi;
    let food_type = oi.food_type;
    let variant_id = oi.variant_id || null;
    let variant_name = oi.variant_name_snapshot || oi.variant_name || null;
    let unit_price = Number(oi.unit_price_snapshot !== undefined ? oi.unit_price_snapshot : (oi.price || 0));

    const dbItem = oi.menu_item_id ? this.getMenuItemById(oi.menu_item_id) : null;
    if (dbItem) {
      if (!food_type) food_type = dbItem.food_type;
      const variants = dbItem.menu_item_variants || this.getVariantsByMenuItemId(dbItem.id) || [];
      if (variants.length > 0) {
        let matchedVariant = null;
        if (variant_id) {
          matchedVariant = variants.find(v => String(v.id) === String(variant_id));
        }
        if (!matchedVariant && variant_name) {
          const vn = String(variant_name).trim().toLowerCase();
          matchedVariant = variants.find(v => String(v.name).trim().toLowerCase() === vn)
            || variants.find(v => {
              const vn2 = String(v.name).trim().toLowerCase();
              return vn2.includes(vn) || vn.includes(vn2);
            });
        }
        if (!matchedVariant && unit_price > 0) {
          matchedVariant = variants.find(v => Math.abs(Number(v.price) - unit_price) < 0.01);
        }
        if (matchedVariant) {
          variant_id = matchedVariant.id;
          variant_name = matchedVariant.name;
          if (!unit_price || isNaN(unit_price)) unit_price = Number(matchedVariant.price);
        }
      }
    }
    if (!food_type) {
      const title = (oi.item_name_snapshot || oi.name || '').toLowerCase();
      if (title.includes('chicken') || title.includes('mutton') || title.includes('egg') || title.includes('fish') || title.includes('pepperoni') || title.includes('non-veg') || title.includes('non veg')) {
        food_type = 'NON_VEG';
      } else {
        food_type = 'VEG';
      }
    }
    return {
      ...oi,
      variant_id,
      variant_name_snapshot: variant_name,
      variant_name: variant_name,
      unit_price_snapshot: unit_price,
      price: unit_price,
      food_type
    };
  }

  // --- ATOMIC ORDER CREATION ---
  createOrderAtomic({ table_number, items, notes, idempotency_key, waiter_id, waiter_name, status, payment_mode, cash_amount, online_amount }) {
    const tableNum = Number(table_number);
    if (!tableNum || tableNum < 1 || tableNum > 9) {
      throw new Error(`Invalid table number: ${table_number}. Must be between 1 and 9.`);
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Order cannot be empty.');
    }

    // Idempotency check
    if (idempotency_key) {
      const existing = this.orders.find(o => o.idempotency_key === idempotency_key);
      if (existing) {
        return {
          ...existing,
          items: this.orderItems.filter(oi => oi.order_id === existing.id),
          idempotent_replay: true
        };
      }
    }

    let calculatedTotal = 0;
    const orderItemsToInsert = [];

    // Authoritative check & price snapshot
    for (const reqItem of items) {
      const dbItem = this.getMenuItemById(reqItem.menu_item_id);
      if (!dbItem) {
        throw new Error(`Menu item not found: ${reqItem.menu_item_id}`);
      }
      if (!dbItem.is_active) {
        throw new Error(`Item "${dbItem.name}" is no longer on the menu.`);
      }
      if (!dbItem.is_available) {
        throw new Error(`Item "${dbItem.name}" is currently unavailable.`);
      }

      const numQty = Number(reqItem.quantity);
      if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
        throw new Error(`Invalid quantity for item "${dbItem.name}". Quantity must be a positive whole integer.`);
      }
      const qty = numQty;

      let unitPrice = dbItem.price;
      let variantName = null;
      let matchedVariant = null;

      const variants = dbItem.menu_item_variants || this.getVariantsByMenuItemId(dbItem.id) || [];
      if (reqItem.variant_id && String(reqItem.variant_id) !== 'null' && String(reqItem.variant_id) !== 'undefined') {
        matchedVariant = variants.find(v => String(v.id) === String(reqItem.variant_id)) || this.getVariantById(reqItem.variant_id);
      }
      if (!matchedVariant && (reqItem.variant_name || reqItem.variant_name_snapshot)) {
        const reqVName = String(reqItem.variant_name || reqItem.variant_name_snapshot).trim().toLowerCase();
        matchedVariant = variants.find(v => String(v.name).trim().toLowerCase() === reqVName)
          || variants.find(v => {
            const vn = String(v.name).trim().toLowerCase();
            return vn.includes(reqVName) || reqVName.includes(vn);
          });
      }
      if (!matchedVariant && (reqItem.price !== undefined || reqItem.unit_price_snapshot !== undefined)) {
        const reqPrice = Number(reqItem.price !== undefined ? reqItem.price : reqItem.unit_price_snapshot);
        if (!isNaN(reqPrice) && reqPrice > 0) {
          matchedVariant = variants.find(v => Math.abs(Number(v.price) - reqPrice) < 0.01);
        }
      }

      if (matchedVariant) {
        if (matchedVariant.menu_item_id && matchedVariant.menu_item_id !== dbItem.id) {
          throw new Error(`Variant "${matchedVariant.name}" does not belong to "${dbItem.name}".`);
        }
        if (!matchedVariant.is_available) {
          throw new Error(`Variant "${matchedVariant.name}" is currently unavailable.`);
        }
        unitPrice = Number(matchedVariant.price);
        variantName = matchedVariant.name;
      } else if (reqItem.price !== undefined || reqItem.unit_price_snapshot !== undefined) {
        const explicitPrice = Number(reqItem.price !== undefined ? reqItem.price : reqItem.unit_price_snapshot);
        if (!isNaN(explicitPrice) && explicitPrice > 0) {
          unitPrice = explicitPrice;
        }
        variantName = reqItem.variant_name || reqItem.variant_name_snapshot || null;
      }

      const lineTotal = unitPrice * qty;
      calculatedTotal += lineTotal;

      orderItemsToInsert.push(this.enrichOrderItem({
        id: crypto.randomUUID(),
        menu_item_id: dbItem.id,
        variant_id: matchedVariant ? matchedVariant.id : (reqItem.variant_id || null),
        item_name_snapshot: dbItem.name,
        variant_name_snapshot: variantName,
        unit_price_snapshot: unitPrice,
        quantity: qty,
        line_total: lineTotal,
        food_type: dbItem.food_type || 'VEG',
        created_at: new Date().toISOString()
      }));
    }

    const orderId = crypto.randomUUID();
    this.orderSequence += 1;

    const initialPayment = parsePaymentDetails({
      total: calculatedTotal,
      notes,
      payment_mode,
      cash_amount,
      online_amount,
      status: status || 'CONFIRMED'
    });

    const order = {
      id: orderId,
      order_number: this.orderSequence,
      table_number: tableNum,
      waiter_id: waiter_id || null,
      waiter_name_snapshot: waiter_name ? String(waiter_name).replace(/<[^>]*>?/gm, '').trim() : 'Staff',
      status: status || 'CONFIRMED',
      subtotal: calculatedTotal,
      total: calculatedTotal, // STRICT: NO TAX, NO GST, NO SERVICE CHARGE
      notes: notes ? String(notes).replace(/<[^>]*>?/gm, '').trim() : null,
      idempotency_key: idempotency_key || null,
      payment_mode: initialPayment.payment_mode,
      payment_status: initialPayment.payment_status,
      cash_amount: initialPayment.cash_amount,
      online_amount: initialPayment.online_amount,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    orderItemsToInsert.forEach(oi => {
      oi.order_id = orderId;
      this.orderItems.push(oi);
    });

    this.orders.unshift(order);

    // Emit Realtime event
    this.emit('order_created', { order, items: orderItemsToInsert });

    return {
      ...order,
      items: orderItemsToInsert
    };
  }

  // --- ATOMIC ORDER ITEMS UPDATE (EDIT BILL / MULTI-ROUND SERVING) ---
  updateOrderItems(orderId, { items, notes, waiter_id, waiter_name, status }) {
    const orderIndex = this.orders.findIndex(o => o.id === orderId || String(o.order_number) === String(orderId));
    if (orderIndex === -1) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Order cannot be empty.');
    }

    let calculatedTotal = 0;
    const orderItemsToInsert = [];
    const targetOrderId = this.orders[orderIndex].id;

    for (const reqItem of items) {
      const dbItem = this.getMenuItemById(reqItem.menu_item_id);
      if (!dbItem) throw new Error(`Menu item not found: ${reqItem.menu_item_id}`);
      if (!dbItem.is_active) throw new Error(`Item "${dbItem.name}" is no longer on the menu.`);
      if (!dbItem.is_available) throw new Error(`Item "${dbItem.name}" is currently unavailable.`);

      const numQty = Number(reqItem.quantity);
      if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
        throw new Error(`Invalid quantity for item "${dbItem.name}". Quantity must be a positive whole integer.`);
      }
      const qty = numQty;

      let unitPrice = dbItem.price;
      let variantName = null;
      let matchedVariant = null;

      const variants = dbItem.menu_item_variants || this.getVariantsByMenuItemId(dbItem.id) || [];
      if (reqItem.variant_id && String(reqItem.variant_id) !== 'null' && String(reqItem.variant_id) !== 'undefined') {
        matchedVariant = variants.find(v => String(v.id) === String(reqItem.variant_id)) || this.getVariantById(reqItem.variant_id);
      }
      if (!matchedVariant && (reqItem.variant_name || reqItem.variant_name_snapshot)) {
        const reqVName = String(reqItem.variant_name || reqItem.variant_name_snapshot).trim().toLowerCase();
        matchedVariant = variants.find(v => String(v.name).trim().toLowerCase() === reqVName)
          || variants.find(v => {
            const vn = String(v.name).trim().toLowerCase();
            return vn.includes(reqVName) || reqVName.includes(vn);
          });
      }
      if (!matchedVariant && (reqItem.price !== undefined || reqItem.unit_price_snapshot !== undefined)) {
        const reqPrice = Number(reqItem.price !== undefined ? reqItem.price : reqItem.unit_price_snapshot);
        if (!isNaN(reqPrice) && reqPrice > 0) {
          matchedVariant = variants.find(v => Math.abs(Number(v.price) - reqPrice) < 0.01);
        }
      }

      if (matchedVariant) {
        if (matchedVariant.menu_item_id && matchedVariant.menu_item_id !== dbItem.id) {
          throw new Error(`Variant "${matchedVariant.name}" does not belong to "${dbItem.name}".`);
        }
        if (!matchedVariant.is_available) {
          throw new Error(`Variant "${matchedVariant.name}" is currently unavailable.`);
        }
        unitPrice = Number(matchedVariant.price);
        variantName = matchedVariant.name;
      } else if (reqItem.price !== undefined || reqItem.unit_price_snapshot !== undefined) {
        const explicitPrice = Number(reqItem.price !== undefined ? reqItem.price : reqItem.unit_price_snapshot);
        if (!isNaN(explicitPrice) && explicitPrice > 0) {
          unitPrice = explicitPrice;
        }
        variantName = reqItem.variant_name || reqItem.variant_name_snapshot || null;
      }

      const lineTotal = unitPrice * qty;
      calculatedTotal += lineTotal;

      orderItemsToInsert.push(this.enrichOrderItem({
        id: crypto.randomUUID(),
        order_id: targetOrderId,
        menu_item_id: dbItem.id,
        variant_id: matchedVariant ? matchedVariant.id : (reqItem.variant_id || null),
        item_name_snapshot: dbItem.name,
        variant_name_snapshot: variantName,
        unit_price_snapshot: unitPrice,
        quantity: qty,
        line_total: lineTotal,
        food_type: dbItem.food_type || 'VEG',
        created_at: new Date().toISOString()
      }));
    }

    const order = this.orders[orderIndex];
    order.subtotal = calculatedTotal;
    order.total = calculatedTotal;
    if (notes !== undefined) order.notes = notes ? String(notes).replace(/<[^>]*>?/gm, '').trim() : null;
    if (waiter_id) order.waiter_id = waiter_id;
    if (waiter_name) order.waiter_name_snapshot = String(waiter_name).replace(/<[^>]*>?/gm, '').trim();
    if (status) order.status = status;
    order.updated_at = new Date().toISOString();

    // Remove previous order items and insert new
    this.orderItems = this.orderItems.filter(oi => oi.order_id !== targetOrderId);
    this.orderItems.push(...orderItemsToInsert);

    this.emit('order_updated', { order, items: orderItemsToInsert });

    return {
      ...order,
      items: orderItemsToInsert
    };
  }

  // --- ACTIVE SERVING ORDERS QUERY ---
  getActiveServingOrders() {
    return this.orders
      .filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
      .map(o => ({
        ...o,
        items: this.orderItems.filter(oi => oi.order_id === o.id).map(oi => this.enrichOrderItem(oi))
      }));
  }

  syncWithRemote({ categories, items, variants }) {
    if (categories && categories.length > 0) {
      this.categories = [...categories];
    }
    if (items && items.length > 0) {
      this.menuItems = items.map(item => ({
        ...item,
        price: Number(item.price),
        menu_item_variants: item.menu_item_variants || []
      }));
    }
    if (variants && variants.length > 0) {
      this.variants = variants.map(v => ({
        ...v,
        price: Number(v.price)
      }));
    } else if (items && items.length > 0) {
      const extractedVariants = [];
      for (const item of items) {
        if (Array.isArray(item.menu_item_variants)) {
          for (const v of item.menu_item_variants) {
            extractedVariants.push({
              ...v,
              menu_item_id: v.menu_item_id || item.id,
              price: Number(v.price)
            });
          }
        }
      }
      if (extractedVariants.length > 0) {
        this.variants = extractedVariants;
      }
    }
  }

  getTodayKolkataRange() {
    const now = new Date();
    const kolkataOffsetMs = 5.5 * 60 * 60 * 1000;
    const kolkataNow = new Date(now.getTime() + kolkataOffsetMs);
    const year = kolkataNow.getUTCFullYear();
    const month = kolkataNow.getUTCMonth();
    const date = kolkataNow.getUTCDate();

    const startUtcMs = Date.UTC(year, month, date, 0, 0, 0, 0) - kolkataOffsetMs;
    const endUtcMs = Date.UTC(year, month, date, 23, 59, 59, 999) - kolkataOffsetMs;

    return {
      startUtc: new Date(startUtcMs),
      endUtc: new Date(endUtcMs),
      startUtcIso: new Date(startUtcMs).toISOString(),
      endUtcIso: new Date(endUtcMs).toISOString()
    };
  }

  resetTodayOrderHistory() {
    const { startUtc, endUtc } = this.getTodayKolkataRange();
    const startMs = startUtc.getTime();
    const endMs = endUtc.getTime();

    const todayOrderIds = new Set();
    const remainingOrders = [];

    for (const o of this.orders) {
      const raw = o.created_at || '';
      const normalized = (String(raw).includes('Z') || String(raw).includes('+')) ? raw : (raw + 'Z');
      const orderMs = new Date(normalized).getTime();
      if (orderMs >= startMs && orderMs <= endMs) {
        todayOrderIds.add(o.id);
      } else {
        remainingOrders.push(o);
      }
    }

    this.orderItems = this.orderItems.filter(oi => !todayOrderIds.has(oi.order_id));
    this.orders = remainingOrders;

    if (this.orders.length > 0) {
      this.orderSequence = Math.max(0, ...this.orders.map(o => Number(o.order_number) || 0));
    } else {
      this.orderSequence = 0;
    }

    this.emit('orders_reset', { type: 'TODAY', erasedCount: todayOrderIds.size });
    return { success: true, erasedCount: todayOrderIds.size, remainingCount: this.orders.length };
  }

  resetOrderHistory() {
    this.orders = [];
    this.orderItems = [];
    this.orderSequence = 0;
    this.emit('orders_reset', { type: 'ALL' });
    return { success: true };
  }

  recordOrderSnapshot(orderData, itemsData = []) {
    const orderId = orderData.order_id || orderData.id;
    const existingIndex = this.orders.findIndex(o => o.id === orderId || (o.order_number && String(o.order_number) === String(orderData.order_number)));
    const existing = existingIndex >= 0 ? this.orders[existingIndex] : null;
    const paymentDetails = parsePaymentDetails(orderData, existing);

    const rawCreatedAt = orderData.created_at || (existing ? existing.created_at : new Date().toISOString());
    const normalizedCreatedAt = (String(rawCreatedAt).includes('Z') || String(rawCreatedAt).includes('+')) ? rawCreatedAt : (rawCreatedAt + 'Z');

    const orderNum = Number(orderData.order_number);
    if (!isNaN(orderNum) && orderNum > this.orderSequence) {
      this.orderSequence = orderNum;
    }

    const order = {
      id: orderId,
      order_number: Number(orderData.order_number),
      table_number: Number(orderData.table_number),
      waiter_id: orderData.waiter_id || null,
      waiter_name_snapshot: orderData.waiter_name || orderData.waiter_name_snapshot || 'Staff',
      status: orderData.status || 'CONFIRMED',
      subtotal: Number(orderData.subtotal !== undefined ? orderData.subtotal : orderData.total),
      total: Number(orderData.total),
      notes: orderData.notes || null,
      idempotency_key: orderData.idempotency_key || null,
      payment_mode: paymentDetails.payment_mode,
      payment_status: paymentDetails.payment_status,
      cash_amount: paymentDetails.cash_amount,
      online_amount: paymentDetails.online_amount,
      created_at: normalizedCreatedAt,
      updated_at: orderData.updated_at || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.orders[existingIndex] = order;
    } else {
      this.orders.push(order);
    }

    // Always sort descending by order_number (highest order number first)
    this.orders.sort((a, b) => {
      if (b.order_number && a.order_number) return Number(b.order_number) - Number(a.order_number);
      return new Date(b.created_at) - new Date(a.created_at);
    });

    if (itemsData && itemsData.length > 0) {
      this.orderItems = this.orderItems.filter(oi => oi.order_id !== orderId);
      itemsData.forEach(oi => {
        const enriched = this.enrichOrderItem(oi);
        this.orderItems.push({
          id: oi.id || crypto.randomUUID(),
          order_id: orderId,
          menu_item_id: oi.menu_item_id,
          variant_id: enriched.variant_id || oi.variant_id || null,
          item_name_snapshot: oi.item_name_snapshot,
          variant_name_snapshot: enriched.variant_name_snapshot || oi.variant_name_snapshot || null,
          unit_price_snapshot: Number(oi.unit_price_snapshot),
          quantity: Number(oi.quantity),
          line_total: Number(oi.line_total)
        });
      });
    }

    this.emit('order_created', { order, items: itemsData });
    return {
      ...order,
      items: itemsData
    };
  }

  // --- MENU MANAGEMENT ---
  updateMenuItem(id, updates) {
    const item = this.getMenuItemById(id);
    if (!item) {
      throw new Error(`Item ${id} not found.`);
    }

    if (updates.name !== undefined) item.name = updates.name.trim();
    if (updates.description !== undefined) item.description = updates.description.trim();
    if (updates.price !== undefined) item.price = Number(updates.price);
    if (updates.category_id !== undefined) item.category_id = updates.category_id;
    if (updates.food_type !== undefined) item.food_type = updates.food_type;
    if (updates.is_available !== undefined) item.is_available = Boolean(updates.is_available);
    if (updates.is_active !== undefined) item.is_active = Boolean(updates.is_active);
    if (updates.verification_note !== undefined) item.verification_note = updates.verification_note;
    if (updates.image_url !== undefined) item.image_url = updates.image_url ? updates.image_url.trim() : null;

    item.updated_at = new Date().toISOString();

    this.emit('menu_updated', { type: 'UPDATE', item });
    return item;
  }

  addMenuItem(itemData) {
    const id = itemData.id || crypto.randomUUID();
    const item = {
      id,
      category_id: itemData.category_id,
      name: (itemData.name || '').trim(),
      description: itemData.description ? itemData.description.trim() : '',
      price: Number(itemData.price) || 0,
      food_type: itemData.food_type || 'VEG',
      image_url: itemData.image_url ? itemData.image_url.trim() : null,
      is_available: itemData.is_available !== undefined ? Boolean(itemData.is_available) : true,
      is_active: itemData.is_active !== undefined ? Boolean(itemData.is_active) : true,
      display_order: itemData.display_order !== undefined ? itemData.display_order : (this.menuItems.length + 1),
      verification_note: itemData.verification_note || null,
      created_at: itemData.created_at || new Date().toISOString(),
      updated_at: itemData.updated_at || new Date().toISOString()
    };
    this.menuItems.push(item);
    this.emit('menu_updated', { type: 'INSERT', item });
    return item;
  }

  archiveMenuItem(id) {
    return this.updateMenuItem(id, { is_active: false });
  }

  restoreMenuItem(id) {
    return this.updateMenuItem(id, { is_active: true });
  }

  deleteMenuItem(id) {
    const idx = this.menuItems.findIndex(i => i.id === id);
    if (idx === -1) {
      throw new Error('Menu item not found');
    }
    const deletedItem = this.menuItems[idx];
    this.menuItems.splice(idx, 1);

    // Cascade delete variants
    this.variants = this.variants.filter(v => v.menu_item_id !== id);

    // Nullify menu_item_id in historical order items (matching ON DELETE SET NULL)
    this.orderItems.forEach(oi => {
      if (oi.menu_item_id === id) {
        oi.menu_item_id = null;
      }
    });

    this.emit('menu_updated', { type: 'delete', id });
    return { id, deleted: true, name: deletedItem.name };
  }

  createCategory({ name, slug, display_order }) {
    if (!name || !name.trim()) {
      throw new Error('Category name is required');
    }
    const cleanName = name.trim();
    let cleanSlug = slug || cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (this.categories.some(c => c.slug === cleanSlug)) {
      cleanSlug = `${cleanSlug}-${Date.now().toString().slice(-4)}`;
    }

    const order = typeof display_order === 'number'
      ? display_order
      : Math.max(...this.categories.map(c => c.display_order || 0), 0) + 1;

    const newCategory = {
      id: crypto.randomUUID(),
      name: cleanName,
      slug: cleanSlug,
      display_order: order,
      created_at: new Date().toISOString()
    };

    this.categories.push(newCategory);
    this.emit('menu_updated', { type: 'category_created', category: newCategory });
    return newCategory;
  }

  toggleAvailability(id, is_available) {
    return this.updateMenuItem(id, { is_available: Boolean(is_available) });
  }

  // --- ORDERS QUERY ---
  getOrders(filters = {}) {
    let result = [...this.orders].sort((a, b) => {
      if (b.order_number && a.order_number) return Number(b.order_number) - Number(a.order_number);
      return new Date(b.created_at) - new Date(a.created_at);
    });

    if (filters.table_number) {
      result = result.filter(o => o.table_number === Number(filters.table_number));
    }
    if (filters.status) {
      result = result.filter(o => o.status === filters.status);
    }
    if (filters.date_from) {
      const from = new Date(filters.date_from);
      result = result.filter(o => new Date(o.created_at) >= from);
    }
    if (filters.date_to) {
      const to = new Date(filters.date_to);
      result = result.filter(o => new Date(o.created_at) <= to);
    }

    return result.map(o => {
      const p = parsePaymentDetails(o);
      const matchingItems = this.orderItems.filter(oi => oi.order_id === o.id);
      const items = (matchingItems.length > 0 ? matchingItems : (o.items || o.order_items || [])).map(oi => this.enrichOrderItem(oi));
      return {
        ...o,
        payment_mode: p.payment_mode,
        payment_status: p.payment_status,
        cash_amount: p.cash_amount,
        online_amount: p.online_amount,
        items,
        order_items: items
      };
    });
  }

  getOrderById(id) {
    const order = this.orders.find(o => o.id === id || String(o.order_number) === String(id));
    if (!order) return null;
    const p = parsePaymentDetails(order);
    const matchingItems = this.orderItems.filter(oi => oi.order_id === order.id);
    const items = (matchingItems.length > 0 ? matchingItems : (order.items || order.order_items || [])).map(oi => this.enrichOrderItem(oi));
    return {
      ...order,
      payment_mode: p.payment_mode,
      payment_status: p.payment_status,
      cash_amount: p.cash_amount,
      online_amount: p.online_amount,
      items,
      order_items: items
    };
  }

  updateOrderStatus(id, status, paymentData = {}) {
    const order = this.orders.find(o => o.id === id || String(o.order_number) === String(id));
    if (!order) {
      return null;
    }
    order.status = status;
    order.updated_at = new Date().toISOString();

    if (status === 'CANCELLED') {
      order.payment_status = 'CANCELLED';
    } else if (status === 'COMPLETED') {
      order.payment_status = 'PAID';
    }

    if (paymentData && typeof paymentData === 'object') {
      if (paymentData.payment_mode) {
        order.payment_mode = String(paymentData.payment_mode).toUpperCase();
      }
      if (paymentData.cash_amount != null) {
        order.cash_amount = Number(paymentData.cash_amount) || 0;
      }
      if (paymentData.online_amount != null) {
        order.online_amount = Number(paymentData.online_amount) || 0;
      }
      if (paymentData.payment_status) {
        order.payment_status = paymentData.payment_status;
      }
      if (paymentData.notes) {
        order.notes = paymentData.notes;
      }
    }

    const p = parsePaymentDetails(order);
    order.payment_mode = p.payment_mode;
    order.payment_status = p.payment_status;
    order.cash_amount = p.cash_amount;
    order.online_amount = p.online_amount;

    this.emit('order_updated', { order });
    return order;
  }

  // --- ANALYTICS (Asia/Kolkata timezone awareness) ---
  getAnalytics() {
    // Permanent historical revenue comes STRICTLY from completed orders
    const validOrders = this.orders.filter(o => o.status === 'COMPLETED');
    const activeOrders = this.orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

    const now = new Date();
    // Asia/Kolkata offset: +5.5 hours
    const kolkataOffsetMs = 5.5 * 60 * 60 * 1000;
    const kolkataNow = new Date(now.getTime() + kolkataOffsetMs);

    const startOfToday = new Date(kolkataNow);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfWeek = new Date(kolkataNow);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 7);

    const startOfMonth = new Date(kolkataNow);
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const getMetricsForOrders = (orderList) => {
      const revenue = orderList.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const count = orderList.length;
      const averageBill = count > 0 ? Math.round(revenue / count) : 0;
      let cashOrders = 0;
      let onlineOrders = 0;
      let splitOrders = 0;

      const cashRevenue = orderList.reduce((sum, o) => {
        const p = parsePaymentDetails(o);
        if (p.cash_amount > 0 && p.online_amount > 0) splitOrders += 1;
        else if (p.online_amount > 0) onlineOrders += 1;
        else if (p.cash_amount > 0) cashOrders += 1;
        return sum + p.cash_amount;
      }, 0);

      const onlineRevenue = orderList.reduce((sum, o) => {
        const p = parsePaymentDetails(o);
        return sum + p.online_amount;
      }, 0);

      return { revenue, count, averageBill, cashRevenue, onlineRevenue, cashOrders, onlineOrders, splitOrders };
    };

    const isOrderInDateRange = (o, fromDate) => {
      const raw = o.created_at || '';
      const normalized = (String(raw).includes('Z') || String(raw).includes('+')) ? raw : (raw + 'Z');
      const orderKolkataDate = new Date(new Date(normalized).getTime() + kolkataOffsetMs);
      return orderKolkataDate >= fromDate;
    };

    const todayOrders = validOrders.filter(o => isOrderInDateRange(o, startOfToday));
    const weekOrders = validOrders.filter(o => isOrderInDateRange(o, startOfWeek));
    const monthOrders = validOrders.filter(o => isOrderInDateRange(o, startOfMonth));

    // Per-day analysis in Asia/Kolkata timezone
    const dailyMap = {};
    validOrders.forEach(o => {
      const raw = o.created_at || '';
      const normalized = (String(raw).includes('Z') || String(raw).includes('+')) ? raw : (raw + 'Z');
      const orderKolkataDate = new Date(new Date(normalized).getTime() + kolkataOffsetMs);
      const dateKey = orderKolkataDate.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          orders: 0,
          revenue: 0,
          cashRevenue: 0,
          onlineRevenue: 0
        };
      }
      const p = parsePaymentDetails(o);
      const cash = p.cash_amount;
      const online = p.online_amount;

      dailyMap[dateKey].orders += 1;
      dailyMap[dateKey].revenue += Number(o.total || 0);
      dailyMap[dateKey].cashRevenue += cash;
      dailyMap[dateKey].onlineRevenue += online;
    });

    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // Sales by Table (Table 1 through 9) - strictly completed orders
    const salesByTable = {};
    for (let i = 1; i <= 9; i++) {
      salesByTable[i] = { table_number: i, revenue: 0, orders: 0 };
    }
    validOrders.forEach(o => {
      if (salesByTable[o.table_number]) {
        salesByTable[o.table_number].revenue += Number(o.total);
        salesByTable[o.table_number].orders += 1;
      }
    });

    // Top Selling Items (from completed order snapshots)
    const itemSales = {};
    validOrders.forEach(o => {
      const items = this.orderItems.filter(oi => oi.order_id === o.id);
      items.forEach(oi => {
        const key = oi.item_name_snapshot + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
        if (!itemSales[key]) {
          itemSales[key] = { name: key, quantity: 0, revenue: 0 };
        }
        itemSales[key].quantity += oi.quantity;
        itemSales[key].revenue += Number(oi.line_total);
      });
    });

    const topSellingItems = Object.values(itemSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    const uniqueServingTables = new Set(activeOrders.map(o => o.table_number)).size;
    const activeServing = {
      count: activeOrders.length,
      tablesCount: uniqueServingTables,
      runningTotal: activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
      tables: activeOrders.map(o => ({
        table_number: o.table_number,
        order_number: o.order_number,
        total: o.total,
        created_at: o.created_at,
        itemCount: this.orderItems.filter(oi => oi.order_id === o.id).reduce((s, i) => s + i.quantity, 0)
      }))
    };

    return {
      today: getMetricsForOrders(todayOrders),
      weekly: getMetricsForOrders(weekOrders),
      monthly: getMetricsForOrders(monthOrders),
      allTime: getMetricsForOrders(validOrders),
      dailyBreakdown,
      salesByTable: Object.values(salesByTable),
      topSellingItems,
      activeServing,
      recentOrders: [...this.orders]
        .sort((a, b) => {
          if (b.order_number && a.order_number) return Number(b.order_number) - Number(a.order_number);
          return new Date(b.created_at) - new Date(a.created_at);
        })
        .slice(0, 20)
        .map(o => ({
          ...o,
          items: this.orderItems.filter(oi => oi.order_id === o.id)
        }))
    };
  }

  revokeToken(token) {
    if (!token) return;
    if (!this.revokedTokens) this.revokedTokens = new Set();
    this.revokedTokens.add(String(token).trim());
    if (this.revokedTokens.size > 20000) {
      const it = this.revokedTokens.values();
      for (let i = 0; i < 5000; i++) {
        this.revokedTokens.delete(it.next().value);
      }
    }
  }

  isTokenRevoked(token) {
    if (!token || !this.revokedTokens) return false;
    return this.revokedTokens.has(String(token).trim());
  }
}

// Export singleton instance
const store = new CafeStore();
store.parsePaymentDetails = parsePaymentDetails;
module.exports = store;
