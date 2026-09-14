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

  // Test random / unknown users
  const randomUsers = ['UnknownPerson', 'hacker', 'guest', 'random_waiter', 'server_1', '12345'];
  for (const rUser of randomUsers) {
    const unknownRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: rUser, password: 'waiter' })
    });
    assert.strictEqual(unknownRes.status, 401, `Random user "${rUser}" must return 401`);
  }
  console.log('  ✅ All random usernames correctly rejected with 401');

  // Test legacy generic waiter accounts (waiter, staff) are strictly disallowed
  const legacyUsers = ['waiter', 'staff', 'waiter@spiceandsky.com'];
  for (const legUser of legacyUsers) {
    const legRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: legUser, password: 'waiter' })
    });
    assert.strictEqual(legRes.status, 401, `Legacy user "${legUser}" must return 401`);
  }
  console.log('  ✅ Legacy generic waiter/staff usernames strictly disallowed');

  // Test admin credentials rejected on waiter portal login
  const adminWaiterLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@143', password: 'admin@143', portal: 'waiter' })
  });
  assert.strictEqual(adminWaiterLoginRes.status, 401, 'Admin credentials on waiter terminal must be rejected');
  console.log('  ✅ Admin credentials strictly blocked from waiter terminal login (401)');

  // Test Route-level protection for /waiter: Unauthenticated requests MUST redirect to /waiter/login
  const unauthWaiterPageRes = await fetch(`${BASE_URL}/waiter`, { redirect: 'manual' });
  assert([301, 302, 307, 308].includes(unauthWaiterPageRes.status), `Unauthenticated /waiter should redirect (got ${unauthWaiterPageRes.status})`);
  assert(unauthWaiterPageRes.headers.get('location')?.includes('/waiter/login'), 'Unauthenticated /waiter must redirect to /waiter/login');
  console.log('  ✅ Unauthenticated access to /waiter is blocked and 302 redirected to /waiter/login');

  // Test Admin credentials accessing /waiter directly: MUST redirect to /waiter/login
  const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@143', password: 'admin@143' })
  }).then(r => r.json());
  assert(adminLogin.token, 'Admin login should succeed');
  
  const adminWaiterAccessRes = await fetch(`${BASE_URL}/waiter`, {
    headers: { 'Cookie': `spice_token=${adminLogin.token}` },
    redirect: 'manual'
  });
  assert([301, 302, 307, 308].includes(adminWaiterAccessRes.status), 'Admin accessing /waiter directly must redirect');
  assert(adminWaiterAccessRes.headers.get('location')?.includes('/waiter/login'), 'Admin accessing /waiter must redirect to /waiter/login');
  console.log('  ✅ Admin credentials cannot access /waiter (redirected to /waiter/login)');

  // Test Legacy Active Session Token termination
  const jwt = require('jsonwebtoken');
  const legacyToken = jwt.sign(
    {
      id: 'f80da808-79e6-45e0-801c-19064070a9a1',
      role: 'WAITER',
      username: 'Shan'
    },
    'spice_sky_rooftop_cafe_secret_key_2026_jwt_token', // old secret
    { expiresIn: '365d' }
  );
  const legacySessionCheck = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${legacyToken}` }
  }).then(r => r.json());
  assert.strictEqual(legacySessionCheck.authenticated, false, 'Old active session token must be terminated and rejected');
  console.log('  ✅ Legacy active session token killed and successfully rejected (authenticated: false)');

  // Test Route-level protection with random fake token cookie: MUST redirect to /waiter/login
  const fakeTokenWaiterRes = await fetch(`${BASE_URL}/waiter`, {
    headers: { 'Cookie': 'spice_token=fake_random_token_123' },
    redirect: 'manual'
  });
  assert([301, 302, 307, 308].includes(fakeTokenWaiterRes.status), 'Random fake token /waiter must redirect');
  assert(fakeTokenWaiterRes.headers.get('location')?.includes('/waiter/login'), 'Random fake token must redirect to /waiter/login');
  console.log('  ✅ Random fake token access to /waiter is blocked and 302 redirected');

  // Test order placement with waiter attribution
  console.log('Testing order placement attributed to Shan and Nawaz...');
  
  // Login as Shan
  const shanLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter' })
  }).then(r => r.json());

  // Verify authenticated Shan cookie successfully accesses /waiter (200 OK)
  const authWaiterPageRes = await fetch(`${BASE_URL}/waiter`, {
    headers: { 'Cookie': `spice_token=${shanLogin.token}` }
  });
  assert.strictEqual(authWaiterPageRes.status, 200, 'Authenticated waiter should receive 200 OK on /waiter');
  console.log('  ✅ Authenticated waiter Shan successfully accesses /waiter with 200 OK');

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
