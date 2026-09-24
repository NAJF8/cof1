import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = await readFile(join(root, 'index.html'), 'utf8');
const formMatches = index.match(/<form[^>]+id=["']membershipLoginForm["'][^>]*>/gi) || [];
assert.equal(formMatches.length, 1, 'membership login form must exist exactly once');
assert.match(formMatches[0], /onsubmit=["']window\.handleMembershipLogin\(event\)["']/);
assert.equal((index.match(/membershipLoginForm[^\n]*addEventListener\(['"]submit/gi) || []).length, 0, 'login form must not have a second submit listener');
assert.match(index, /let isLoyaltyLoginInProgress = false;/);
assert.match(index, /if \(isLoyaltyLoginInProgress\) return;/);
assert.match(index, /isLoyaltyLoginInProgress = false;[\s\S]*?finally/);
assert.match(index, /console\.warn\('\[LOYALTY_PIN_FAILURE\]'/);
assert.doesNotMatch(index, /تعذر تسجيل الدخول \(\:\)، حاول مرة أخرى/);
assert.match(index, /id=["']loyaltyErrorActions["']/);
assert.match(index, /id=["']loyaltyErrorLogout["']/);
assert.match(index, /id=["']loyaltyErrorLogin["']/);
assert.match(index, /window\.returnToLoyaltyLogin/);
assert.match(index, /loyaltyProfileRetryInFlight/);
assert.match(index, /await auth\.signOut\(\)/);
assert.match(index, /Your rewards balance is temporarily unavailable until the account loads\./);

const inlineScripts = [...index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .filter(script => script.trim());
assert.ok(inlineScripts.length > 0, 'index.html must contain inline application code');
for (const script of inlineScripts) new vm.Script(script);

const helperStart = index.indexOf('function withLoyaltyTimeout');
const helperEnd = index.indexOf('async function callLoyaltySecurity', helperStart);
const start = index.indexOf('window.handleMembershipLogin = async function(event) {');
const end = index.indexOf('window.handleCardAuthAction', start);
assert.ok(helperStart >= 0 && helperEnd > helperStart && start >= 0 && end > start, 'membership login timeout and handler must be extractable');
const handlerSource = `const LOYALTY_REQUEST_TIMEOUT_MS = 20;\n${index.slice(helperStart, helperEnd)}\n${index.slice(start, end)}`;

function harness(callLoyaltySecurity, signInWithCustomToken = async () => {}) {
  const button = { disabled: false, textContent: 'تسجيل الدخول' };
  const message = { textContent: '' };
  const form = { reset() { this.resetCount = (this.resetCount || 0) + 1; } };
  const logs = [];
  const context = {
    window: {},
    isLoyaltyLoginInProgress: false,
    loyaltyLoginRequested: false,
    auth: { signInWithCustomToken },
    callLoyaltySecurity,
    setTimeout,
    clearTimeout,
    console: { log(...args) { logs.push(args); }, warn() {}, error() {} },
    document: { getElementById(id) { return ({ membershipLoginId: { value: '101-1' }, membershipLoginPin: { value: '1234' }, loyaltyLoginError: message, membershipLoginSubmit: button, loyaltyLoginModal: { classList: { remove() {} } }, membershipLoginForm: form })[id] || null; } }
  };
  vm.runInNewContext(`${handlerSource}\nthis.handler = window.handleMembershipLogin;`, context);
  return { handler: context.handler, button, message, form, logs };
}

let resolvePending;
let calls = 0;
const duplicate = harness(() => { calls += 1; return new Promise(resolve => { resolvePending = resolve; }); });
const first = duplicate.handler({ preventDefault() {}, target: duplicate.form });
const second = duplicate.handler({ preventDefault() {}, target: duplicate.form });
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 1, `concurrent submits must produce one request (${JSON.stringify(duplicate.logs)})`);
resolvePending({ data: { token: 'fixture-token' } });
await Promise.all([first, second]);
assert.equal(duplicate.button.disabled, false, 'button must be re-enabled after success');

let retryCalls = 0;
const retry = harness(async () => {
  retryCalls += 1;
  if (retryCalls === 1) throw Object.assign(new Error('network fixture'), { code: 'network-error' });
  return { data: { token: 'fixture-token' } };
});
await retry.handler({ preventDefault() {}, target: retry.form });
await retry.handler({ preventDefault() {}, target: retry.form });
assert.equal(retryCalls, 2, 'a failed request must allow one later retry');
assert.equal(retry.button.disabled, false, 'button must be re-enabled after network failure');

let signInCalls = 0;
const missingToken = harness(async () => ({ data: {} }), async () => { signInCalls += 1; });
await missingToken.handler({ preventDefault() {}, target: missingToken.form });
assert.equal(signInCalls, 0, 'missing custom token must not call Firebase Auth');
assert.equal(missingToken.button.disabled, false);

const authFailure = harness(async () => ({ data: { token: 'fixture-token' } }), async () => {
  throw Object.assign(new Error('auth fixture'), { code: 'auth/invalid-custom-token' });
});
await authFailure.handler({ preventDefault() {}, target: authFailure.form });
assert.equal(authFailure.button.disabled, false, 'button must be re-enabled after Firebase Auth failure');

const authTimeout = harness(async () => ({ data: { token: 'fixture-token' } }), () => new Promise(() => {}));
await authTimeout.handler({ preventDefault() {}, target: authTimeout.form });
assert.equal(authTimeout.button.disabled, false, 'button must be re-enabled after Firebase Auth timeout');

console.log('frontend loyalty login regression checks: PASS');
