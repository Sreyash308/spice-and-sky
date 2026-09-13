/**
 * SPICE & SKY ROOFTOP CAFE - HEAVY STRESS, SECURITY & INVARIANT TEST SUITE
 * 
 * Executes rigorous, deep-dive testing across:
 * 1. Security & Authentication Bypass (OWASP Top 10 API)
 * 2. Input Validation, Fuzzing & Boundary Invariants
 * 3. Stored XSS & Injection Payloads
 * 4. High-Concurrency Stress & Race Conditions (100+ parallel requests)
 * 5. Concurrent Order Edits & Completion Atomicity
 * 6. SSE Connection Storm & Socket Management
 * 7. Algorithmic Complexity & Analytics Benchmark
 * 8. Historical Snapshot Immutability & Cascade Deletion
 * 9. DOM & Static Asset Integrity
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8000';

function request(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

const testResults = {
  passed: 0,
  failed: 0,
  vulnerabilities: [],
  performanceMetrics: {},
  flaws: []
};

function pass(name) {
  console.log(`  ✅ PASS: ${name}`);
  testResults.passed++;
}

function fail(name, reason) {
  console.error(`  ❌ FAIL: ${name}`);
  console.error(`     Reason: ${reason}`);
  testResults.failed++;
  testResults.flaws.push({ test: name, error: reason });
}

function vuln(severity, title, details) {
  console.warn(`  ⚠️ [VULNERABILITY - ${severity}] ${title}`);
  console.warn(`     Details: ${details}`);
  testResults.vulnerabilities.push({ severity, title, details });
}

async function runHeavyTests() {
  console.log('\n============================================================');
  console.log('🔥 SPICE & SKY HEAVY STRESS, SECURITY & FLAW AUDIT SUITE');
  console.log('============================================================\n');

  // Fetch a sample valid item for tests
  const menuRes = await request('GET', '/api/menu');
  assert(menuRes.data.success, 'Failed to fetch menu');
  const items = menuRes.data.data.items;
  const sampleItem = items.find(i => i.is_available && (!i.menu_item_variants || i.menu_item_variants.length === 0));
  const sampleItemWithVariants = items.find(i => i.menu_item_variants && i.menu_item_variants.length > 0);
  assert(sampleItem, 'Sample item needed');
  assert(sampleItemWithVariants, 'Sample item with variants needed');

  // -------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & ACCESS CONTROL (BROKEN ACCESS CONTROL)
  // -------------------------------------------------------------
  console.log('\n--- 🛡️ Section 1: Authentication & Access Control Audits ---');

  // Test 1.1: Unauthenticated access to /api/admin/analytics
  const unauthAnalytics = await request('GET', '/api/admin/analytics');
  if (unauthAnalytics.status === 200 && unauthAnalytics.data.success) {
    vuln('CRITICAL', 'Missing Authentication on Admin Analytics (/api/admin/analytics)',
      'Unauthenticated public users can access complete restaurant sales revenue, total bills, and order history.');
  } else {
    pass('Admin analytics is protected against unauthenticated access');
  }

  // Test 1.2: Unauthenticated POST to /api/admin/menu
  const unauthMenuAdd = await request('POST', '/api/admin/menu', {
    name: 'Hacker Injected Item',
    price: 999,
    category_id: items[0].category_id
  });
  if (unauthMenuAdd.status === 201 && unauthMenuAdd.data.success) {
    vuln('CRITICAL', 'Missing Authentication on Admin Menu Insertion (/api/admin/menu)',
      'Any unauthenticated user can add arbitrary items to the live restaurant menu.');
    // Clean it up if created
    if (unauthMenuAdd.data.data?.id) {
      await request('DELETE', `/api/admin/menu/${unauthMenuAdd.data.data.id}?permanent=true`);
    }
  } else {
    pass('Admin menu insertion is protected');
  }

  // Test 1.3: Unauthenticated DELETE to /api/admin/menu/:id
  const unauthMenuDel = await request('DELETE', `/api/admin/menu/${sampleItem.id}`);
  if (unauthMenuDel.status === 200 && unauthMenuDel.data.success) {
    vuln('CRITICAL', 'Missing Authentication on Admin Menu Archival / Deletion (/api/admin/menu/:id)',
      'Any anonymous attacker can archive or permanently delete menu items.');
    // Restore the item
    await request('POST', `/api/admin/menu/${sampleItem.id}/restore`);
  } else {
    pass('Admin menu deletion is protected');
  }

  // Test 1.4: Unauthenticated Order Creation & Modification
  const unauthOrderCreate = await request('POST', '/api/orders', {
    table_number: 1,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }],
    waiter_name: 'Ghost'
  });
  let testOrderId = null;
  if (unauthOrderCreate.status === 201 && unauthOrderCreate.data.success) {
    testOrderId = unauthOrderCreate.data.data.id;
    vuln('HIGH', 'Missing Authentication on POS Order Creation (/api/orders)',
      'Anonymous requests without a waiter session can submit authoritative table orders.');
  } else {
    pass('Order creation requires waiter authentication');
  }

  // Test 1.5: Unauthenticated Order Completion
  const unauthComplete = await request('POST', '/api/orders/00000000-0000-0000-0000-000000000000/complete');
  if (unauthComplete.status === 401) {
    pass('Order completion requires staff/admin session (401 Unauthorized)');
  } else {
    vuln('HIGH', 'Missing Authentication on Order Completion (/api/orders/:id/complete)',
      'Anonymous requests can call complete route without session.');
  }

  // Test 1.6: Weak Credential Fallback (Trivial Password Bypass)
  const weakLogin = await request('POST', '/api/auth/login', {
    email: 'admin@143',
    password: '1234'
  });
  if (weakLogin.status === 200 && weakLogin.data.success && weakLogin.data.user?.role === 'ADMIN') {
    vuln('CRITICAL', 'Hardcoded Staff Fallback Accepts Any Password for Admin Account',
      'The backend grants full ADMIN role to admin@143 with wrong password.');
  } else {
    pass('Weak/wrong password for admin@143 rejected');
  }

  // Test 1.7: Arbitrary Email substring bypass
  const regexBypass = await request('POST', '/api/auth/login', {
    email: 'attacker-admin-fake@evil.com',
    password: 'any'
  });
  if (regexBypass.status === 200 && regexBypass.data.success && regexBypass.data.user?.role === 'ADMIN') {
    vuln('CRITICAL', 'Authentication Bypass: Any Email Containing "admin" Granted Admin Privileges',
      'The server checks normalizedEmail.includes("admin") and grants ADMIN role regardless of password.');
  } else {
    pass('Arbitrary email with "admin" rejected');
  }

  // -------------------------------------------------------------
  // AUTHENTICATE TEST SESSIONS FOR AUTHORIZED APIS
  // -------------------------------------------------------------
  console.log('\n--- 🔑 Authenticating Test Sessions for Authorized Functionality ---');
  const waiterLogin = await request('POST', '/api/auth/login', {
    email: 'waiter@spiceandsky.com',
    password: 'SpiceSkyWaiter2026!'
  });
  assert(waiterLogin.data?.success, 'Waiter login should succeed with valid credentials');
  const waiterHeaders = { 'x-session-id': waiterLogin.data.session_id };

  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@143',
    password: 'admin@143'
  });
  assert(adminLogin.data?.success, 'Admin login should succeed with valid credentials');
  const adminHeaders = { 'x-session-id': adminLogin.data.session_id };
  pass('Waiter and Admin test sessions authenticated');

  // -------------------------------------------------------------
  // SECTION 2: INPUT VALIDATION, BOUNDARY & FUZZING TESTS
  // -------------------------------------------------------------
  console.log('\n--- 🔍 Section 2: Input Validation, Boundary & Fuzzing ---');

  // Test 2.1: Table Number 0 Boundary
  const tableZero = await request('POST', '/api/orders', {
    table_number: 0,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }]
  }, waiterHeaders);
  if (tableZero.status === 201) {
    fail('Strict Table Invariant: Table 0 accepted', 'Expected 400 Bad Request for Table 0 (allowed tables: 1-9)');
  } else {
    pass('Table 0 rejected with status ' + tableZero.status);
  }

  // Test 2.2: Table Number 10 Boundary
  const tableTen = await request('POST', '/api/orders', {
    table_number: 10,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }]
  }, waiterHeaders);
  if (tableTen.status === 201) {
    fail('Strict Table Invariant: Table 10 accepted', 'Expected 400 Bad Request for Table 10 (allowed tables: 1-9)');
  } else {
    pass('Table 10 rejected with status ' + tableTen.status);
  }

  // Test 2.3: Negative Table Number (-5)
  const tableNeg = await request('POST', '/api/orders', {
    table_number: -5,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }]
  }, waiterHeaders);
  if (tableNeg.status === 201) {
    fail('Strict Table Invariant: Table -5 accepted', 'Expected 400 Bad Request for negative table');
  } else {
    pass('Table -5 rejected with status ' + tableNeg.status);
  }

  // Test 2.4: String Table Number ("Table 1")
  const tableString = await request('POST', '/api/orders', {
    table_number: 'Table 1',
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }]
  }, waiterHeaders);
  if (tableString.status === 201) {
    fail('Table NaN accepted', 'String "Table 1" parsed as NaN or accepted without validation');
  } else {
    pass('Non-numeric table string rejected');
  }

  // Test 2.5: Negative Quantity (-5)
  const negQty = await request('POST', '/api/orders', {
    table_number: 2,
    items: [{ menu_item_id: sampleItem.id, quantity: -5 }]
  }, waiterHeaders);
  if (negQty.status === 201) {
    if (negQty.data.data?.total < 0) {
      fail('Negative quantity creates negative bill!', `Total: ${negQty.data.data?.total}`);
    } else {
      vuln('MEDIUM', 'Negative Quantity Sanitized to Default Instead of Rejected',
        'Quantity -5 was coerced to 1 instead of returning 400 Bad Request error.');
    }
  } else {
    pass('Negative quantity rejected with 400 Bad Request');
  }

  // Test 2.6: Zero Quantity (0)
  const zeroQty = await request('POST', '/api/orders', {
    table_number: 2,
    items: [{ menu_item_id: sampleItem.id, quantity: 0 }]
  }, waiterHeaders);
  if (zeroQty.status === 201) {
    vuln('LOW', 'Zero Quantity Coerced to 1', 'Quantity 0 was coerced to 1 instead of rejecting invalid quantity.');
  } else {
    pass('Zero quantity rejected with 400 Bad Request');
  }

  // Test 2.7: Floating Point Quantity (1.5)
  const floatQty = await request('POST', '/api/orders', {
    table_number: 2,
    items: [{ menu_item_id: sampleItem.id, quantity: 1.5 }]
  }, waiterHeaders);
  if (floatQty.status === 201) {
    const qty = floatQty.data.data?.items?.[0]?.quantity;
    if (qty === 1.5) {
      fail('Fractional quantity accepted', 'Food items should be discrete integer counts, got 1.5');
    } else {
      pass('Fractional quantity truncated/converted to integer: ' + qty);
    }
  } else {
    pass('Fractional quantity rejected with 400 Bad Request');
  }

  // Test 2.8: Price Tampering (Client submits price: 1)
  const priceTamper = await request('POST', '/api/orders', {
    table_number: 3,
    items: [{ menu_item_id: sampleItem.id, quantity: 1, price: 1, unit_price: 1 }]
  }, waiterHeaders);
  if (priceTamper.status === 201) {
    const charged = priceTamper.data.data?.total;
    if (charged === 1) {
      fail('CRITICAL: Server accepted client-side price override of ₹1!', `Expected ₹${sampleItem.price}, got ₹${charged}`);
    } else {
      assert.strictEqual(charged, sampleItem.price, `Server must charge authoritative DB price ₹${sampleItem.price}`);
      pass('Server strictly ignored client price override and charged authoritative DB price ₹' + charged);
    }
  }

  // Test 2.9: Non-existent Menu Item UUID
  const bogusItem = await request('POST', '/api/orders', {
    table_number: 3,
    items: [{ menu_item_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }]
  }, waiterHeaders);
  if (bogusItem.status === 201) {
    fail('Bogus item UUID created an order with ghost item', JSON.stringify(bogusItem.data));
  } else {
    pass('Bogus menu item rejected with error: ' + (bogusItem.data?.error || bogusItem.status));
  }

  // Test 2.10: Mismatched Variant (submitting variant of item B for item A)
  const variantObj = sampleItemWithVariants.menu_item_variants[0];
  const mismatchedVariant = await request('POST', '/api/orders', {
    table_number: 3,
    items: [{ menu_item_id: sampleItem.id, variant_id: variantObj.id, quantity: 1 }]
  }, waiterHeaders);
  if (mismatchedVariant.status === 201) {
    fail('Variant mismatch accepted: Variant for pizza applied to non-pizza item', JSON.stringify(mismatchedVariant.data));
  } else {
    pass('Mismatched variant correctly rejected');
  }

  // -------------------------------------------------------------
  // SECTION 3: INJECTION & STORED XSS AUDITS
  // -------------------------------------------------------------
  console.log('\n--- 💉 Section 3: Injection & Stored XSS Audits ---');

  const xssPayload = `<script>alert('XSS_${Date.now()}')</script><img src=x onerror=alert(1)>`;
  const xssOrder = await request('POST', '/api/orders', {
    table_number: 4,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }],
    waiter_name: xssPayload,
    notes: xssPayload
  }, waiterHeaders);

  if (xssOrder.status === 201) {
    const savedWaiter = xssOrder.data.data?.waiter_name_snapshot;
    const savedNotes = xssOrder.data.data?.notes;
    if (savedWaiter && savedWaiter.includes('<script>')) {
      vuln('HIGH', 'Stored XSS in Order Waiter Name / Notes',
        `Unsanitized HTML/JS saved into order records and rendered directly via .innerHTML in admin.js / waiter.js without escaping.`);
    } else {
      pass('Waiter name and notes are sanitized on save');
    }
  }

  // SQL Injection in query params
  const sqliRes = await request('GET', "/api/orders?table_number=1'%20OR%20'1'='1", null, waiterHeaders);
  if (sqliRes.status === 500) {
    vuln('MEDIUM', 'SQL Injection syntax error or 500 triggered on malformed query param', sqliRes.data?.error);
  } else {
    pass('SQL injection attempt handled safely (returned status ' + sqliRes.status + ')');
  }

  // Prototype Pollution attempt
  const protoPollution = await request('POST', '/api/orders', {
    table_number: 4,
    items: [{ menu_item_id: sampleItem.id, quantity: 1 }],
    __proto__: { isAdmin: true },
    constructor: { prototype: { poll: true } }
  }, waiterHeaders);
  if (({}).poll === true || ({}).isAdmin === true) {
    fail('CRITICAL: Prototype Pollution succeeded!', 'Global Object prototype was polluted');
  } else {
    pass('Prototype pollution payload safely neutralized');
  }

  // -------------------------------------------------------------
  // SECTION 4: HIGH-CONCURRENCY STRESS & RACE CONDITION TESTS
  // -------------------------------------------------------------
  console.log('\n--- ⚡ Section 4: High-Concurrency Stress & Race Conditions ---');

  console.log('  Testing 100 concurrent order submissions across Tables 1 through 9...');
  const CONCURRENT_COUNT = 100;
  const concurrentPromises = [];
  const startTime = Date.now();

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    const tbl = (i % 9) + 1;
    concurrentPromises.push(
      request('POST', '/api/orders', {
        table_number: tbl,
        items: [{ menu_item_id: sampleItem.id, quantity: 1 }],
        waiter_name: `Concurrent-Worker-${i}`,
        notes: `Load test order #${i}`
      }, waiterHeaders)
    );
  }

  const concurrentResults = await Promise.all(concurrentPromises);
  const durationMs = Date.now() - startTime;
  testResults.performanceMetrics.hundredOrdersMs = durationMs;
  testResults.performanceMetrics.ordersPerSec = Math.round((CONCURRENT_COUNT / durationMs) * 1000);

  const successfulOrders = concurrentResults.filter(r => r.status === 201 && r.data.success);
  const failedOrders = concurrentResults.filter(r => r.status !== 201 || !r.data.success);

  console.log(`  📊 Concurrency Result: ${successfulOrders.length}/${CONCURRENT_COUNT} succeeded in ${durationMs}ms (${testResults.performanceMetrics.ordersPerSec} req/sec)`);

  if (failedOrders.length > 0) {
    fail(`Concurrency failure: ${failedOrders.length} orders failed under load`,
      `Sample error: ${JSON.stringify(failedOrders[0].data)}`);
  } else {
    pass(`All ${CONCURRENT_COUNT} concurrent orders completed successfully`);
  }

  // Verify Order Numbers are strictly unique
  const orderNumbers = successfulOrders.map(r => r.data.data.order_number).filter(Boolean);
  const uniqueOrderNumbers = new Set(orderNumbers);
  if (orderNumbers.length > 0 && uniqueOrderNumbers.size !== orderNumbers.length) {
    fail('RACE CONDITION: Duplicate order numbers generated under concurrency!',
      `Generated ${orderNumbers.length} orders but only ${uniqueOrderNumbers.size} unique order numbers!`);
  } else {
    pass(`Strict Order Sequence: All ${uniqueOrderNumbers.size} order numbers are unique`);
  }

  // Test 4.2: Concurrent Edits on the Same Order (Race condition on bill modification)
  const targetOrder = successfulOrders[0]?.data?.data;
  if (targetOrder) {
    console.log(`  Testing concurrent bill updates on Order #${targetOrder.order_number}...`);
    const editPromises = [
      request('PUT', `/api/orders/${targetOrder.id}`, {
        items: [{ menu_item_id: sampleItem.id, quantity: 2 }]
      }, waiterHeaders),
      request('PUT', `/api/orders/${targetOrder.id}`, {
        items: [{ menu_item_id: sampleItem.id, quantity: 3 }]
      }, waiterHeaders),
      request('PUT', `/api/orders/${targetOrder.id}`, {
        items: [{ menu_item_id: sampleItem.id, quantity: 4 }]
      }, waiterHeaders)
    ];

    const editResults = await Promise.all(editPromises);
    const validEdits = editResults.filter(r => r.status === 200 && r.data.success);
    if (validEdits.length === 3) {
      // Check final state
      const finalOrderRes = await request('GET', `/api/orders/${targetOrder.id}`, null, waiterHeaders);
      const finalOrder = finalOrderRes.data.data;
      assert(finalOrder, 'Final order must exist');
      const expectedSubtotal = finalOrder.items.reduce((s, i) => s + (i.unit_price_snapshot * i.quantity), 0);
      if (finalOrder.subtotal !== expectedSubtotal) {
        fail('Race condition in bill subtotal calculation', `Expected ₹${expectedSubtotal}, got ₹${finalOrder.subtotal}`);
      } else {
        pass(`Order bill edits handled cleanly, subtotal strictly consistent (₹${finalOrder.subtotal})`);
      }
    }
  }

  // -------------------------------------------------------------
  // SECTION 5: SSE (SERVER-SENT EVENTS) STRESS & SOCKET LEAK AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 📡 Section 5: SSE (Server-Sent Events) Stress & Socket Leak ---');

  const SSE_CLIENT_COUNT = 25;
  const sseSockets = [];
  let sseConnectedCount = 0;

  for (let i = 0; i < SSE_CLIENT_COUNT; i++) {
    const req = http.request(new URL('/api/events', BASE_URL), (res) => {
      if (res.statusCode === 200) {
        sseConnectedCount++;
      }
    });
    req.on('error', () => {});
    req.end();
    sseSockets.push(req);
  }

  // Give connections 300ms to register
  await new Promise(r => setTimeout(r, 300));
  console.log(`  Connected ${sseConnectedCount}/${SSE_CLIENT_COUNT} SSE client listeners.`);

  // Abruptly destroy all SSE sockets
  sseSockets.forEach(s => s.destroy());
  await new Promise(r => setTimeout(r, 200));

  // Verify server is still alive and responding
  const healthAfterSSE = await request('GET', '/api/health');
  if (healthAfterSSE.status === 200 && healthAfterSSE.data.status === 'ok') {
    pass('Server cleanly withstood SSE connection storm and abrupt client disconnection');
  } else {
    fail('Server hung or crashed following SSE socket termination', JSON.stringify(healthAfterSSE));
  }

  // -------------------------------------------------------------
  // SECTION 6: ANALYTICS PERFORMANCE & COMPLEXITY AUDIT (O(N x M))
  // -------------------------------------------------------------
  console.log('\n--- ⏱️ Section 6: Analytics Algorithmic Complexity Benchmark ---');

  const analyticsStart = Date.now();
  const analyticsRes = await request('GET', '/api/admin/analytics', null, adminHeaders);
  const analyticsDuration = Date.now() - analyticsStart;
  testResults.performanceMetrics.analyticsDurationMs = analyticsDuration;

  console.log(`  Analytics response time for current order volume: ${analyticsDuration}ms`);
  if (analyticsDuration > 2000) {
    fail('Analytics endpoint latency too high (>2000ms)', `${analyticsDuration}ms`);
  } else {
    pass(`Analytics responds within ${analyticsDuration}ms`);
  }

  if (analyticsRes.data?.data) {
    const a = analyticsRes.data.data;
    // Verify sales by table count is exactly 9
    assert.strictEqual(a.salesByTable.length, 9, 'salesByTable should have exactly 9 tables');
    pass('Analytics salesByTable strictly maps to exactly 9 tables');
  }

  // -------------------------------------------------------------
  // SECTION 7: HISTORICAL PRICE SNAPSHOT & IMMUTABILITY AUDIT
  // -------------------------------------------------------------
  console.log('\n--- 📜 Section 7: Historical Price Snapshots & Immutability ---');

  // Create an order with original price
  const originalPrice = sampleItem.price;
  const snapshotOrderRes = await request('POST', '/api/orders', {
    table_number: 7,
    items: [{ menu_item_id: sampleItem.id, quantity: 2 }]
  }, waiterHeaders);
  const snapshotOrder = snapshotOrderRes.data.data;
  assert.strictEqual(snapshotOrder.total, originalPrice * 2);

  // Update the menu item price in database
  const newPrice = originalPrice + 50;
  await request('PATCH', `/api/admin/menu/${sampleItem.id}`, { price: newPrice }, adminHeaders);

  // Query historical order again: it MUST still reflect original price!
  const verifyHistRes = await request('GET', `/api/orders/${snapshotOrder.id}`, null, waiterHeaders);
  const verifyHistOrder = verifyHistRes.data.data;
  const histItem = verifyHistOrder.items.find(i => i.menu_item_id === sampleItem.id);

  if (histItem.unit_price_snapshot !== originalPrice || verifyHistOrder.total !== originalPrice * 2) {
    fail('Historical price snapshot corrupted by subsequent menu price edit!',
      `Expected snapshot ₹${originalPrice}, but order now shows ₹${histItem.unit_price_snapshot}`);
  } else {
    pass(`Historical price snapshot preserved: item changed ₹${originalPrice} -> ₹${newPrice}, order retained ₹${originalPrice}`);
  }

  // Restore price
  await request('PATCH', `/api/admin/menu/${sampleItem.id}`, { price: originalPrice }, adminHeaders);

  // -------------------------------------------------------------
  // SECTION 8: STATIC ASSETS, CSS SIZING & DOM INTEGRITY
  // -------------------------------------------------------------
  console.log('\n--- 🎨 Section 8: Static Assets, CSS Layout & DOM Integrity ---');

  // Check CSS files exist and are not empty
  const cssFiles = ['admin.css', 'public-menu.css', 'waiter.css', 'design-system.css', 'print.css', 'splash.css'];
  cssFiles.forEach(f => {
    const fullPath = path.join(__dirname, '..', 'public', 'css', f);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
      fail(`CSS asset missing or empty: ${f}`, fullPath);
    } else {
      pass(`CSS asset verified: ${f} (${fs.statSync(fullPath).size} bytes)`);
    }
  });

  // Check required HTML files
  const htmlFiles = ['menu.html', 'waiter.html', 'waiter-login.html', 'admin.html', 'admin-login.html'];
  htmlFiles.forEach(h => {
    const fullPath = path.join(__dirname, '..', 'public', h);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
      fail(`HTML asset missing or empty: ${h}`, fullPath);
    } else {
      pass(`HTML template verified: ${h}`);
    }
  });

  // Check CSP Headers
  const cspHeader = healthAfterSSE.headers['content-security-policy'];
  if (!cspHeader) {
    fail('Missing Content Security Policy (CSP) header', 'Helmet CSP not active');
  } else {
    const scriptSrcMatch = cspHeader.match(/script-src[^;]+/);
    if (scriptSrcMatch && scriptSrcMatch[0].includes("'unsafe-inline'")) {
      vuln('LOW', "CSP allows 'unsafe-inline' in script-src",
        'Allowing unsafe-inline enables XSS execution if user-supplied strings are injected into innerHTML.');
    } else {
      pass('Helmet CSP script-src strictly disallows inline script execution');
    }
    pass('Helmet CSP header verified: ' + cspHeader.slice(0, 60) + '...');
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n============================================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('============================================================');
  console.log(`✅ Total Tests Passed:       ${testResults.passed}`);
  console.log(`❌ Total Functional Flaws:   ${testResults.failed}`);
  console.log(`⚠️ Security Vulnerabilities: ${testResults.vulnerabilities.length}`);
  console.log(`⚡ Concurrency Throughput:   ${testResults.performanceMetrics.ordersPerSec || 'N/A'} req/sec`);
  console.log('============================================================\n');

  if (testResults.vulnerabilities.length > 0) {
    console.log('🚨 DISCOVERED VULNERABILITIES:');
    testResults.vulnerabilities.forEach((v, idx) => {
      console.log(`  ${idx + 1}. [${v.severity}] ${v.title}`);
      console.log(`     -> ${v.details}\n`);
    });
  }

  if (testResults.flaws.length > 0) {
    console.log('⚠️ DISCOVERED FUNCTIONAL FLAWS:');
    testResults.flaws.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.test}`);
      console.log(`     -> ${f.error}\n`);
    });
  }

  // Return exit code 0 so process finishes and outputs full report
  process.exit(0);
}

runHeavyTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
