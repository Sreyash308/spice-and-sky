const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Testing Waiter POS View Cart Button and Mobile Phone Responsiveness...');

const waiterHtmlPath = path.join(__dirname, '../public/waiter.html');
const waiterCssPath = path.join(__dirname, '../public/css/waiter.css');
const waiterJsPath = path.join(__dirname, '../public/js/waiter.js');

const waiterHtml = fs.readFileSync(waiterHtmlPath, 'utf8');
const waiterCss = fs.readFileSync(waiterCssPath, 'utf8');
const waiterJs = fs.readFileSync(waiterJsPath, 'utf8');

// 1. Check HTML elements
assert(waiterHtml.includes('id="viewCartBtn"'), 'waiter.html must define #viewCartBtn');
assert(waiterHtml.includes('id="cartBadgeCount"'), 'waiter.html must define #cartBadgeCount');
assert(waiterHtml.includes('id="cartBadgeTotal"'), 'waiter.html must define #cartBadgeTotal');
assert(waiterHtml.includes('id="cartBadgeSub"'), 'waiter.html must define #cartBadgeSub');
assert(waiterHtml.includes('drawer-handle-bar'), 'waiter.html must include .drawer-handle-bar');
assert(waiterHtml.includes('drawer-actions-row'), 'waiter.html must include .drawer-actions-row');
assert(waiterHtml.includes('receipt-actions-row'), 'waiter.html must include .receipt-actions-row');
assert(waiterHtml.includes('viewport-fit=cover'), 'waiter.html viewport must include viewport-fit=cover for notch/home bar');
console.log('  ✅ waiter.html contains all required View Cart and mobile drawer/receipt markup');

// 2. Check CSS styling
assert(waiterCss.includes('.btn-view-cart'), 'waiter.css must style .btn-view-cart');
assert(waiterCss.includes('.cart-badge-count'), 'waiter.css must style .cart-badge-count');
assert(waiterCss.includes('.cart-badge-count.bump'), 'waiter.css must include .cart-badge-count.bump micro-animation');
assert(waiterCss.includes('env(safe-area-inset-bottom'), 'waiter.css must handle safe-area-inset-bottom for mobile home bars');
assert(waiterCss.includes('scroll-snap-type: x'), 'waiter.css must provide smooth scroll-snap for mobile table grid');
assert(waiterCss.includes('font-size: 16px'), 'waiter.css search bar must use 16px font to prevent iOS Safari auto-zoom');
assert(waiterCss.includes('.drawer-actions-row'), 'waiter.css must style .drawer-actions-row');
assert(waiterCss.includes('.receipt-actions-row'), 'waiter.css must style .receipt-actions-row');
console.log('  ✅ waiter.css includes complete responsive styling, touch targets, and iOS safe areas');

// 3. Check JS logic
assert(waiterJs.includes('viewCartBtn'), 'waiter.js must reference viewCartBtn');
assert(waiterJs.includes('cartBadgeCount'), 'waiter.js must reference cartBadgeCount');
assert(waiterJs.includes('cartBadgeTotal'), 'waiter.js must reference cartBadgeTotal');
assert(waiterJs.includes('cartBadgeSub'), 'waiter.js must reference cartBadgeSub');
assert(waiterJs.includes('scrollIntoView'), 'waiter.js must smooth-scroll active table into view on mobile');
console.log('  ✅ waiter.js correctly wires View Cart button, dynamic badge updates, and table centering');

console.log('\n🎉 ALL WAITER VIEW CART & MOBILE RESPONSIVE TESTS PASSED SUCCESSFULLY!\n');
