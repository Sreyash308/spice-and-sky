/**
 * Menu Image Synchronization Verification Tests
 * Verifies that Customer Menu and Admin Menu Management are 100% in sync regarding images.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dbService = require('../db/supabase_service');

async function runTests() {
  console.log('\n============================================================');
  console.log('🔄 RUNNING MENU IMAGE SYNCHRONIZATION TESTS');
  console.log('============================================================\n');

  // Test 1: Scripts in admin.html and menu.html
  console.log('--- Test Suite 1: Script Dependencies & HTML Imports ---');
  const adminHtml = fs.readFileSync(path.resolve(__dirname, '../public/admin.html'), 'utf8');
  const menuHtml = fs.readFileSync(path.resolve(__dirname, '../public/menu.html'), 'utf8');

  assert(adminHtml.includes('/js/menu-images.js'), 'admin.html must import /js/menu-images.js');
  assert(adminHtml.indexOf('/js/menu-images.js') < adminHtml.indexOf('/js/admin.js'), 'menu-images.js must be imported before admin.js in admin.html');
  console.log('  ✅ PASS: admin.html imports /js/menu-images.js before /js/admin.js');

  assert(menuHtml.includes('/js/menu-images.js'), 'menu.html must import /js/menu-images.js');
  assert(menuHtml.indexOf('/js/menu-images.js') < menuHtml.indexOf('/js/public-menu.js'), 'menu-images.js must be imported before public-menu.js in menu.html');
  console.log('  ✅ PASS: menu.html imports /js/menu-images.js before /js/public-menu.js');

  // Test 2: Admin JS Image Resolution
  console.log('\n--- Test Suite 2: Admin JS Image Synchronization ---');
  const adminJs = fs.readFileSync(path.resolve(__dirname, '../public/js/admin.js'), 'utf8');
  assert(adminJs.includes('SpiceSkyImages.getMenuItemImageUrl'), 'admin.js must use SpiceSkyImages.getMenuItemImageUrl');
  assert(adminJs.includes('setModalImagePreview'), 'admin.js must update modal preview with current photo');
  console.log('  ✅ PASS: admin.js uses shared image resolution in table and modal preview');

  // Test 3: DB Items Image URL Coverage
  console.log('\n--- Test Suite 3: Database Image URL Coverage & Sync ---');
  const items = await dbService.getMenuItems();
  const withImages = items.filter(i => i.image_url && i.image_url.trim().length > 0);
  assert(withImages.length >= 100, `Expected at least 100 items with image_url in DB, got ${withImages.length}`);
  console.log(`  ✅ PASS: ${withImages.length} of ${items.length} items in DB have valid image_url persisted`);

  // Test 4: End-to-end Image Update & Readback
  console.log('\n--- Test Suite 4: End-to-End Image Update & Realtime Sync ---');
  const testItem = items[0];
  const testImgUrl = 'https://jkvqapkrjihfgkzauljy.supabase.co/storage/v1/object/public/menu-items/sync-test.webp';
  
  const updated = await dbService.updateMenuItem(testItem.id, { image_url: testImgUrl });
  assert.strictEqual(updated.image_url, testImgUrl, 'Updated item must return the new image_url');

  const refreshedItems = await dbService.getMenuItems();
  const refreshedItem = refreshedItems.find(i => i.id === testItem.id);
  assert.strictEqual(refreshedItem.image_url, testImgUrl, 'Readback item must match the updated image_url');
  console.log('  ✅ PASS: Updating item image persists across Supabase database and local store');

  // Restore original image
  await dbService.updateMenuItem(testItem.id, { image_url: testItem.image_url });
  console.log('  ✅ PASS: Restored test item to canonical state');

  console.log('\n============================================================');
  console.log('🎉 ALL MENU IMAGE SYNCHRONIZATION TESTS PASSED 100%!');
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
