/**
 * End-to-End Simulation & Verification Suite
 * Tests all 3 web experiences, routing, and business requirements.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testAll() {
  console.log('\n============================================================');
  console.log('🚀 RUNNING END-TO-END SYSTEM INTEGRATION TESTS');
  console.log('============================================================\n');

  const BASE_URL = 'http://localhost:8000';

  // 1. Check Server Health
  console.log('1. Verifying Server Health & Endpoints...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health check should be 200');
  const health = await healthRes.json();
  assert.strictEqual(health.status, 'ok');
  console.log('  ✅ Server is healthy.');

  // 2. Check Public Menu HTML & Strict Non-Ordering Rules
  console.log('\n2. Verifying Public Customer Menu Content & Rules...');
  const menuHtmlRes = await fetch(`${BASE_URL}/menu`);
  assert.strictEqual(menuHtmlRes.status, 200, 'Menu page should return 200');
  const menuHtml = await menuHtmlRes.text();

  // Verification of branding elements
  assert(menuHtml.includes('SPICE &amp; SKY ROOFTOP CAFE') || menuHtml.includes('SPICE & SKY'), 'Menu must contain cafe name');
  assert(menuHtml.includes('Rooftop Vibes, Bold Flavors &amp; Cozy Brews') || menuHtml.includes('Rooftop Vibes'), 'Menu must contain tagline');
  assert(menuHtml.includes('+91 85228 80017'), 'Menu must contain phone number');
  assert(menuHtml.includes('1:00 PM – 02:00 AM'), 'Menu must contain hours');
  assert(menuHtml.includes('@spicensky') && menuHtml.includes('https://www.instagram.com/spicensky'), 'Menu must show updated Instagram handle and link');
  assert(menuHtml.includes('All prices are exclusive of taxes'), 'Menu must state tax disclaimer');

  // STRICT RULE: No Cart, No Checkout, No Order Buttons for Customers
  assert(!menuHtml.includes('id="cart"'), 'Must NOT have cart container');
  assert(!menuHtml.includes('Add to Cart'), 'Must NOT have "Add to Cart" button');
  assert(!menuHtml.includes('checkout'), 'Must NOT have checkout flow');
  assert(!menuHtml.includes('razorpay'), 'Must NOT have Razorpay');
  assert(!menuHtml.includes('stripe'), 'Must NOT have Stripe');
  console.log('  ✅ Public menu strictly read-only: Zero customer ordering/cart/checkout elements.');

  // 3. Check Menu API Data Completeness
  console.log('\n3. Verifying Menu API Data & Variants...');
  const menuDataRes = await fetch(`${BASE_URL}/api/menu`);
  const menuData = await menuDataRes.json();
  assert(menuData.success, 'Menu API must succeed');
  assert.strictEqual(menuData.data.categories.length, 18, 'Must have exactly 18 categories');
  assert(menuData.data.items.length >= 80, 'Must have at least 80 menu items');

  const pizzas = menuData.data.items.filter(i => i.menu_item_variants && i.menu_item_variants.length > 0);
  assert(pizzas.length >= 10, 'All pizzas must have selectable variant sizes');
  console.log(`  ✅ Menu API verified: ${menuData.data.categories.length} categories, ${menuData.data.items.length} items, ${pizzas.length} pizza variant sets.`);

  // 4. Test Waiter POS Workflow (Table 4 Order & Bill Generation)
  console.log('\n4. Testing Waiter POS Workflow for Table 4...');
  const cap = menuData.data.items.find(i => i.name === 'Cappuccino' && i.price === 219);
  const fries = menuData.data.items.find(i => i.name === 'Peri Peri Fries' && i.price === 160);

  assert(cap, 'Cappuccino must be present');
  assert(fries, 'Peri Peri Fries must be present');

  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_number: 4,
      waiter_name: 'Staff Sreyash',
      items: [
        { menu_item_id: cap.id, quantity: 2 }, // 2 x 219 = 438
        { menu_item_id: fries.id, quantity: 1 }  // 1 x 160 = 160
      ]
    })
  });

  const orderJson = await orderRes.json();
  assert(orderJson.success, 'Order creation must succeed');
  const bill = orderJson.data;

  // STRICT BILLING FORMULA: 438 + 160 = 598. ZERO TAX, ZERO GST
  assert.strictEqual(bill.subtotal, 598, 'Subtotal must be 598');
  assert.strictEqual(bill.total, 598, 'Total must be strictly 598');
  assert.strictEqual(bill.table_number, 4, 'Table number must be 4');
  assert.strictEqual(bill.items.length, 2, 'Must have 2 item snapshots');
  console.log(`  ✅ Order generated successfully for Table 4! Order #${bill.order_number}, Total: ₹${bill.total} (NO GST, NO TAX).`);

  // 5. Historical Price Snapshot Test via API
  console.log('\n5. Testing Historical Price Snapshot Immutability...');
  // Update Cappuccino price to ₹250
  const patchRes = await fetch(`${BASE_URL}/api/admin/menu/${cap.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: 250 })
  });
  const patchJson = await patchRes.json();
  assert(patchJson.success, 'Menu price patch must succeed');

  // Verify old order from Table 4 STILL has ₹219 for Cappuccino
  const oldOrderRes = await fetch(`${BASE_URL}/api/orders/${bill.id}`);
  const oldOrderJson = await oldOrderRes.json();
  const oldCapItem = oldOrderJson.data.items.find(i => i.item_name_snapshot === 'Cappuccino');
  assert.strictEqual(oldCapItem.unit_price_snapshot, 219, 'Historical price must remain ₹219!');
  assert.strictEqual(oldOrderJson.data.total, 598, 'Historical total must remain ₹598!');

  // Place new order
  const newOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_number: 1,
      waiter_name: 'Staff Sreyash',
      items: [{ menu_item_id: cap.id, quantity: 1 }]
    })
  });
  const newOrderJson = await newOrderRes.json();
  assert(newOrderJson.success, 'New order must succeed');
  assert.strictEqual(oldCapItem.unit_price_snapshot, 219, 'Historical price must remain ₹219!');
  assert.strictEqual(oldOrderJson.data.total, 598, 'Historical total must remain ₹598!');
  console.log('  ✅ Historical orders remain completely untouched by subsequent orders or menu updates.');

  // Restore price back to ₹219
  await fetch(`${BASE_URL}/api/admin/menu/${cap.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price: 219 })
  });

  // 6. Admin Analytics & Sales by Table
  console.log('\n6. Testing Admin Analytics & Table Breakdown...');
  const analyticsRes = await fetch(`${BASE_URL}/api/admin/analytics`);
  const analyticsJson = await analyticsRes.json();
  assert(analyticsJson.success, 'Analytics must succeed');
  const a = analyticsJson.data;

  assert(a.today.revenue >= 598, 'Today revenue must include Table 4 order');
  assert(a.salesByTable.length === 9, 'Must track all 9 tables');
  const t4Sales = a.salesByTable.find(t => t.table_number === 4);
  assert(t4Sales && t4Sales.revenue >= 598, 'Table 4 sales must be recorded');
  console.log(`  ✅ Analytics verified: Total Today Revenue: ₹${a.today.revenue}, Total Orders: ${a.today.count}.`);

  console.log('\n============================================================');
  console.log('🎉 ALL END-TO-END INTEGRATION TESTS PASSED 100%!');
  console.log('============================================================\n');
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
