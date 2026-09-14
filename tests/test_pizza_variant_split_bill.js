const http = require('http');

function postJson(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, text: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function putJson(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path,
      method: 'PUT',
      headers
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, text: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path,
      method: 'GET',
      headers
    }, (res) => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, text: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('--- 1. Login as Waiter Shan ---');
  const loginRes = await postJson('/api/auth/login', {
    username: 'Shan',
    password: 'waiter'
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes)}`);
  }
  const token = loginRes.data.token;
  console.log('✅ Waiter Shan logged in successfully.');

  console.log('\n--- 2. Fetch Active Orders and verify Order #5 ---');
  const activeRes = await getJson('/api/orders/active', token);
  if (activeRes.status !== 200) {
    throw new Error(`Failed to get active orders: ${JSON.stringify(activeRes)}`);
  }
  const ordersList = Array.isArray(activeRes.data) ? activeRes.data : (activeRes.data.data || []);
  const order5 = ordersList.find(o => o.order_number === 5 || o.id === '9c90d1fd-2b0e-4b7e-bc2e-d21d0f6327e8');
  if (!order5) {
    console.warn('⚠️ Order #5 not found in active list (might already be completed or id differs).');
  } else {
    console.log(`Order #5 found: status=${order5.status}, total=₹${order5.total}, subtotal=₹${order5.subtotal}`);
    console.log(`Items in Order #5 (${order5.items.length}):`);
    order5.items.forEach((it, idx) => {
      console.log(`  [${idx + 1}] ${it.item_name_snapshot} (${it.variant_name_snapshot || 'no variant'}) x${it.quantity} @ ₹${it.unit_price_snapshot} = ₹${it.line_total}`);
    });
    if (order5.total !== 748) {
      throw new Error(`Expected Order #5 total to be 748, but got ${order5.total}`);
    }
    console.log('✅ Order #5 verified with total ₹748 (1x 9-inch @ ₹349 + 1x 12-inch @ ₹399).');
  }

  const menuRes = await getJson('/api/menu');
  const menuList = menuRes.data.data.items || [];
  const pizza = menuList.find(i => i.name.toLowerCase().includes('barbecue chicken'));
  if (!pizza || !pizza.menu_item_variants || pizza.menu_item_variants.length < 2) {
    throw new Error('Barbecue Chicken Pizza with variants not found in menu');
  }
  const v9 = pizza.menu_item_variants.find(v => v.name.includes('9'));
  const v12 = pizza.menu_item_variants.find(v => v.name.includes('12'));
  console.log(`Using variants: 9-inch (${v9.id}, ₹${v9.price}), 12-inch (${v12.id}, ₹${v12.price})`);

  const createRes = await postJson('/api/orders', {
    table_number: 2,
    waiter_id: loginRes.data.user.id,
    waiter_name: 'Shan',
    idempotency_key: `test-variant-order-${Date.now()}`,
    status: 'CONFIRMED',
    items: [
      {
        menu_item_id: pizza.id,
        variant_id: v9.id,
        variant_name: v9.name,
        price: v9.price,
        quantity: 1
      },
      {
        menu_item_id: pizza.id,
        variant_id: v12.id,
        variant_name: v12.name,
        price: v12.price,
        quantity: 1
      }
    ]
  }, token);

  if (createRes.status !== 201) {
    throw new Error(`Failed to create test order: ${JSON.stringify(createRes)}`);
  }
  const testOrder = createRes.data.data;
  console.log(`Created test order #${testOrder.order_number} (id: ${testOrder.id}): total=₹${testOrder.total}`);
  if (testOrder.total !== 748) {
    throw new Error(`Expected test order total 748, got ${testOrder.total}`);
  }
  console.log('✅ Test order created with total ₹748.');

  console.log('\n--- 4. Update test order (simulate PUT /api/orders/:id during bill generation) ---');
  // Even if waiter sends only variant_name without variant_id:
  const putRes = await putJson(`/api/orders/${testOrder.id}`, {
    waiter_id: loginRes.data.user.id,
    waiter_name: 'Shan',
    status: 'CONFIRMED',
    items: [
      {
        menu_item_id: pizza.id,
        variant_name: '9 inch',
        price: 349,
        quantity: 1
      },
      {
        menu_item_id: pizza.id,
        variant_name: '12 inch',
        price: 399,
        quantity: 1
      }
    ]
  }, token);

  if (putRes.status !== 200) {
    throw new Error(`Failed to update test order: ${JSON.stringify(putRes)}`);
  }
  const updatedOrder = putRes.data.data;
  console.log(`Updated test order total: ₹${updatedOrder.total}`);
  if (updatedOrder.total !== 748) {
    throw new Error(`Expected test order total 748 after update, got ${updatedOrder.total}`);
  }
  console.log('✅ Test order updated without dropping variant price! Total is ₹748.');

  console.log('\n--- 5. Finalize Split Bill (Cash ₹500 + Online ₹248 = ₹748) ---');
  const completeRes = await postJson(`/api/orders/${testOrder.id}/complete`, {
    payment_mode: 'SPLIT',
    cash_amount: 500,
    online_amount: 248
  }, token);

  if (completeRes.status !== 200) {
    throw new Error(`Failed to complete split bill: ${JSON.stringify(completeRes)}`);
  }
  const completedOrder = completeRes.data.data;
  console.log(`Completed test order: status=${completedOrder.status}, payment_mode=${completedOrder.payment_mode}, cash=${completedOrder.cash_amount}, online=${completedOrder.online_amount}`);
  if (completedOrder.payment_mode !== 'SPLIT' || completedOrder.cash_amount !== 500 || completedOrder.online_amount !== 248) {
    throw new Error(`Split payment details mismatch: ${JSON.stringify(completedOrder)}`);
  }
  console.log('✅ Split bill completed successfully: Cash ₹500 + Online ₹248 = ₹748!');

  console.log('\n========================================');
  console.log('🎉 ALL PIZZA VARIANT SPLIT BILL TESTS PASSED!');
  console.log('========================================');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
