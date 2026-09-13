const assert = require('assert');

async function testManualCashFlow() {
  console.log('--- TESTING MANUAL CASH ENTRY & ONLINE REMAINDER FLOW ---');
  const BASE_URL = 'http://localhost:8000';

  // 1. Authenticate as Waiter (Shan)
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

  // Fetch a menu item
  const menuRes = await fetch(`${BASE_URL}/api/menu`);
  const menuJson = await menuRes.json();
  const testItem = menuJson.data.items[0];
  const unitPrice = Number(testItem.price);
  const totalBill = unitPrice * 2; // e.g. 2 x 279 = 558

  // 2. Scenario A: Waiter enters manual partial cash
  console.log(`\nScenario A: Order total ₹${totalBill}. Waiter enters manual cash ₹200...`);
  const orderRes1 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 5,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const order1 = (await orderRes1.json()).data;
  assert.strictEqual(Number(order1.total), totalBill);

  const manualCash = 200;
  const expectedOnline = totalBill - manualCash; // 558 - 200 = 358

  const completeRes1 = await fetch(`${BASE_URL}/api/orders/${order1.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      cash_amount: manualCash
      // Note: online_amount is derived automatically by server as Total - Cash!
    })
  });
  const completeJson1 = await completeRes1.json();
  assert.strictEqual(completeJson1.success, true, `Complete order failed: ${completeJson1.error}`);
  assert.strictEqual(completeJson1.data.payment_mode, 'SPLIT');
  assert.strictEqual(Number(completeJson1.data.cash_amount), manualCash);
  assert.strictEqual(Number(completeJson1.data.online_amount), expectedOnline);
  console.log(`✅ Partial cash verified: Cash = ₹${completeJson1.data.cash_amount}, Online (Total - Cash) = ₹${completeJson1.data.online_amount}`);

  // 3. Scenario B: Customer opts for Full Cash payment
  console.log(`\nScenario B: Order total ₹${totalBill}. Customer opts for FULL CASH...`);
  const orderRes2 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 6,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const order2 = (await orderRes2.json()).data;

  const completeRes2 = await fetch(`${BASE_URL}/api/orders/${order2.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      cash_amount: totalBill
    })
  });
  const completeJson2 = await completeRes2.json();
  assert.strictEqual(completeJson2.success, true);
  assert.strictEqual(completeJson2.data.payment_mode, 'CASH');
  assert.strictEqual(Number(completeJson2.data.cash_amount), totalBill);
  assert.strictEqual(Number(completeJson2.data.online_amount), 0);
  console.log(`✅ Full cash verified: Cash = ₹${completeJson2.data.cash_amount}, Online = ₹0`);

  // 4. Scenario C: Customer opts for Full Online / No Cash
  console.log(`\nScenario C: Order total ₹${totalBill}. Customer pays 100% ONLINE (Cash = 0)...`);
  const orderRes3 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 7,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const order3 = (await orderRes3.json()).data;

  const completeRes3 = await fetch(`${BASE_URL}/api/orders/${order3.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      cash_amount: 0
    })
  });
  const completeJson3 = await completeRes3.json();
  assert.strictEqual(completeJson3.success, true);
  assert.strictEqual(completeJson3.data.payment_mode, 'ONLINE');
  assert.strictEqual(Number(completeJson3.data.cash_amount), 0);
  assert.strictEqual(Number(completeJson3.data.online_amount), totalBill);
  console.log(`✅ Full online verified: Cash = ₹0, Online = ₹${completeJson3.data.online_amount}`);

  // 5. Scenario D: Negative cash rejection
  console.log('\nScenario D: Testing negative cash rejection...');
  const orderRes4 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      table_number: 8,
      waiter_name: 'Shan',
      status: 'CONFIRMED',
      items: [{ menu_item_id: testItem.id, quantity: 2 }]
    })
  });
  const order4 = (await orderRes4.json()).data;

  const completeRes4 = await fetch(`${BASE_URL}/api/orders/${order4.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      cash_amount: -50
    })
  });
  const completeJson4 = await completeRes4.json();
  assert.strictEqual(completeJson4.success, false, 'Should reject negative cash');
  console.log('✅ Negative cash correctly rejected by API.');

  // 6. Scenario E: Cash > Total rejection
  console.log('\nScenario E: Testing Cash > Total rejection...');
  const completeRes5 = await fetch(`${BASE_URL}/api/orders/${order4.id}/complete`, {
    method: 'POST',
    headers: waiterHeaders,
    body: JSON.stringify({
      cash_amount: totalBill + 500
    })
  });
  const completeJson5 = await completeRes5.json();
  assert.strictEqual(completeJson5.success, false, 'Should reject cash exceeding total');
  console.log('✅ Cash > Total correctly rejected by API.');

  console.log('\n🎉 ALL MANUAL CASH FLOW & CALCULATION TESTS PASSED SUCCESSFULLY!');
}

testManualCashFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
