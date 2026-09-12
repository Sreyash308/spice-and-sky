/**
 * Spice & Sky Rooftop Cafe - Automated Comprehensive Test Suite
 * Validates specifications, billing rules, table constraints,
 * historical price snapshots, availability, and analytics.
 */

const assert = require('assert');
const store = require('../db/local_store');

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

console.log('\n============================================================');
console.log('🧪 RUNNING SPICE & SKY ROOFTOP CAFE TEST SUITE');
console.log('============================================================\n');

// TEST SUITE 1: MENU ARCHITECTURE & COMPLETENESS
console.log('--- Test Suite 1: Menu Architecture & Completeness ---');

runTest('Exactly 18 Menu Categories Exist in Prioritized Sequence', () => {
  const cats = store.getCategories();
  assert.strictEqual(cats.length, 18, `Expected 18 categories, got ${cats.length}`);

  const expectedOrder = [
    { name: 'Main Course — Veg', slug: 'main-course-veg', order: 1 },
    { name: 'Main Course — Non-Veg', slug: 'main-course-non-veg', order: 2 },
    { name: 'Rice Bowls', slug: 'rice-bowls', order: 3 },
    { name: 'Pastas — Veg', slug: 'pastas-veg', order: 4 },
    { name: 'Pastas — Non-Veg', slug: 'pastas-non-veg', order: 5 },
    { name: 'French Fries', slug: 'french-fries', order: 6 },
    { name: 'Pizzas — Veg', slug: 'pizzas-veg', order: 7 },
    { name: 'Pizzas — Non-Veg', slug: 'pizzas-non-veg', order: 8 },
    { name: 'Burgers — Veg', slug: 'burgers-veg', order: 9 },
    { name: 'Burgers — Non-Veg', slug: 'burgers-non-veg', order: 10 },
    { name: 'Fried Rice', slug: 'fried-rice', order: 11 },
    { name: 'Toasts', slug: 'toasts', order: 12 },
    { name: 'Hot Coffee', slug: 'hot-coffee', order: 13 },
    { name: 'Iced Coffee', slug: 'iced-coffee', order: 14 },
    { name: 'Coffee Extras', slug: 'coffee-extras', order: 15 },
    { name: 'Milkshakes', slug: 'milkshakes', order: 16 },
    { name: 'Signature Coffee Drinks', slug: 'signature-coffee-drinks', order: 17 },
    { name: 'Mojitos', slug: 'mojitos', order: 18 }
  ];

  expectedOrder.forEach((expected, idx) => {
    assert.strictEqual(cats[idx].name, expected.name, `Category at index ${idx} expected ${expected.name}, got ${cats[idx].name}`);
    assert.strictEqual(cats[idx].slug, expected.slug, `Category at index ${idx} expected slug ${expected.slug}, got ${cats[idx].slug}`);
    assert.strictEqual(cats[idx].display_order, expected.order, `Category at index ${idx} expected display_order ${expected.order}`);
  });
});

runTest('Lasagne is Placed in Pastas — Non-Veg at ₹355', () => {
  const items = store.getMenuItems();
  const lasagne = items.find(i => i.name === 'Lasagne');
  assert(lasagne, 'Lasagne must exist');
  assert.strictEqual(lasagne.category_slug, 'pastas-non-veg', `Lasagne category_slug should be pastas-non-veg, got ${lasagne.category_slug}`);
  assert.strictEqual(lasagne.price, 355, `Lasagne price should be 355, got ${lasagne.price}`);
  assert.strictEqual(lasagne.food_type, 'NON_VEG', 'Lasagne food_type should be NON_VEG');
});

runTest('Renamed Categories Contain Expected Items', () => {
  const items = store.getMenuItems();

  // Fried Rice (formerly Rice Bowls)
  const friedRiceItems = items.filter(i => i.category_slug === 'fried-rice');
  assert.strictEqual(friedRiceItems.length, 9, `Fried Rice should have 9 items, got ${friedRiceItems.length}`);
  assert(friedRiceItems.some(i => i.name === 'Veg Fried Rice'));
  assert(friedRiceItems.some(i => i.name === 'Chicken Fried Rice'));

  // Rice Bowls (formerly Specials)
  const riceBowlItems = items.filter(i => i.category_slug === 'rice-bowls');
  assert.strictEqual(riceBowlItems.length, 2, `Rice Bowls should have 2 items, got ${riceBowlItems.length}`);
  assert(riceBowlItems.some(i => i.name === 'Grilled Chicken with Brown Sauce'));
  assert(riceBowlItems.some(i => i.name === 'Grilled Chicken with Lemon Butter Sauce'));

  // Toasts (formerly Extras / Sides)
  const toastItems = items.filter(i => i.category_slug === 'toasts');
  assert.strictEqual(toastItems.length, 5, `Toasts should have 5 items, got ${toastItems.length}`);
  assert(toastItems.some(i => i.name === 'Cheesy Garlic Bread'));

  // Main Course — Veg (formerly Starters — Veg)
  const mainVegItems = items.filter(i => i.category_slug === 'main-course-veg');
  assert.strictEqual(mainVegItems.length, 7, `Main Course — Veg should have 7 items, got ${mainVegItems.length}`);
  assert(mainVegItems.some(i => i.name === 'Chilli Paneer'));

  // Main Course — Non-Veg (formerly Starters — Non-Veg)
  const mainNonVegItems = items.filter(i => i.category_slug === 'main-course-non-veg');
  assert.strictEqual(mainNonVegItems.length, 7, `Main Course — Non-Veg should have 7 items, got ${mainNonVegItems.length}`);
  assert(mainNonVegItems.some(i => i.name === 'Chilli Chicken'));
});

runTest('All 80+ Menu Items are Seeded and Active', () => {
  const items = store.getMenuItems();
  assert(items.length >= 80, `Expected at least 80 items, got ${items.length}`);
  items.forEach(i => {
    assert(i.price >= 0, `Item ${i.name} has invalid price ${i.price}`);
    assert(['VEG', 'NON_VEG', 'DRINK', 'OTHER', 'NEEDS_CONFIRMATION'].includes(i.food_type), `Item ${i.name} has invalid food_type ${i.food_type}`);
  });
});

runTest('Pizza Variants are Properly Configured (6"/12" Veg, 9"/12" Non-Veg)', () => {
  const variants = store.getVariants();
  assert(variants.length >= 20, `Expected at least 20 pizza variants, got ${variants.length}`);

  // Check Classic Pizza variants
  const classicPizza = store.getMenuItems().find(i => i.name === 'Classic Pizza');
  assert(classicPizza, 'Classic Pizza not found');
  const classicVars = variants.filter(v => v.menu_item_id === classicPizza.id);
  assert.strictEqual(classicVars.length, 2, 'Classic Pizza should have 2 variants');
  const var6 = classicVars.find(v => v.name === '6 inch');
  const var12 = classicVars.find(v => v.name === '12 inch');
  assert(var6 && var6.price === 199, '6 inch should be ₹199');
  assert(var12 && var12.price === 249, '12 inch should be ₹249');

  // Check Chicken Pepperoni Pizza variants (9 inch & 12 inch)
  const pepPizza = store.getMenuItems().find(i => i.name === 'Chicken Pepperoni Pizza');
  assert(pepPizza, 'Chicken Pepperoni Pizza not found');
  const pepVars = variants.filter(v => v.menu_item_id === pepPizza.id);
  assert.strictEqual(pepVars.length, 2, 'Chicken Pepperoni Pizza should have 2 variants');
  const pep9 = pepVars.find(v => v.name === '9 inch');
  const pep12 = pepVars.find(v => v.name === '12 inch');
  assert(pep9 && pep9.price === 299, '9 inch should be ₹299');
  assert(pep12 && pep12.price === 349, '12 inch should be ₹349');
});

runTest('Same-Name Items Maintain Separate Identities Across Categories', () => {
  const doubleBurgers = store.getMenuItems().filter(i => i.name === 'Double Patty Burger');
  assert.strictEqual(doubleBurgers.length, 2, 'Should have 2 distinct Double Patty Burgers');
  const vegBurger = doubleBurgers.find(i => i.food_type === 'VEG');
  const nonVegBurger = doubleBurgers.find(i => i.food_type === 'NON_VEG');
  assert(vegBurger && vegBurger.price === 155, 'Veg Double Patty Burger should be ₹155');
  assert(nonVegBurger && nonVegBurger.price === 175, 'Non-Veg Double Patty Burger should be ₹175');
  assert.notStrictEqual(vegBurger.id, nonVegBurger.id, 'IDs must be distinct');
});

runTest('Owner Verification Notes are Present on Flagged Items', () => {
  const broccoli = store.getMenuItems().find(i => i.name === 'Broccoli Cheesey Stick');
  assert(broccoli, 'Broccoli Cheesey Stick not found');
  assert.strictEqual(broccoli.food_type, 'NEEDS_CONFIRMATION', 'Should be NEEDS_CONFIRMATION');
  assert(broccoli.verification_note, 'Should have owner verification note');

  const pinkVeg = store.getMenuItems().find(i => i.name === 'Pink Sauce Pasta' && i.food_type === 'VEG');
  assert(pinkVeg && pinkVeg.verification_note, 'Pink Sauce Pasta should have verification note');
});

// TEST SUITE 2: BILLING RULES & TABLE CONSTRAINTS
console.log('\n--- Test Suite 2: Billing Rules & Table Constraints ---');

runTest('Strict Billing Rule: 2x Cappuccino @ 219 + 1x Peri Peri Fries @ 160 = ₹598 (No GST/Tax)', () => {
  const cappuccino = store.getMenuItems().find(i => i.name === 'Cappuccino' && i.price === 219);
  const fries = store.getMenuItems().find(i => i.name === 'Peri Peri Fries');

  const order = store.createOrderAtomic({
    table_number: 4,
    items: [
      { menu_item_id: cappuccino.id, quantity: 2 },
      { menu_item_id: fries.id, quantity: 1 }
    ]
  });

  assert.strictEqual(order.total, 598, `Expected total 598, got ${order.total}`);
  assert.strictEqual(order.subtotal, 598, 'Subtotal must equal total');
});

runTest('Specification Bill Example: Table 3: 2x Cappuccino @ 219 + 1x Classic Fries @ 169 = ₹607', () => {
  const cappuccino = store.getMenuItems().find(i => i.name === 'Cappuccino' && i.price === 219);
  const fries = store.getMenuItems().find(i => i.name === 'Classic Fries');

  const order = store.createOrderAtomic({
    table_number: 3,
    items: [
      { menu_item_id: cappuccino.id, quantity: 2 },
      { menu_item_id: fries.id, quantity: 1 }
    ]
  });

  assert.strictEqual(order.total, 607, `Expected total 607, got ${order.total}`);
  assert.strictEqual(order.table_number, 3, 'Table number must be 3');
});

runTest('Strict 9-Table Validation: Rejects Table 0, Table 10, or Negative Tables', () => {
  const item = store.getMenuItems()[0];
  assert.throws(() => {
    store.createOrderAtomic({ table_number: 0, items: [{ menu_item_id: item.id, quantity: 1 }] });
  }, /Invalid table number/);

  assert.throws(() => {
    store.createOrderAtomic({ table_number: 10, items: [{ menu_item_id: item.id, quantity: 1 }] });
  }, /Invalid table number/);

  assert.throws(() => {
    store.createOrderAtomic({ table_number: -2, items: [{ menu_item_id: item.id, quantity: 1 }] });
  }, /Invalid table number/);
});

// TEST SUITE 3: HISTORICAL PRICE SNAPSHOTS
console.log('\n--- Test Suite 3: Historical Price Snapshots ---');

runTest('Price Change Does NOT Corrupt Historical Orders', () => {
  const cappuccino = store.getMenuItems().find(i => i.name === 'Cappuccino' && i.category_slug === 'hot-coffee');
  const originalPrice = cappuccino.price;

  // 1. Create Order at Day 1 price (₹219 x 2 = ₹438)
  const day1Order = store.createOrderAtomic({
    table_number: 1,
    items: [{ menu_item_id: cappuccino.id, quantity: 2 }]
  });
  assert.strictEqual(day1Order.total, originalPrice * 2);

  // 2. Admin updates Cappuccino price to ₹250
  store.updateMenuItem(cappuccino.id, { price: 250 });

  // 3. Inspect Day 1 order again: MUST remain 2 x ₹219 = ₹438
  const retrievedDay1 = store.getOrderById(day1Order.id);
  assert.strictEqual(retrievedDay1.total, originalPrice * 2, `Historical order price altered! Expected ${originalPrice * 2}, got ${retrievedDay1.total}`);
  const snapItem = retrievedDay1.items[0];
  assert.strictEqual(snapItem.unit_price_snapshot, originalPrice, 'Historical unit price snapshot altered!');

  // 4. Create new Day 3 Order at new price: 1 x ₹250 = ₹250
  const day3Order = store.createOrderAtomic({
    table_number: 2,
    items: [{ menu_item_id: cappuccino.id, quantity: 1 }]
  });
  assert.strictEqual(day3Order.total, 250, `Day 3 order should be 250, got ${day3Order.total}`);

  // Restore price for test consistency
  store.updateMenuItem(cappuccino.id, { price: originalPrice });
});

// TEST SUITE 4: AVAILABILITY & ARCHIVAL (SOFT DELETE)
console.log('\n--- Test Suite 4: Availability & Soft Delete Archival ---');

runTest('Unavailable Items Cannot Be Ordered', () => {
  const item = store.getMenuItems()[0];
  store.toggleAvailability(item.id, false);

  assert.throws(() => {
    store.createOrderAtomic({
      table_number: 5,
      items: [{ menu_item_id: item.id, quantity: 1 }]
    });
  }, /currently unavailable/);

  // Re-enable
  store.toggleAvailability(item.id, true);
});

runTest('Archived Items Disappear from Active Menu but Preserve Historical Orders', () => {
  const item = store.getMenuItems()[0];

  // Create order while active
  const order = store.createOrderAtomic({
    table_number: 6,
    items: [{ menu_item_id: item.id, quantity: 1 }]
  });

  // Archive item
  store.archiveMenuItem(item.id);

  // Active menu should not contain it
  const activeItems = store.getMenuItems(false);
  assert(!activeItems.some(i => i.id === item.id), 'Archived item should not be in active menu');

  // Historical order must still exist and display the item
  const retrievedOrder = store.getOrderById(order.id);
  assert(retrievedOrder && retrievedOrder.items.length === 1, 'Historical order items lost');
  assert.strictEqual(retrievedOrder.items[0].item_name_snapshot, item.name);

  // Restore item
  store.restoreMenuItem(item.id);
});

runTest('Archived Item Can Be Permanently Deleted While Preserving Historical Order Snapshots', () => {
  // 1. Add a temporary test menu item
  const tempItem = store.addMenuItem({
    category_id: store.getCategories()[0].id,
    name: 'Temporary Test Sizzler',
    price: 350,
    food_type: 'VEG'
  });

  // 2. Order the item
  const order = store.createOrderAtomic({
    table_number: 8,
    items: [{ menu_item_id: tempItem.id, quantity: 2 }]
  });

  // 3. Archive the item
  store.archiveMenuItem(tempItem.id);
  let allItems = store.getMenuItems(true);
  const archived = allItems.find(i => i.id === tempItem.id);
  assert(archived && archived.is_active === false, 'Item should be archived');

  // 4. Permanently delete the archived item
  const deleteResult = store.deleteMenuItem(tempItem.id);
  assert(deleteResult && deleteResult.deleted === true);

  // 5. Verify it is permanently removed from the database
  allItems = store.getMenuItems(true);
  assert(!allItems.some(i => i.id === tempItem.id), 'Deleted item must not exist in any menu items query');

  // 6. Verify historical order items preserve snapshots and have nullified menu_item_id
  const retrievedOrder = store.getOrderById(order.id);
  assert(retrievedOrder, 'Order should still exist');
  const orderedItem = retrievedOrder.items.find(oi => oi.item_name_snapshot === 'Temporary Test Sizzler');
  assert(orderedItem, 'Order item snapshot must still exist');
  assert.strictEqual(orderedItem.menu_item_id, null, 'menu_item_id should be nullified per ON DELETE SET NULL');
  assert.strictEqual(orderedItem.unit_price_snapshot, 350, 'Price snapshot must be intact');
  assert.strictEqual(orderedItem.line_total, 700, 'Line total must be intact');
});

runTest('Dynamic Category Creation Generates Valid Slug and Display Order', () => {
  const initialCount = store.getCategories().length;
  const newCat = store.createCategory({ name: 'Seasonal Specials' });
  assert(newCat.id, 'New category must have an id');
  assert.strictEqual(newCat.name, 'Seasonal Specials');
  assert.strictEqual(newCat.slug, 'seasonal-specials');
  assert(newCat.display_order > 0, 'New category must have positive display order');
  assert.strictEqual(store.getCategories().length, initialCount + 1);

  // Clean up
  const catIdx = store.categories.findIndex(c => c.id === newCat.id);
  if (catIdx !== -1) store.categories.splice(catIdx, 1);
});

// TEST SUITE 5: ANALYTICS & CANCELLED ORDER EXCLUSION
console.log('\n--- Test Suite 5: Analytics & Revenue Calculations ---');

runTest('Cancelled Orders are Excluded from Revenue', () => {
  const item = store.getMenuItems()[0];

  // 1. Create order
  const order = store.createOrderAtomic({
    table_number: 7,
    items: [{ menu_item_id: item.id, quantity: 2 }]
  });

  const analyticsBefore = store.getAnalytics();
  const revBefore = analyticsBefore.allTime.revenue;

  // 2. Mark order CANCELLED
  store.updateOrderStatus(order.id, 'CANCELLED');

  const analyticsAfter = store.getAnalytics();
  const revAfter = analyticsAfter.allTime.revenue;

  assert.strictEqual(revAfter, revBefore - order.total, `Cancelled order was not deducted from revenue! Before: ${revBefore}, After: ${revAfter}`);
});

console.log('\n============================================================');
console.log(`📊 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
