import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { serviceAccountToken, firebaseAdminConditionalPut, firebaseAdminConditionalPatch, firebasePayloadDiagnostics } from '../src/firebase-admin.js';

globalThis.crypto ??= webcrypto;
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
let binary = ''; for (const byte of pkcs8) binary += String.fromCharCode(byte);
const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (_url, options) => { calls += 1; const assertion = new URLSearchParams(options.body).get('assertion'); assert.equal(assertion.split('.').length, 3); return new Response(JSON.stringify({ access_token: 'fixture-access-token', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
const env = { FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.iam.gserviceaccount.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey };
assert.equal(await serviceAccountToken(env), 'fixture-access-token');
assert.equal(await serviceAccountToken(env), 'fixture-access-token');
assert.equal(calls, 1);
globalThis.fetch = originalFetch;
let conditionalRequest;
globalThis.fetch = async (url, options) => { conditionalRequest = { url: String(url), options }; return new Response(JSON.stringify({ pin: '1234' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
assert.deepEqual(await firebaseAdminConditionalPut(env, 'loyalty_customers/101-15', { pin: '1234' }, 'fixture-etag'), { pin: '1234' });
assert.equal(conditionalRequest.options.method, 'PUT');
assert.equal(conditionalRequest.options.headers['If-Match'], 'fixture-etag');
assert.match(conditionalRequest.url, /loyalty_customers\/101-15\.json$/);
globalThis.fetch = originalFetch;
const diagnosticPayload = {
  'subscription_requests/req': { status: 'activated', price: 80000 },
  'subscription_customers/CLUB-101-1': { remainingUses: 20 },
  'subscriptions/sub_req': { totalUses: 20 },
  subscription_counter: 1,
  'subscription_pin_index/1234': 'CLUB-101-1',
  'subscription_activation_logs/req': { createdAt: 1 }
};
const diagnosticReport = firebasePayloadDiagnostics(diagnosticPayload);
assert.equal(diagnosticReport.totalUpdatePaths, 6);
assert.deepEqual(diagnosticReport.counts, { undefined: 0, nan: 0, infinity: 0, bigint: 0, dateObjects: 0, otherInvalidTypes: 0 });
assert.equal(diagnosticReport.serialization.status, 'PASS');
assert.equal(diagnosticReport.groups.A_request_updates.totalUpdatePaths, 1);
const invalidReport = firebasePayloadDiagnostics({ 'a/b': 1, 'a/b/c': 2, 'bad#key': undefined, badNumber: NaN, badInfinity: Infinity, badBigInt: 1n, badDate: new Date(0), badFunction: () => {}, badSymbol: Symbol('x') });
assert.equal(invalidReport.invalidPaths.length, 1);
assert.equal(invalidReport.parentChildCollisions.length, 1);
assert.deepEqual(invalidReport.counts, { undefined: 1, nan: 1, infinity: 1, bigint: 1, dateObjects: 1, otherInvalidTypes: 2 });
assert.equal(invalidReport.serialization.status, 'FAIL');
let patchFailureLog;
const originalConsoleError = console.error;
console.error = value => { patchFailureLog = value; };
globalThis.fetch = async (url, options) => {
  if (String(url).includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'fixture-access-token', expires_in: 3600 }), { status: 200 });
  assert.equal(options.method, 'PATCH');
  return new Response('Invalid data; fixture body', { status: 400 });
};
await assert.rejects(() => firebaseAdminConditionalPatch(env, { 'a/b': 1 }, 'fixture-etag', 0, { stage: 'ATOMIC_PATCH', requestId: 'fixture-request' }), /FIREBASE_400/);
console.error = originalConsoleError;
assert.deepEqual(patchFailureLog, { tag: 'FIREBASE_ROOT_PATCH_FAILED', status: 400, firebaseErrorBody: 'Invalid data; fixture body', stage: 'ATOMIC_PATCH', requestId: 'fixture-request' });
globalThis.fetch = originalFetch;
console.log('service-account JWT/OAuth fixture: PASS');
