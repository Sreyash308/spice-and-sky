const assert = require('assert');

async function testGlobalSessionKill() {
  const BASE_URL = 'http://localhost:8000';
  console.log('Testing Global Session Deletion & Auto-Signout Verification...\n');

  // 1. Authenticate Shan
  const shanLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter', portal: 'waiter' })
  });
  const shanLogin = await shanLoginRes.json();
  assert(shanLogin.token, 'Shan login should return token');
  console.log('  ✅ Shan logged in successfully. Token generated.');

  // 2. Authenticate Nawaz
  const nawazLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Nawaz', password: 'waiter', portal: 'waiter' })
  });
  const nawazLogin = await nawazLoginRes.json();
  assert(nawazLogin.token, 'Nawaz login should return token');
  console.log('  ✅ Nawaz logged in successfully. Token generated.');

  // 3. Authenticate Admin
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin@143', password: 'admin@143' })
  });
  const adminLogin = await adminLoginRes.json();
  assert(adminLogin.token, 'Admin login should return token');
  console.log('  ✅ Admin logged in successfully. Token generated.');

  // 4. Verify all 3 sessions are active before kill
  const checkShanBefore = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${shanLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkShanBefore.authenticated, true, 'Shan session must be active before kill');

  const checkAdminBefore = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${adminLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkAdminBefore.authenticated, true, 'Admin session must be active before kill');

  console.log('  ✅ Verified: Active sessions validated for Shan and Admin.');

  // 5. TRIGGER GLOBAL KILL: POST /api/auth/kill-all-sessions
  console.log('\n  ⚡ Triggering Global Kill: POST /api/auth/kill-all-sessions...');
  const killRes = await fetch(`${BASE_URL}/api/auth/kill-all-sessions`, {
    method: 'POST'
  });
  assert.strictEqual(killRes.status, 200, 'Kill sessions endpoint must return 200');
  const killData = await killRes.json();
  assert(killData.success, 'Kill sessions response must have success: true');
  console.log(`  ✅ All sessions killed. New Epoch: ${killData.sessionEpoch}`);

  // 6. Verify Shan's token is immediately invalid
  const checkShanAfter = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${shanLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkShanAfter.authenticated, false, 'Shan token must be invalidated (authenticated: false)');
  console.log('  ✅ Shan token immediately rejected by /api/auth/session (authenticated: false)');

  // 7. Verify Nawaz's token is immediately invalid
  const checkNawazAfter = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${nawazLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkNawazAfter.authenticated, false, 'Nawaz token must be invalidated (authenticated: false)');
  console.log('  ✅ Nawaz token immediately rejected by /api/auth/session (authenticated: false)');

  // 8. Verify Admin's token is immediately invalid
  const checkAdminAfter = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${adminLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkAdminAfter.authenticated, false, 'Admin token must be invalidated (authenticated: false)');
  console.log('  ✅ Admin token immediately rejected by /api/auth/session (authenticated: false)');

  // 9. Verify protected API rejects Shan's old token with 401
  const orderWithKilledTokenRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shanLogin.token}`
    },
    body: JSON.stringify({ table_number: 1, items: [{ menu_item_id: 'test', quantity: 1 }] })
  });
  assert.strictEqual(orderWithKilledTokenRes.status, 401, 'Request with killed token must return 401');
  console.log('  ✅ API request with killed token rejected with 401 Unauthorized');

  // 10. Verify /waiter route blocks killed cookie and redirects to /waiter/login
  const waiterPageRes = await fetch(`${BASE_URL}/waiter`, {
    headers: { 'Cookie': `spice_token=${shanLogin.token}` },
    redirect: 'manual'
  });
  assert([301, 302, 307, 308].includes(waiterPageRes.status), 'Killed cookie visiting /waiter must redirect');
  assert(waiterPageRes.headers.get('location')?.includes('/waiter/login'), 'Must redirect to /waiter/login');
  console.log('  ✅ Killed cookie visiting /waiter is redirected to /waiter/login');

  // 11. Verify new login AFTER kill succeeds and gets authenticated
  const freshLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Shan', password: 'waiter', portal: 'waiter' })
  });
  const freshLogin = await freshLoginRes.json();
  assert(freshLogin.token, 'Fresh login after kill must succeed');

  const checkFreshSession = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${freshLogin.token}` }
  }).then(r => r.json());
  assert.strictEqual(checkFreshSession.authenticated, true, 'Fresh session must be authenticated: true');
  console.log('  ✅ Fresh login after kill receives valid token and authenticates cleanly');

  // Final kill so that the test token is also wiped
  await fetch(`${BASE_URL}/api/auth/kill-all-sessions`, { method: 'POST' });
  console.log('  ✅ Final global purge executed. All active tokens wiped clean.');

  console.log('\n🎉 ALL GLOBAL SESSION KILL & AUTO-SIGNOUT TESTS PASSED!');
}

testGlobalSessionKill().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
