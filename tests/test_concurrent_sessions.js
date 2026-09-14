const http = require('http');

function postJson(urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        try {
          resolve({ status: res.status, headers: res.headers, cookies, data: JSON.parse(responseBody) });
        } catch (e) {
          resolve({ status: res.status, headers: res.headers, cookies, raw: responseBody });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: urlPath,
      method: 'GET',
      headers
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(responseBody) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: responseBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- Testing Concurrent Isolated Logins & No Cross-Tab Auto-Logout ---');

  // 1. Login Waiter (Shan)
  const waiterLogin = await postJson('/api/auth/login', {
    email: 'shan',
    password: 'waiter',
    portal: 'waiter'
  });
  console.log('1. Waiter Login:', waiterLogin.data.success ? 'SUCCESS' : 'FAILED', waiterLogin.data.user?.username);
  const waiterToken = waiterLogin.data.token;
  const waiterCookies = waiterLogin.cookies;
  console.log('   Waiter Cookies:', waiterCookies.map(c => c.split(';')[0]));

  // Extract spice_waiter_token
  const waiterCookieStr = waiterCookies.map(c => c.split(';')[0]).join('; ');

  // 2. Login Admin (admin@143)
  const adminLogin = await postJson('/api/auth/login', {
    email: 'admin@143',
    password: 'admin@143',
    portal: 'admin'
  });
  console.log('2. Admin Login:', adminLogin.data.success ? 'SUCCESS' : 'FAILED', adminLogin.data.user?.username);
  const adminToken = adminLogin.data.token;
  const adminCookies = adminLogin.cookies;
  console.log('   Admin Cookies:', adminCookies.map(c => c.split(';')[0]));

  const adminCookieStr = adminCookies.map(c => c.split(';')[0]).join('; ');

  // 3. Verify Waiter Session while Admin is logged in
  const waiterSession = await getJson('/api/auth/session?portal=waiter', {
    'Authorization': `Bearer ${waiterToken}`,
    'x-portal': 'waiter'
  });
  console.log('3. Waiter Session with Waiter Token:', waiterSession.data.authenticated ? 'ACTIVE' : 'INACTIVE', waiterSession.data.user?.username);

  // 4. Verify Admin Session while Waiter is logged in
  const adminSession = await getJson('/api/auth/session?portal=admin', {
    'Authorization': `Bearer ${adminToken}`,
    'x-portal': 'admin'
  });
  console.log('4. Admin Session with Admin Token:', adminSession.data.authenticated ? 'ACTIVE' : 'INACTIVE', adminSession.data.user?.username);

  // 5. Verify Combined Cookie Jar (Browser with both waiter and admin tabs open!)
  const combinedCookies = `${waiterCookieStr}; ${adminCookieStr}`;
  const waiterViaCookies = await getJson('/api/auth/session?portal=waiter', {
    'Cookie': combinedCookies
  });
  console.log('5. Waiter Session via Combined Cookies:', waiterViaCookies.data.authenticated ? 'ACTIVE' : 'INACTIVE', waiterViaCookies.data.user?.username);

  const adminViaCookies = await getJson('/api/auth/session?portal=admin', {
    'Cookie': combinedCookies
  });
  console.log('6. Admin Session via Combined Cookies:', adminViaCookies.data.authenticated ? 'ACTIVE' : 'INACTIVE', adminViaCookies.data.user?.username);

  // 7. Test Logout of Waiter ONLY
  const waiterLogout = await postJson('/api/auth/logout', {
    token: waiterToken,
    portal: 'waiter'
  }, { 'Cookie': combinedCookies });
  console.log('7. Waiter Logout Result:', waiterLogout.data.success ? 'SUCCESS' : 'FAILED');

  // Check that Admin session is STILL ACTIVE after Waiter logout!
  const adminAfterWaiterLogout = await getJson('/api/auth/session?portal=admin', {
    'Authorization': `Bearer ${adminToken}`,
    'Cookie': adminCookieStr
  });
  console.log('8. Admin Session AFTER Waiter Logout:', adminAfterWaiterLogout.data.authenticated ? 'STILL ACTIVE (PASSED)' : 'LOGGED OUT (FAILED!)', adminAfterWaiterLogout.data.user?.username);

  // 9. Reject random waiter login
  const randomLogin = await postJson('/api/auth/login', {
    email: 'hacker',
    password: 'password123',
    portal: 'waiter'
  });
  console.log('9. Random waiter login rejection:', !randomLogin.data.success ? 'REJECTED (PASSED)' : 'ALLOWED (FAILED!)');

  if (waiterSession.data.authenticated && adminSession.data.authenticated && waiterViaCookies.data.authenticated && adminViaCookies.data.authenticated && adminAfterWaiterLogout.data.authenticated && !randomLogin.data.success) {
    console.log('\n>>> ALL ISOLATION & CONCURRENT SESSION CHECKS PASSED! <<<');
  } else {
    console.error('\n>>> SOME CHECKS FAILED! <<<');
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
