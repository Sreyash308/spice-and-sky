const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testWaiterUI() {
  console.log('Validating Waiter UI markup and display elements...');

  const waiterHtml = fs.readFileSync(path.join(__dirname, '../public/waiter.html'), 'utf-8');

  // Check 1: waiterStaffBadge element exists and contains waiterUsernameText
  assert(waiterHtml.includes('id="waiterStaffBadge"'), 'waiterStaffBadge must exist in waiter.html');
  assert(waiterHtml.includes('id="waiterUsernameText"'), 'waiterUsernameText must exist in waiter.html');
  assert(!waiterHtml.includes('id="waiterStaffBadge" style="display: none;"'), 'waiterStaffBadge should not be permanently hidden with display:none inline');

  // Check 2: waiterGreetingBadge and waiterGreetingName exist in table section
  assert(waiterHtml.includes('id="waiterGreetingBadge"'), 'waiterGreetingBadge must exist in waiter.html');
  assert(waiterHtml.includes('id="waiterGreetingName"'), 'waiterGreetingName must exist in waiter.html');

  // Check 3: drawerServerBadge and drawerServerName exist in order drawer
  assert(waiterHtml.includes('id="drawerServerBadge"'), 'drawerServerBadge must exist in waiter.html');
  assert(waiterHtml.includes('id="drawerServerName"'), 'drawerServerName must exist in waiter.html');

  // Check 4: waiter.js has updateWaiterDisplay implementation
  const waiterJs = fs.readFileSync(path.join(__dirname, '../public/js/waiter.js'), 'utf-8');
  assert(waiterJs.includes('updateWaiterDisplay'), 'waiter.js must define updateWaiterDisplay');
  assert(waiterJs.includes('waiterUsernameText'), 'waiter.js must update waiterUsernameText');
  assert(waiterJs.includes('waiterGreetingName'), 'waiter.js must update waiterGreetingName');
  assert(waiterJs.includes('drawerServerName'), 'waiter.js must update drawerServerName');

  // Check 5: Verify login API returns username for Shan, Yawar, Nawaz, admin@143
  const BASE_URL = 'http://localhost:8000';
  for (const user of ['Shan', 'Yawar', 'Nawaz']) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: 'waiter' })
    });
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.username, user);
    assert.strictEqual(data.user.display_name, user);
    console.log(`  ✅ Login response for ${user} returns username: "${data.user.username}"`);
  }

  console.log('✅ ALL WAITER USERNAME DISPLAY CHECKS PASSED!');
}

testWaiterUI().catch(err => {
  console.error('❌ UI test failed:', err);
  process.exit(1);
});
