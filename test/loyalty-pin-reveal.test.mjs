import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(join(root, 'index.html'), 'utf8');
const start = source.indexOf('        function hasPinMemory()');
const end = source.indexOf('        function loyaltyErrorMessage', start);
assert.ok(start >= 0 && end > start, 'PIN reveal helpers must remain in the customer bundle');
const helperSource = source.slice(start, end);

const elements = new Map([
  ['#summaryPinToggle', { hidden: true, disabled: false, textContent: '🐵' }],
  ['.btn-pin-toggle', { hidden: true, disabled: false, textContent: '🐵' }],
  ['#cardDisplayPin', { textContent: '••••' }],
  ['#summaryDisplayPin', { textContent: '••••' }]
]);
const document = {
  getElementById(id) { return elements.get(`#${id}`) || null; },
  querySelector(selector) { return elements.get(selector) || null; }
};
const context = vm.createContext({
  document,
  window: {},
  auth: { currentUser: { uid: 'uid-101-1' } },
  currentFirebaseUser: { uid: 'uid-101-1' },
  loyaltyCustomer: { membershipNumber: '101-1' },
  setTimeout(callback, delay) { context.timer = callback; context.timerDelay = delay; return 1; },
  clearTimeout() {}
});
vm.runInContext(`let userPinRaw = ''; let pinMemoryMembership = ''; let pinMemoryUid = ''; let pinRevealAvailable = false; let isPinRevealed = false; let pinRevealTimer = null; ${helperSource}`, context);

vm.runInContext("rememberPinAfterAuth('5678', '101-1')", context);
assert.equal(elements.get('.btn-pin-toggle').hidden, false, 'successful PIN login shows the detail-card monkey');
assert.equal(elements.get('#summaryPinToggle').hidden, false, 'successful PIN login shows the summary monkey');

// The profile redraw must not lose the in-memory PIN or hide the controls.
vm.runInContext("syncPinMemoryForAccount('101-1')", context);
assert.equal(elements.get('.btn-pin-toggle').hidden, false, 'profile redraw keeps the detail-card monkey visible');
assert.equal(elements.get('#summaryPinToggle').hidden, false, 'profile redraw keeps the summary monkey visible');

vm.runInContext('window.togglePinVisibility()', context);
assert.equal(elements.get('#cardDisplayPin').textContent, '5678');
assert.equal(elements.get('#summaryDisplayPin').textContent, '5678');
assert.equal(context.timerDelay, 15000, 'revealed PIN is scheduled to hide after 15 seconds');
context.timer();
assert.equal(elements.get('#cardDisplayPin').textContent, '••••');
assert.equal(elements.get('#summaryDisplayPin').textContent, '••••');

vm.runInContext('window.togglePinVisibility()', context);
vm.runInContext('window.togglePinVisibility()', context);
assert.equal(elements.get('#cardDisplayPin').textContent, '••••');
assert.equal(elements.get('#summaryDisplayPin').textContent, '••••');

assert.doesNotMatch(helperSource, /localStorage|sessionStorage|document\.cookie/);
console.log('loyalty PIN reveal UI behavior: PASS');
