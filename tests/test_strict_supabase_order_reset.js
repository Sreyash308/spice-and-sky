const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testStrictReset() {
  console.log('--- TESTING STRICT SUPABASE ORDER RESET & REFRESH FLOW ---');
  const BASE_URL = 'http://localhost:8000';

  // 1. Verify admin.js contains window.location.reload()
  const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
  assert(adminJs.includes('window.location.reload()'), 'admin.js must call window.location.reload() on reset');
  console.log('✅ Verified admin.js calls window.location.reload() upon order history reset.');

  // 2. Connect directly to Supabase with service role
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 3. Authenticate as Admin
  const adminAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@143', password: 'admin@143' })
  });
  const adminAuth = await adminAuthRes.json();
  assert.strictEqual(adminAuth.success, true, 'Admin login failed');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminAuth.token}`
  };

  // 4. Authenticate as Waiter (Shan) to place test orders
  const waiterAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter' })
  });
  const waiterAuth = await waiterAuthRes.json();
  assert.strictEqual(waiterAuth.success, true);
  const waiterHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${waiterAuth.token}`
  };

  // 5. Get menu item
  const menuRes = await fetch(`${BASE_URL}/api/menu`);
  const menuJson = await menuRes.json();
  const testItem = menuJson.data.items[0];

  // 6. Seed 2 orders
  console.log('\nCreating 2 test orders...');
  const o1Res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 1,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 1 }]
    })
  });
  const o1Json = await o1Res.json();
  assert.strictEqual(o1Json.success, true);

  const o2Res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 2,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const o2Json = await o2Res.json();
  assert.strictEqual(o2Json.success, true);

  // Complete both orders
  await fetch(`${BASE_URL}/api/orders/${o1Json.data.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({ payment_mode: 'CASH' })
  });
  await fetch(`${BASE_URL}/api/orders/${o2Json.data.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({ payment_mode: 'ONLINE' })
  });

  // Check that orders exist in Supabase
  const { count: preOrdersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: preItemsCount } = await supabase.from('order_items').select('*', { count: 'exact', head: true });
  console.log(`Pre-reset Supabase counts: ${preOrdersCount} orders, ${preItemsCount} order items.`);
  assert(preOrdersCount > 0, 'Supabase orders count must be > 0 before reset');
  assert(preItemsCount > 0, 'Supabase order items count must be > 0 before reset');

  // 7. Execute Reset All Order History via Admin API
  console.log('\nCalling POST /api/admin/orders/reset...');
  const resetRes = await fetch(`${BASE_URL}/api/admin/orders/reset`, {
    method: 'POST',
    headers: adminHeaders
  });
  const resetJson = await resetRes.json();
  console.log('Reset response:', resetJson);
  assert.strictEqual(resetJson.success, true, 'Reset should succeed');

  // 8. STRICT VERIFICATION OF SUPABASE: Count MUST be exactly 0!
  console.log('\nStrictly verifying Supabase database tables...');
  const { count: postOrdersCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: postItemsCount } = await supabase.from('order_items').select('*', { count: 'exact', head: true });

  console.log(`Post-reset Supabase counts: ${postOrdersCount} orders, ${postItemsCount} order items.`);
  assert.strictEqual(postOrdersCount, 0, `Supabase orders table MUST have 0 rows, got ${postOrdersCount}`);
  assert.strictEqual(postItemsCount, 0, `Supabase order_items table MUST have 0 rows, got ${postItemsCount}`);
  console.log('✅ Confirmed: 0 orders and 0 order items in Supabase (100% strictly purged).');

  // 9. Verify that a new order created after reset starts back at Order #1
  console.log('\nPlacing a new order after reset to verify sequence reset to #1...');
  const newOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 3,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 1 }]
    })
  });
  const newOrderJson = await newOrderRes.json();
  assert.strictEqual(newOrderJson.success, true);
  console.log('New order created with order_number:', newOrderJson.data.order_number);
  assert.strictEqual(Number(newOrderJson.data.order_number), 1, 'Next order number must reset to 1');
  console.log('✅ Confirmed: Order sequence reset back to Order #1.');

  // Clean up the test order
  console.log('\nFinal cleanup of test order...');
  await fetch(`${BASE_URL}/api/admin/orders/reset`, {
    method: 'POST',
    headers: adminHeaders
  });
  const { count: finalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  assert.strictEqual(finalOrders, 0);
  console.log('✅ Final check: 0 orders remain in Supabase.');

  console.log('\n🎉 ALL STRICT SUPABASE RESET & REFRESH TESTS PASSED!');
}

testStrictReset().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
