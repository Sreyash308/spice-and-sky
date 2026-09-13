const assert = require('assert');

async function testWaiters() {
  const BASE_URL = 'http://localhost:8000';

  console.log('Testing Waiter Authorizations: Shan, Yawar, Nawaz (password: waiter)...');

  const waiters = [
    { username: 'Shan', expectedName: 'Shan' },
    { username: 'shan', expectedName: 'Shan' },
    { username: 'SHAN', expectedName: 'Shan' },
    { username: 'Yawar', expectedName: 'Yawar' },
    { username: 'yawar', expectedName: 'Yawar' },
    { username: 'Nawaz', expectedName: 'Nawaz' },
    { username: 'nawaz', expectedName: 'Nawaz' },
  ];

  for (const w of waiters) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: w.username, password: 'waiter' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Login for ${w.username} should return 200`);
    assert.strictEqual(data.success, true, `Login for ${w.username} should succeed`);
    assert.strictEqual(data.user.role, 'WAITER', `Role for ${w.username} should be WAITER`);
    assert.strictEqual(data.user.display_name, w.expectedName, `Display name for ${w.username} should be ${w.expectedName}`);
    assert(data.token, `Token should be present for ${w.username}`);
    console.log(`  ✅ Successfully authenticated waiter "${w.username}" -> display_name: "${data.user.display_name}"`);
  }

  // Test wrong password
  const failRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'wrongpassword' })
  });
  assert.strictEqual(failRes.status, 401, 'Wrong password must return 401');
  console.log('  ✅ Shan with wrong password correctly rejected with 401');

  // Test unknown user
  const unknownRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'UnknownPerson', password: 'waiter' })
  });
  assert.strictEqual(unknownRes.status, 401, 'Unknown user must return 401');
  console.log('  ✅ Unknown user correctly rejected with 401');

  // Test order placement with waiter attribution
  console.log('Testing order placement attributed to Shan and Nawaz...');
  
  // Login as Shan
  const shanLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter' })
  }).then(r => r.json());

  const menuRes = await fetch(`${BASE_URL}/api/menu`).then(r => r.json());
  const sampleItem = menuRes.data.items[0];

  // Place order as Shan
  const shanOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shanLogin.token}`
    },
    body: JSON.stringify({
      table_number: 2,
      items: [{ menu_item_id: sampleItem.id, quantity: 1 }],
      waiter_name: shanLogin.user.display_name
    })
  });
  const shanOrder = await shanOrderRes.json();
  if (!shanOrder.success) {
    console.error('Order response:', shanOrder);
  }
  assert(shanOrder.success, 'Shan order placement should succeed');
  assert.strictEqual(shanOrder.data.waiter_name_snapshot, 'Shan', `Snapshot should be 'Shan', got '${shanOrder.data.waiter_name_snapshot}'`);
  console.log(`  ✅ Order #${shanOrder.data.order_sequence || shanOrder.data.id} placed by Shan with waiter_name_snapshot = "Shan"`);

  // Verify Waiter cannot access Admin API
  const adminForbiddenRes = await fetch(`${BASE_URL}/api/admin/orders/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shanLogin.token}`
    }
  });
  assert.strictEqual(adminForbiddenRes.status, 403, 'Waiter accessing admin API must be 403 Forbidden');
  console.log('  ✅ Waiter role blocked from admin endpoints with 403 Forbidden');

  // Test Sign Out / Token Revocation
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${shanLogin.token}`
    }
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout should succeed');

  const sessionCheck = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${shanLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(sessionCheck.authenticated, false, 'Revoked token should not be authenticated');
  console.log('  ✅ Sign out successfully revokes session token');

  console.log('\n🎉 ALL WAITER AUTHORIZATION TESTS PASSED SUCCESSFULLY!');
}

testWaiters().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
