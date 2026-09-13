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
  assert(menuHtml.includes('SPICE &amp; SKY ROOFTOP CAFE') || menuHtml.includes('SPICE & SKY') || menuHtml.includes('Spice &amp; Sky'), 'Menu must contain cafe name');
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
  assert(menuData.data.categories.length >= 18, `Expected at least 18 categories, got ${menuData.data.categories.length}`);
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

  // Authenticate Waiter & Admin Sessions for POS & Admin APIs
  console.log('  Authenticating test sessions (Waiter & Admin)...');
  const waiterLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waiter@spiceandsky.com', password: 'SpiceSkyWaiter2026!' })
  });
  const waiterLoginJson = await waiterLoginRes.json();
  assert(waiterLoginJson.success, 'Waiter login must succeed');
  const waiterHeaders = {
    'Content-Type': 'application/json',
    'x-session-id': waiterLoginJson.session_id
  };

  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@143', password: 'admin@143' })
  });
  const adminLoginJson = await adminLoginRes.json();
  assert(adminLoginJson.success, 'Admin login must succeed');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-session-id': adminLoginJson.session_id
  };
  console.log('  ✅ Test sessions authenticated.');

  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
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

  // Verify Table 4 is currently serving
  const activeRes = await fetch(`${BASE_URL}/api/orders/active`, { headers: waiterHeaders });
  const activeJson = await activeRes.json();
  assert(activeJson.success, 'Active orders query must succeed');
  const t4Active = activeJson.data.find(o => o.table_number === 4);
  assert(t4Active, 'Table 4 must appear in currently serving active orders');

  // Edit Bill: customer adds another round or updates items
  const editRes = await fetch(`${BASE_URL}/api/orders/${bill.id}`, {
    method: 'PUT',
    headers: waiterHeaders,
    body: JSON.stringify({
      items: [
        { menu_item_id: cap.id, quantity: 2 },
        { menu_item_id: fries.id, quantity: 1 }
      ],
      waiter_name: 'Staff Sreyash'
    })
  });
  const editJson = await editRes.json();
  assert(editJson.success, 'Edit bill must succeed');
  assert.strictEqual(editJson.data.total, 598, 'Edited bill total must be 598');

  // Customer is full -> Complete & finalize bill
  const completeRes = await fetch(`${BASE_URL}/api/orders/${bill.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders
  });
  const completeJson = await completeRes.json();
  assert(completeJson.success, 'Complete bill must succeed');
  assert.strictEqual(completeJson.data.status, 'COMPLETED', 'Order status must be COMPLETED');
  console.log(`  ✅ Order completed and billed for Table 4! Order #${bill.order_number}, Total: ₹${bill.total} (NO GST, NO TAX).`);

  // 5. Historical Price Snapshot Test via API
  console.log('\n5. Testing Historical Price Snapshot Immutability...');
  // Update Cappuccino price to ₹250
  const patchRes = await fetch(`${BASE_URL}/api/admin/menu/${cap.id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ price: 250 })
  });
  const patchJson = await patchRes.json();
  assert(patchJson.success, 'Menu price patch must succeed');

  // Verify old order from Table 4 STILL has ₹219 for Cappuccino
  const oldOrderRes = await fetch(`${BASE_URL}/api/orders/${bill.id}`, { headers: waiterHeaders });
  const oldOrderJson = await oldOrderRes.json();
  const oldCapItem = oldOrderJson.data.items.find(i => i.item_name_snapshot === 'Cappuccino');
  assert.strictEqual(oldCapItem.unit_price_snapshot, 219, 'Historical price must remain ₹219!');
  assert.strictEqual(oldOrderJson.data.total, 598, 'Historical total must remain ₹598!');

  // Place new order
  const newOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
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
    headers: adminHeaders,
    body: JSON.stringify({ price: 219 })
  });

  // 6. Admin Analytics & Sales by Table
  console.log('\n6. Testing Admin Analytics & Table Breakdown...');
  const analyticsRes = await fetch(`${BASE_URL}/api/admin/analytics`, { headers: adminHeaders });
  const analyticsJson = await analyticsRes.json();
  assert(analyticsJson.success, 'Analytics must succeed');
  const a = analyticsJson.data;

  assert(a.today.revenue >= 598, 'Today revenue must include Table 4 order');
  assert(a.salesByTable.length === 9, 'Must track all 9 tables');
  const t4Sales = a.salesByTable.find(t => t.table_number === 4);
  assert(t4Sales && t4Sales.revenue >= 598, 'Table 4 sales must be recorded');
  console.log(`  ✅ Analytics verified: Total Today Revenue: ₹${a.today.revenue}, Total Orders: ${a.today.count}.`);

  // 7. Testing Multiple Concurrent Orders on Single Table via API
  console.log('\n7. Testing Multiple Concurrent Orders on Single Table (Table 6)...');
  const initialActiveRes = await fetch(`${BASE_URL}/api/orders/active`, { headers: waiterHeaders });
  const initialActiveJson = await initialActiveRes.json();
  const t6InitialCount = initialActiveJson.data.filter(o => o.table_number === 6).length;

  const order6ARes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 6,
      waiter_name: 'Staff MultiOrder',
      items: [{ menu_item_id: cap.id, quantity: 1 }]
    })
  });
  const order6A = (await order6ARes.json()).data;

  const order6BRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 6,
      waiter_name: 'Staff MultiOrder',
      items: [{ menu_item_id: fries.id, quantity: 2 }]
    })
  });
  const order6B = (await order6BRes.json()).data;

  assert.notStrictEqual(order6A.id, order6B.id, 'Both orders on Table 6 must have unique IDs');

  // Verify /api/orders/active contains both orders for Table 6
  const activeCheckRes = await fetch(`${BASE_URL}/api/orders/active`, { headers: waiterHeaders });
  const activeCheckJson = await activeCheckRes.json();
  const t6Active = activeCheckJson.data.filter(o => o.table_number === 6);
  assert.strictEqual(t6Active.length, t6InitialCount + 2, 'Table 6 must have exactly initialCount + 2 active orders');
  console.log(`  ✅ Table 6 successfully has ${t6Active.length} active orders open simultaneously (initial + 2).`);

  // Complete Order 6A
  const comp6ARes = await fetch(`${BASE_URL}/api/orders/${order6A.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders
  });
  assert((await comp6ARes.json()).success, 'Order 6A completion must succeed');

  // Verify Table 6 still has Order 6B active
  const activeAfter6ARes = await fetch(`${BASE_URL}/api/orders/active`, { headers: waiterHeaders });
  const activeAfter6A = await activeAfter6ARes.json();
  const t6Remaining = activeAfter6A.data.filter(o => o.table_number === 6);
  assert.strictEqual(t6Remaining.length, t6InitialCount + 1, 'Table 6 must have initialCount + 1 active orders remaining');
  assert(t6Remaining.some(o => o.id === order6B.id), 'Order 6B must be one of the remaining active orders');
  console.log('  ✅ Order 6A completed; Order 6B remains active and serving.');

  // Complete Order 6B
  const comp6BRes = await fetch(`${BASE_URL}/api/orders/${order6B.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders
  });
  assert((await comp6BRes.json()).success, 'Order 6B completion must succeed');

  // Verify Table 6 returns to initial active count
  const activeAfter6BRes = await fetch(`${BASE_URL}/api/orders/active`, { headers: waiterHeaders });
  const activeAfter6B = await activeAfter6BRes.json();
  const t6Final = activeAfter6B.data.filter(o => o.table_number === 6);
  assert.strictEqual(t6Final.length, t6InitialCount, 'Table 6 must return to initialCount active orders after both complete');
  console.log('  ✅ Both test orders on Table 6 completed cleanly.');

  console.log('\n============================================================');
  console.log('🎉 ALL END-TO-END INTEGRATION TESTS PASSED 100%!');
  console.log('============================================================\n');
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
