const assert = require('assert');

async function runTests() {
  console.log('--- STARTING PAYMENT MODES & ANALYTICS TEST ---');
  const BASE_URL = 'http://localhost:8000';

  // 0. Authenticate as Waiter (Shan) and Admin
  const waiterAuthRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter' })
  });
  const waiterAuth = await waiterAuthRes.json();
  assert.strictEqual(waiterAuth.success, true, 'Waiter Shan login failed');
  const waiterHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${waiterAuth.token}`
  };
  console.log(`✅ Authenticated waiter "${waiterAuth.user.display_name}"`);

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
  console.log('✅ Authenticated Admin');

  // Helper to fetch menu to get item id and price
  const menuRes = await fetch(`${BASE_URL}/api/menu`);
  const menuJson = await menuRes.json();
  assert.strictEqual(menuJson.success, true, 'Menu should load');
  const testItem = menuJson.data.items[0];
  const itemPrice = Number(testItem.price);
  console.log(`Using menu item "${testItem.name}" @ ₹${itemPrice}`);

  // 1. TEST FULL CASH PAYMENT ORDER
  console.log('\n1. Testing Full CASH payment...');
  const cashOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 1,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const cashOrderJson = await cashOrderRes.json();
  assert.strictEqual(cashOrderJson.success, true);
  const cashOrderId = cashOrderJson.data.id;
  const cashTotal = cashOrderJson.data.total;
  assert.strictEqual(cashTotal, itemPrice * 2);

  const completeCashRes = await fetch(`${BASE_URL}/api/orders/${cashOrderId}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      payment_mode: 'CASH',
      cash_amount: cashTotal,
      online_amount: 0
    })
  });
  const completeCashJson = await completeCashRes.json();
  assert.strictEqual(completeCashJson.success, true);
  assert.strictEqual(completeCashJson.data.payment_mode, 'CASH');
  assert.strictEqual(Number(completeCashJson.data.cash_amount), cashTotal);
  assert.strictEqual(Number(completeCashJson.data.online_amount), 0);
  console.log(`✅ CASH payment verified: ₹${cashTotal} cash recorded.`);

  // 2. TEST FULL ONLINE / UPI PAYMENT ORDER
  console.log('\n2. Testing Full ONLINE / UPI payment...');
  const onlineOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 2,
      waiter_name: 'Yawar',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 1 }]
    })
  });
  const onlineOrderJson = await onlineOrderRes.json();
  assert.strictEqual(onlineOrderJson.success, true);
  const onlineOrderId = onlineOrderJson.data.id;
  const onlineTotal = onlineOrderJson.data.total;
  assert.strictEqual(onlineTotal, itemPrice);

  const completeOnlineRes = await fetch(`${BASE_URL}/api/orders/${onlineOrderId}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      payment_mode: 'ONLINE',
      cash_amount: 0,
      online_amount: onlineTotal
    })
  });
  const completeOnlineJson = await completeOnlineRes.json();
  assert.strictEqual(completeOnlineJson.success, true);
  assert.strictEqual(completeOnlineJson.data.payment_mode, 'ONLINE');
  assert.strictEqual(Number(completeOnlineJson.data.cash_amount), 0);
  assert.strictEqual(Number(completeOnlineJson.data.online_amount), onlineTotal);
  console.log(`✅ ONLINE payment verified: ₹${onlineTotal} online recorded.`);

  // 3. TEST SPLIT CASH + ONLINE PAYMENT
  console.log('\n3. Testing SPLIT payment (Cash + Online)...');
  const splitOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 3,
      waiter_name: 'Nawaz',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const splitOrderJson = await splitOrderRes.json();
  assert.strictEqual(splitOrderJson.success, true);
  const splitOrderId = splitOrderJson.data.id;
  const splitTotal = splitOrderJson.data.total;

  // 3A. Test validation rejection if split does not balance
  console.log('   Testing unbalanced split validation...');
  const invalidSplitRes = await fetch(`${BASE_URL}/api/orders/${splitOrderId}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      payment_mode: 'SPLIT',
      cash_amount: 10,
      online_amount: 10 // sum = 20 !== splitTotal
    })
  });
  const invalidSplitJson = await invalidSplitRes.json();
  assert.strictEqual(invalidSplitJson.success, false, 'Should reject unbalanced split');
  console.log('   ✅ Unbalanced split correctly rejected by server API.');

  // 3B. Test valid balanced split
  const halfCash = Math.floor(splitTotal / 2);
  const restOnline = splitTotal - halfCash;
  const validSplitRes = await fetch(`${BASE_URL}/api/orders/${splitOrderId}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      payment_mode: 'SPLIT',
      cash_amount: halfCash,
      online_amount: restOnline
    })
  });
  const validSplitJson = await validSplitRes.json();
  assert.strictEqual(validSplitJson.success, true);
  assert.strictEqual(validSplitJson.data.payment_mode, 'SPLIT');
  assert.strictEqual(Number(validSplitJson.data.cash_amount), halfCash);
  assert.strictEqual(Number(validSplitJson.data.online_amount), restOnline);
  console.log(`✅ Valid SPLIT payment recorded: ₹${halfCash} Cash + ₹${restOnline} Online = ₹${splitTotal}.`);

  // 4. TEST ADMIN ANALYTICS WITH CASH VS ONLINE BREAKDOWN
  console.log('\n4. Testing Admin Analytics daily & payment breakdown...');
  const analyticsRes = await fetch(`${BASE_URL}/api/admin/analytics`, {
    headers: adminHeaders
  });
  const analyticsJson = await analyticsRes.json();
  assert.strictEqual(analyticsJson.success, true);
  const a = analyticsJson.data;

  console.log('Today Metrics:', {
    revenue: a.today.revenue,
    cashRevenue: a.today.cashRevenue,
    onlineRevenue: a.today.onlineRevenue,
    cashOrders: a.today.cashOrders,
    onlineOrders: a.today.onlineOrders,
    splitOrders: a.today.splitOrders
  });

  assert(a.today.cashRevenue >= (cashTotal + halfCash), 'Cash revenue must include cash and split cash');
  assert(a.today.onlineRevenue >= (onlineTotal + restOnline), 'Online revenue must include online and split online');
  assert(Array.isArray(a.dailyBreakdown), 'dailyBreakdown must be an array');
  assert(a.dailyBreakdown.length > 0, 'dailyBreakdown must contain at least 1 day');
  console.log('Daily Breakdown Top Entry:', a.dailyBreakdown[0]);

  assert(a.dailyBreakdown[0].cashRevenue >= 0, 'dailyBreakdown has cashRevenue');
  assert(a.dailyBreakdown[0].onlineRevenue >= 0, 'dailyBreakdown has onlineRevenue');

  // 5. TEST GET ORDER BY ID RETURNS PAYMENT BREAKDOWN
  console.log('\n5. Testing single order fetch returns payment breakdown...');
  const orderCheckRes = await fetch(`${BASE_URL}/api/orders/${splitOrderId}`, {
    headers: waiterHeaders
  });
  const orderCheckJson = await orderCheckRes.json();
  assert.strictEqual(orderCheckJson.data.payment_mode, 'SPLIT');
  assert.strictEqual(Number(orderCheckJson.data.cash_amount), halfCash);
  assert.strictEqual(Number(orderCheckJson.data.online_amount), restOnline);
  console.log('✅ GET /api/orders/:id returns payment breakdown.');

  console.log('\n🎉 ALL PAYMENT MODE & ANALYTICS TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
