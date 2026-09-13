const fs = require('fs');
const path = require('path');
const assert = require('assert');

function testUIElements() {
  console.log('--- VALIDATING PAYMENT UI ELEMENTS IN HTML & JS ---');

  // 1. Check waiter.html
  const waiterHtml = fs.readFileSync(path.join(__dirname, '../public/waiter.html'), 'utf8');
  assert(waiterHtml.includes('id="paymentModal"'), 'waiter.html must have paymentModal');
  assert(waiterHtml.includes('id="payModeCashBtn"'), 'waiter.html must have payModeCashBtn');
  assert(waiterHtml.includes('id="payModeOnlineBtn"'), 'waiter.html must have payModeOnlineBtn');
  assert(waiterHtml.includes('id="payModeSplitBtn"'), 'waiter.html must have payModeSplitBtn');
  assert(waiterHtml.includes('id="splitPaymentSection"'), 'waiter.html must have splitPaymentSection');
  assert(waiterHtml.includes('id="splitCashInput"'), 'waiter.html must have splitCashInput');
  assert(waiterHtml.includes('id="splitOnlineInput"'), 'waiter.html must have splitOnlineInput');
  assert(waiterHtml.includes('id="splitBalanceIndicator"'), 'waiter.html must have splitBalanceIndicator');
  assert(waiterHtml.includes('id="confirmPaymentBtn"'), 'waiter.html must have confirmPaymentBtn');
  assert(waiterHtml.includes('id="billPaymentBox"'), 'waiter.html printableReceipt must have billPaymentBox');
  assert(waiterHtml.includes('id="billPaymentModeText"'), 'waiter.html must have billPaymentModeText');
  assert(waiterHtml.includes('id="billCashRow"'), 'waiter.html must have billCashRow');
  assert(waiterHtml.includes('id="billCashPaidText"'), 'waiter.html must have billCashPaidText');
  assert(waiterHtml.includes('id="billOnlineRow"'), 'waiter.html must have billOnlineRow');
  assert(waiterHtml.includes('id="billOnlinePaidText"'), 'waiter.html must have billOnlinePaidText');
  console.log('✅ waiter.html contains all payment modal and printable receipt payment breakdown elements.');

  // 2. Check admin.html
  const adminHtml = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert(adminHtml.includes('id="kpiTodayCashRev"'), 'admin.html must have kpiTodayCashRev');
  assert(adminHtml.includes('id="kpiTodayOnlineRev"'), 'admin.html must have kpiTodayOnlineRev');
  assert(adminHtml.includes('id="analyticsDailyTableBody"'), 'admin.html must have analyticsDailyTableBody');
  assert(adminHtml.includes('Daily Sales &amp; Payment Analysis'), 'admin.html must have daily analysis header');
  assert(adminHtml.includes('Payment Mode'), 'admin.html orders table must have Payment Mode column');
  assert(adminHtml.includes('id="adminBillPaymentBox"'), 'admin.html receipt modal must have adminBillPaymentBox');
  assert(adminHtml.includes('id="adminBillPaymentModeText"'), 'admin.html must have adminBillPaymentModeText');
  assert(adminHtml.includes('id="adminBillCashRow"'), 'admin.html must have adminBillCashRow');
  assert(adminHtml.includes('id="adminBillCashPaidText"'), 'admin.html must have adminBillCashPaidText');
  assert(adminHtml.includes('id="adminBillOnlineRow"'), 'admin.html must have adminBillOnlineRow');
  assert(adminHtml.includes('id="adminBillOnlinePaidText"'), 'admin.html must have adminBillOnlinePaidText');
  console.log('✅ admin.html contains Cash/Online KPI cards, Daily Analysis table, and Receipt payment box.');

  // 3. Check waiter.js
  const waiterJs = fs.readFileSync(path.join(__dirname, '../public/js/waiter.js'), 'utf8');
  assert(waiterJs.includes('openPaymentModal'), 'waiter.js must have openPaymentModal function');
  assert(waiterJs.includes('setPaymentMode'), 'waiter.js must have setPaymentMode function');
  assert(waiterJs.includes('updateSplitBalance'), 'waiter.js must have updateSplitBalance function');
  assert(waiterJs.includes('billPaymentBox'), 'waiter.js must populate billPaymentBox');
  console.log('✅ waiter.js correctly wires payment modal interactions and receipt details.');

  // 4. Check admin.js
  const adminJs = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
  assert(adminJs.includes('kpiTodayCashRev'), 'admin.js must hydrate kpiTodayCashRev');
  assert(adminJs.includes('kpiTodayOnlineRev'), 'admin.js must hydrate kpiTodayOnlineRev');
  assert(adminJs.includes('formatPaymentPill'), 'admin.js must have formatPaymentPill helper');
  assert(adminJs.includes('analyticsDailyTableBody'), 'admin.js must hydrate analyticsDailyTableBody');
  assert(adminJs.includes('adminBillPaymentBox'), 'admin.js must hydrate adminBillPaymentBox');
  console.log('✅ admin.js hydrates Cash & Online KPIs, Order payment pills, and Daily payment analytics.');

  console.log('\n🎉 ALL STATIC UI & ELEMENT VALIDATION CHECKS PASSED!');
}

testUIElements();
