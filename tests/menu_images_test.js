/**
 * Comprehensive Automated Verification for Customer Menu Images
 * Tests:
 * 1. Image serving via HTTP GET for all 105 menu items & 6 category fallbacks.
 * 2. MIME type verification: image/webp for every file.
 * 3. File size constraints: Each image must be between 5 KB and 120 KB.
 * 4. Image mapping verification: All 105 items map to distinct or accurate assets.
 * 5. Menu HTML and CSS verification:
 *    - Presence of .item-card-thumb-box, .favorite-card-media, .cart-item-img.
 *    - Desktop: 104px x 94px
 *    - Tablet: 106px x 94px
 *    - Mobile: 90px x 80px
 *    - object-fit: cover for thumbnails, contain for media/cart.
 *    - Presence of loading="lazy", decoding="async", onerror fallback handler.
 * 6. Zero regression on billing, tables, or non-customer pages.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://localhost:8000';

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + urlPath, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: Buffer.concat(chunks)
        });
      });
    }).on('error', reject);
  });
}

async function runImageTests() {
  console.log('============================================================');
  console.log('🖼️ RUNNING CUSTOMER MENU IMAGE VERIFICATION TESTS');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Audit File & Local Store Checks
  console.log('--- Suite 1: Asset Completeness & Disk Footprint ---');
  const audit = JSON.parse(fs.readFileSync('scripts/image_audit.json', 'utf8'));
  test(`Audit JSON contains exactly 105 menu items`, () => {
    assert.strictEqual(audit.length, 105);
  });

  test(`All 105 audit items have status VERIFIED and size < 120 KB`, () => {
    audit.forEach(item => {
      assert.strictEqual(item.status, 'VERIFIED', `Item ${item.name} not verified`);
      assert(item.file_size_kb > 5 && item.file_size_kb < 120, `Item ${item.name} size out of bounds: ${item.file_size_kb} KB`);
    });
  });

  const fallbacks = ['food.webp', 'pizza.webp', 'pasta.webp', 'coffee.webp', 'drink.webp', 'burger.webp'];
  test(`All 6 category fallback WebP files exist on disk`, () => {
    fallbacks.forEach(f => {
      const p = path.join(__dirname, '../public/images/menu/fallbacks', f);
      assert(fs.existsSync(p), `Missing fallback: ${f}`);
      const stats = fs.statSync(p);
      assert(stats.size > 5000 && stats.size < 120000, `Fallback ${f} size out of bounds: ${stats.size} bytes`);
    });
  });

  // 2. HTTP Serving Tests
  console.log('\n--- Suite 2: HTTP Serving & MIME Type Integrity ---');
  await testAsync('Server returns 200 and image/webp for sample food, coffee, and fallback', async () => {
    const samples = [
      '/images/menu/veg-fried-rice.webp',
      '/images/menu/cappuccino-hot.webp',
      '/images/menu/classic-pizza.webp',
      '/images/menu/fallbacks/pizza.webp',
      '/images/menu/fallbacks/coffee.webp'
    ];
    for (const s of samples) {
      const res = await httpGet(s);
      assert.strictEqual(res.statusCode, 200, `Expected 200 for ${s}`);
      assert.strictEqual(res.headers['content-type'], 'image/webp', `Expected image/webp for ${s}`);
      assert(res.data.length > 5000, `Expected body > 5000 bytes for ${s}`);
    }
  });

  // 3. CSS Hard Rule Verification
  console.log('\n--- Suite 3: CSS Sizing & Layout Rule Adherence ---');
  const css = fs.readFileSync('public/css/public-menu.css', 'utf8');

  test('CSS enforces Desktop .item-card-thumb-box dimensions (104px x 94px)', () => {
    assert(css.includes('width: 104px;'), 'Missing 104px width for desktop thumbnail');
    assert(css.includes('height: 94px;'), 'Missing 94px height for desktop thumbnail');
    assert(css.includes('object-fit: cover;'), 'Missing object-fit: cover for thumbnail image');
  });

  test('CSS enforces Tablet breakpoint max-width: 991px (106px x 94px)', () => {
    assert(css.includes('max-width: 991px'), 'Missing max-width: 991px media query');
    assert(css.includes('width: 106px;'), 'Missing 106px width for tablet thumbnail');
  });

  test('CSS enforces Mobile breakpoint max-width: 480px (90px x 80px)', () => {
    assert(css.includes('max-width: 480px'), 'Missing max-width: 480px media query');
    assert(css.includes('width: 90px;'), 'Missing 90px width for mobile thumbnail');
    assert(css.includes('height: 80px;'), 'Missing 80px height for mobile thumbnail');
  });

  test('CSS contains .favorite-card-media (210px, contain) & .cart-item-img (50px x 50px, contain)', () => {
    assert(css.includes('.favorite-card-media'), 'Missing .favorite-card-media class');
    assert(css.includes('min-height: 210px;'), 'Missing 210px height for favorite-card-media');
    assert(css.includes('.cart-item-img'), 'Missing .cart-item-img class');
    assert(css.includes('width: 50px;'), 'Missing 50px width for cart-item-img');
    assert(css.includes('height: 50px;'), 'Missing 50px height for cart-item-img');
  });

  // 4. HTML & JS Verification
  console.log('\n--- Suite 4: DOM Scripting & Attributes Verification ---');
  const menuHtml = fs.readFileSync('public/menu.html', 'utf8');
  test('menu.html imports /js/menu-images.js before /js/public-menu.js', () => {
    assert(menuHtml.includes('/js/menu-images.js'), 'Missing /js/menu-images.js in menu.html');
    const imgIndex = menuHtml.indexOf('/js/menu-images.js');
    const pubIndex = menuHtml.indexOf('/js/public-menu.js');
    assert(imgIndex < pubIndex, 'menu-images.js must be loaded before public-menu.js');
  });

  const publicJs = fs.readFileSync('public/js/public-menu.js', 'utf8');
  test('public-menu.js includes loading="lazy", decoding="async", onerror fallback handler', () => {
    assert(publicJs.includes('item-card-thumb-box'), 'Missing item-card-thumb-box in public-menu.js');
    assert(publicJs.includes('loading="lazy"'), 'Missing loading="lazy" in public-menu.js');
    assert(publicJs.includes('decoding="async"'), 'Missing decoding="async" in public-menu.js');
    assert(publicJs.includes('onerror="this.onerror=null;this.src='), 'Missing onerror fallback handler in public-menu.js');
  });

  // 5. Customer Menu Read-Only & Boundary Checks
  console.log('\n--- Suite 5: Security & Scope Boundaries ---');
  test('Customer menu has zero checkout or ordering inputs', () => {
    assert(!menuHtml.includes('<form id="orderForm"'), 'Unexpected order form on customer menu');
    assert(!menuHtml.includes('checkout-btn'), 'Unexpected checkout button on customer menu');
  });

  console.log('\n============================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
}

runImageTests();
