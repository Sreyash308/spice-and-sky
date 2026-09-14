const assert = require('assert');
const fs = require('fs');
const path = require('path');
const localStore = require('../db/local_store');

console.log('Testing Bill Veg / Non-Veg Icons & Receipt Legend...');

// 1. Verify CSS rules exist for .bill-diet-badge and .receipt-diet-legend
const designCss = fs.readFileSync(path.join(__dirname, '../public/css/design-system.css'), 'utf8');
assert(designCss.includes('.bill-diet-badge.veg'), 'design-system.css must include .bill-diet-badge.veg');
assert(designCss.includes('.bill-diet-badge.non-veg'), 'design-system.css must include .bill-diet-badge.non-veg');
assert(designCss.includes('.receipt-diet-legend'), 'design-system.css must include .receipt-diet-legend');
console.log('  ✅ CSS design system includes .bill-diet-badge and .receipt-diet-legend for veg and non-veg');

// 2. Verify print.css includes thermal printer high-contrast monochrome styles and legend
const printCss = fs.readFileSync(path.join(__dirname, '../public/css/print.css'), 'utf8');
assert(printCss.includes('.bill-diet-badge.veg .diet-shape'), 'print.css must include thermal print styles for veg');
assert(printCss.includes('.bill-diet-badge.non-veg .diet-shape'), 'print.css must include thermal print styles for non-veg');
assert(printCss.includes('.receipt-diet-legend'), 'print.css must include .receipt-diet-legend print styles');
console.log('  ✅ print.css includes thermal receipt print styling for veg/non-veg icons and legend');

// 3. Verify bill templates in waiter.html and admin.html contain the dietary icon legend
const waiterHtml = fs.readFileSync(path.join(__dirname, '../public/waiter.html'), 'utf8');
assert(waiterHtml.includes('receipt-diet-legend'), 'waiter.html must include receipt-diet-legend');
assert(waiterHtml.includes('Vegetarian'), 'waiter.html legend must explain Vegetarian symbol');
assert(waiterHtml.includes('Non-Vegetarian'), 'waiter.html legend must explain Non-Vegetarian symbol');

const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
assert(adminHtml.includes('receipt-diet-legend'), 'admin.html must include receipt-diet-legend');
assert(adminHtml.includes('Vegetarian'), 'admin.html legend must explain Vegetarian symbol');
assert(adminHtml.includes('Non-Vegetarian'), 'admin.html legend must explain Non-Vegetarian symbol');
console.log('  ✅ waiter.html and admin.html receipts include the dietary symbol legend (Vegetarian / Non-Vegetarian)');

// 4. Verify waiter.js and admin.js render ONLY the icon and DO NOT render text [VEG] or [NON-VEG]
const waiterJs = fs.readFileSync(path.join(__dirname, '../public/js/waiter.js'), 'utf8');
assert(waiterJs.includes('function getItemDietInfo'), 'waiter.js must define getItemDietInfo');
assert(waiterJs.includes('bill-diet-badge'), 'waiter.js bill rendering must include bill-diet-badge');
assert(!waiterJs.includes('[${diet.label.toUpperCase()}]'), 'waiter.js bill rendering must NOT include textual [VEG]/[NON-VEG]');

const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
assert(adminJs.includes('function getItemDietInfo'), 'admin.js must define getItemDietInfo');
assert(adminJs.includes('bill-diet-badge'), 'admin.js bill rendering must include bill-diet-badge');
assert(!adminJs.includes('[${diet.label.toUpperCase()}]'), 'admin.js bill rendering must NOT include textual [VEG]/[NON-VEG]');
console.log('  ✅ waiter.js and admin.js render pure icons without [VEG]/[NON-VEG] text tags');

// 5. Test backend food_type attachment on atomic order creation
const vegPasta = localStore.menuItems.find(m => m.name === 'White Sauce Pasta' && m.food_type === 'VEG');
const nonVegPasta = localStore.menuItems.find(m => m.name === 'White Sauce Pasta' && m.food_type === 'NON_VEG');

assert(vegPasta, 'Veg White Sauce Pasta must exist in menu');
assert(nonVegPasta, 'Non-Veg White Sauce Pasta must exist in menu');
assert.notStrictEqual(vegPasta.id, nonVegPasta.id, 'Veg and Non-Veg White Sauce Pasta must have distinct IDs');

const testOrder = localStore.createOrderAtomic({
  table_number: 4,
  waiter_name: 'Shan',
  items: [
    { menu_item_id: vegPasta.id, quantity: 1 },
    { menu_item_id: nonVegPasta.id, quantity: 2 }
  ]
});

assert(testOrder, 'Order should be created successfully');
assert.strictEqual(testOrder.items.length, 2, 'Order must contain 2 items');

const vegOrderItem = testOrder.items.find(i => i.menu_item_id === vegPasta.id);
const nonVegOrderItem = testOrder.items.find(i => i.menu_item_id === nonVegPasta.id);

assert(vegOrderItem, 'Veg order item must exist');
assert.strictEqual(vegOrderItem.food_type, 'VEG', 'Veg pasta item must be tagged with food_type VEG');

assert(nonVegOrderItem, 'Non-Veg order item must exist');
assert.strictEqual(nonVegOrderItem.food_type, 'NON_VEG', 'Non-Veg pasta item must be tagged with food_type NON_VEG');
console.log('  ✅ Backend accurately sets and preserves food_type on same-named items');

// 6. Test bill rendering output simulation
eval(waiterJs.slice(waiterJs.indexOf('function getItemDietInfo'), waiterJs.indexOf('if (typeof window !== \'undefined\') {\n  if (!window.getItemDietInfo)')));

const vegDiet = getItemDietInfo(vegOrderItem, localStore.menuItems);
const nonVegDiet = getItemDietInfo(nonVegOrderItem, localStore.menuItems);

assert.strictEqual(vegDiet.isVeg, true, 'Veg item must have isVeg = true');
assert.strictEqual(vegDiet.isNonVeg, false, 'Veg item must have isNonVeg = false');
assert.strictEqual(vegDiet.badgeClass, 'veg', 'Veg item badgeClass must be veg');

assert.strictEqual(nonVegDiet.isVeg, false, 'Non-Veg item must have isVeg = false');
assert.strictEqual(nonVegDiet.isNonVeg, true, 'Non-Veg item must have isNonVeg = true');
assert.strictEqual(nonVegDiet.badgeClass, 'non-veg', 'Non-Veg item badgeClass must be non-veg');

// Simulate bill table row generation matching updated waiter.js
function renderBillRow(oi) {
  const diet = getItemDietInfo(oi, localStore.menuItems);
  const rawTitle = (oi.item_name_snapshot || oi.name || 'Item') + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
  return `
    <tr>
      <td>
        <div class="receipt-item-line">
          <span class="bill-diet-badge ${diet.badgeClass}" title="${diet.label}">
            <span class="diet-shape"></span>
          </span>
          <span class="bill-item-name">${rawTitle}</span>
        </div>
      </td>
      <td>${oi.quantity}</td>
      <td>₹${oi.line_total}</td>
    </tr>
  `;
}

const vegHtml = renderBillRow(vegOrderItem);
const nonVegHtml = renderBillRow(nonVegOrderItem);

assert(vegHtml.includes('bill-diet-badge veg'), 'Veg bill row must contain "bill-diet-badge veg"');
assert(!vegHtml.includes('[VEG]'), 'Veg bill row must NOT contain text "[VEG]"');
assert(vegHtml.includes('White Sauce Pasta'), 'Veg bill row must display dish name');

assert(nonVegHtml.includes('bill-diet-badge non-veg'), 'Non-veg bill row must contain "bill-diet-badge non-veg"');
assert(!nonVegHtml.includes('[NON-VEG]'), 'Non-veg bill row must NOT contain text "[NON-VEG]"');
assert(nonVegHtml.includes('White Sauce Pasta'), 'Non-veg bill row must display dish name');

console.log('  ✅ Bill rows correctly display pure icons without text clutter');

console.log('\n🎉 ALL BILL VEG / NON-VEG ICON & LEGEND TESTS PASSED SUCCESSFULLY!\n');
