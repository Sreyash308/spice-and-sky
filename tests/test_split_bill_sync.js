const assert = require('assert');

async function runTest() {
  console.log('--- STARTING SPLIT BILL SYNC TEST ---');
  const BASE_URL = 'http://localhost:8000';

  // 1. Authenticate Waiter (Shan) and Admin
  const waiterLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter' })
  });
  const waiterLogin = await waiterLoginRes.json();
  assert.strictEqual(waiterLogin.success, true, 'Waiter Shan login failed');
  const waiterHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${waiterLogin.token}`
  };

  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@143', password: 'admin@143' })
  });
  const adminLogin = await adminLoginRes.json();
  assert.strictEqual(adminLogin.success, true, 'Admin login failed');
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminLogin.token}`
  };

  // 2. Fetch existing orders from Admin API
  console.log('\n2. Verifying existing orders have accurate cash_amount & online_amount in Admin order history...');
  const ordersRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: adminHeaders
  });
  const ordersJson = await ordersRes.json();
  assert.strictEqual(ordersJson.success, true, 'Admin should be able to get orders');
  const orders = ordersJson.data || [];
  console.log(`Retrieved ${orders.length} total orders.`);

  const splitOrders = orders.filter(o => o.payment_mode === 'SPLIT' && o.status === 'COMPLETED');
  console.log(`Found ${splitOrders.length} completed SPLIT orders.`);
  
  splitOrders.forEach(o => {
    console.log(`Order #${o.order_number}: Total=₹${o.total}, Cash=₹${o.cash_amount}, Online=₹${o.online_amount}, Notes="${o.notes}"`);
    assert.strictEqual(o.payment_mode, 'SPLIT');
    assert.ok(o.cash_amount > 0, `Order #${o.order_number} cash_amount must be greater than 0, got ${o.cash_amount}`);
    assert.ok(o.online_amount > 0, `Order #${o.order_number} online_amount must be greater than 0, got ${o.online_amount}`);
    assert.strictEqual(
      Math.round((Number(o.cash_amount) + Number(o.online_amount)) * 100) / 100,
      Number(o.total),
      `Order #${o.order_number} Cash (₹${o.cash_amount}) + Online (₹${o.online_amount}) must equal Total (₹${o.total})`
    );
  });
  console.log('✅ All existing split orders accurately report non-zero cash and online breakdown.');

  // 3. Create and complete a new split order to test end-to-end sync
  console.log('\n3. Creating new test order on Table 5 for Waiter Shan...');
  const menuRes = await fetch(`${BASE_URL}/api/menu`);
  const menuJson = await menuRes.json();
  const testItem = menuJson.data.items[0];
  const itemPrice = Number(testItem.price);

  const createOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 5,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const createOrderJson = await createOrderRes.json();
  assert.strictEqual(createOrderJson.success, true);
  const orderId = createOrderJson.data.id;
  const orderTotal = Number(createOrderJson.data.total);
  assert.strictEqual(orderTotal, itemPrice * 2);

  const splitCash = Math.floor(orderTotal / 3);
  const splitOnline = orderTotal - splitCash;

  console.log(`Completing order #${createOrderJson.data.order_number} with SPLIT: Cash ₹${splitCash} + Online ₹${splitOnline} = ₹${orderTotal}`);
  const completeRes = await fetch(`${BASE_URL}/api/orders/${orderId}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      payment_mode: 'SPLIT',
      cash_amount: splitCash,
      online_amount: splitOnline
    })
  });
  const completeJson = await completeRes.json();
  assert.strictEqual(completeJson.success, true);
  assert.strictEqual(completeJson.data.payment_mode, 'SPLIT');
  assert.strictEqual(Number(completeJson.data.cash_amount), splitCash);
  assert.strictEqual(Number(completeJson.data.online_amount), splitOnline);

  // 4. Verify Admin Order History reflects the split correctly
  console.log('\n4. Verifying Admin Order History reflects newly completed split order...');
  const adminCheckRes = await fetch(`${BASE_URL}/api/orders/${orderId}`, {
    headers: adminHeaders
  });
  const adminCheckJson = await adminCheckRes.json();
  assert.strictEqual(adminCheckJson.success, true);
  const fetchedOrder = adminCheckJson.data;
  assert.strictEqual(fetchedOrder.payment_mode, 'SPLIT');
  assert.strictEqual(Number(fetchedOrder.cash_amount), splitCash, `cash_amount must be ₹${splitCash}, got ${fetchedOrder.cash_amount}`);
  assert.strictEqual(Number(fetchedOrder.online_amount), splitOnline, `online_amount must be ₹${splitOnline}, got ${fetchedOrder.online_amount}`);
  console.log(`✅ Admin retrieved Order #${fetchedOrder.order_number} with Cash=₹${fetchedOrder.cash_amount}, Online=₹${fetchedOrder.online_amount}`);

  // 5. Verify Admin Analytics includes the split payment in revenue metrics
  console.log('\n5. Verifying Admin Analytics accounts for split cash and online...');
  const analyticsRes = await fetch(`${BASE_URL}/api/admin/analytics`, {
    headers: adminHeaders
  });
  const analyticsJson = await analyticsRes.json();
  assert.strictEqual(analyticsJson.success, true);
  const today = analyticsJson.data.today;
  console.log('Today Analytics:', {
    revenue: today.revenue,
    cashRevenue: today.cashRevenue,
    onlineRevenue: today.onlineRevenue,
    splitOrders: today.splitOrders
  });
  assert.ok(today.cashRevenue >= splitCash, `Today cash revenue (₹${today.cashRevenue}) must include split cash (₹${splitCash})`);
  assert.ok(today.onlineRevenue >= splitOnline, `Today online revenue (₹${today.onlineRevenue}) must include split online (₹${splitOnline})`);
  assert.ok(today.splitOrders >= 1, 'splitOrders count must be at least 1');
  console.log('✅ Admin Analytics correctly calculates cashRevenue and onlineRevenue for split bills.');

  console.log('\n🎉 ALL SPLIT BILL SYNC TESTS PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
