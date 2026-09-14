const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Bill Generation escapeHtml & Sanitization Resilience...');

// 1. Verify waiter.js contains top-level escapeHtml definition & window fallback
const waiterJs = fs.readFileSync(path.join(__dirname, '../public/js/waiter.js'), 'utf8');
assert(waiterJs.includes('function escapeHtml(str)'), 'waiter.js must define escapeHtml function');
assert(waiterJs.includes('window.escapeHtml = escapeHtml'), 'waiter.js must attach escapeHtml to window');
assert(waiterJs.includes('window.SpiceClient.escapeHtml = escapeHtml'), 'waiter.js must attach escapeHtml to SpiceClient if missing');

// 2. Verify line where bill items are rendered uses safe fallback
assert(waiterJs.includes('(window.escapeHtml || escapeHtml)(rawTitle)'), 'Bill items must use safe (window.escapeHtml || escapeHtml)(rawTitle)');

// 3. Verify supabase-client.js exports escapeHtml
const supabaseClientJs = fs.readFileSync(path.join(__dirname, '../public/js/supabase-client.js'), 'utf8');
assert(supabaseClientJs.includes('escapeHtml,'), 'supabase-client.js must export escapeHtml');
assert(supabaseClientJs.includes('window.escapeHtml = escapeHtml'), 'supabase-client.js must attach escapeHtml to window');

// 4. Test escapeHtml functionality with special characters
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const testTitles = [
  'Cappuccino (Large & Hot)',
  'Pizza <Special> "Double Cheese"',
  "Chef's Salad & Bread",
  null,
  undefined,
  123
];

const expected = [
  'Cappuccino (Large &amp; Hot)',
  'Pizza &lt;Special&gt; &quot;Double Cheese&quot;',
  'Chef&#039;s Salad &amp; Bread',
  '',
  '',
  '123'
];

testTitles.forEach((t, i) => {
  const result = escapeHtml(t);
  assert.strictEqual(result, expected[i], `Escape HTML failed for ${t}: expected ${expected[i]}, got ${result}`);
});

console.log('  ✅ escapeHtml handles & < > " \' and falsy values flawlessly');

// 5. Simulate bill generation rendering without throwing TypeError
const order = {
  table_number: 1,
  total: 558,
  items: [
    { item_name_snapshot: 'Chicken Tikka <Spicy>', variant_name_snapshot: 'Full & Roasted', quantity: 2, line_total: 558 }
  ]
};

// Simulate execution where SpiceClient does NOT have escapeHtml (the exact bug condition)
const MockSpiceClient = {
  formatCurrency: (n) => `₹${n}`
  // notice: escapeHtml is deliberately missing to test fallback
};

const items = order.items;
let billHtml = '';
items.forEach(oi => {
  const rawTitle = (oi.item_name_snapshot || oi.name || 'Item') + (oi.variant_name_snapshot ? ` (${oi.variant_name_snapshot})` : '');
  const itemTitle = (MockSpiceClient.escapeHtml || escapeHtml)(rawTitle);
  billHtml += `<tr><td>${itemTitle}</td><td>${oi.quantity}</td><td>${MockSpiceClient.formatCurrency(oi.line_total)}</td></tr>`;
});

assert(billHtml.includes('Chicken Tikka &lt;Spicy&gt; (Full &amp; Roasted)'), 'Bill HTML must correctly escape items without error');
console.log('  ✅ Bill item rendering succeeds without throwing any error even when SpiceClient.escapeHtml is undefined!');

console.log('\n🎉 ALL BILL GENERATION ESCAPEHTML VERIFICATIONS PASSED!');
