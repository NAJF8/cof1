import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { serviceAccountToken, firebaseAdminConditionalPut, firebaseAdminAtomicPatch, firebasePayloadDiagnostics } from '../src/firebase-admin.js';

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
globalThis.fetch = originalFetch;
const runMerge = async (root, updates) => {
  let written;
  const result = await firebaseAdminAtomicPatch({}, () => ({ updates, result: 'ok' }), {
    read: async () => ({ data: JSON.parse(JSON.stringify(root)), etag: 'fixture-etag' }),
    write: async (_env, merged, etag) => { written = { merged, etag }; }
  });
  assert.equal(result, 'ok');
  return written;
};
assert.deepEqual((await runMerge({ a: { x: 1 }, b: { y: 2 } }, { 'a/x': 5 })).merged, { a: { x: 5 }, b: { y: 2 } });
assert.deepEqual((await runMerge({ a: { b: { c: 1 } } }, { 'a/b/c': 2 })).merged, { a: { b: { c: 2 } } });
assert.deepEqual((await runMerge({ a: {} }, { 'a/new/path': 3 })).merged, { a: { new: { path: 3 } } });
assert.deepEqual((await runMerge({ a: { x: 1, y: 2 }, b: 3 }, { 'a/x': null })).merged, { a: { y: 2 }, b: 3 });
assert.deepEqual((await runMerge({ a: [1, 2], keep: true }, { 'a/1': 9 })).merged, { a: [1, 9], keep: true });
let atomicCalls = [];
globalThis.fetch = async (_url, options) => {
  atomicCalls.push({ method: options.method || 'GET', headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined });
  if (atomicCalls.length === 1) return new Response(JSON.stringify({ a: { x: 1 }, untouched: true }), { status: 200, headers: { ETag: '"one"' } });
  if (atomicCalls.length === 2) return new Response('conflict', { status: 412 });
  if (atomicCalls.length === 3) return new Response(JSON.stringify({ a: { x: 1 }, untouched: true }), { status: 200, headers: { ETag: '"two"' } });
  return new Response('{}', { status: 200 });
};
await firebaseAdminAtomicPatch(env, root => ({ updates: { 'a/x': root.a.x + 1 }, result: root.a.x + 1 }), { attempts: 2 });
assert.equal(atomicCalls.length, 4);
assert.equal(atomicCalls[0].method, 'GET');
assert.equal(atomicCalls[1].method, 'PATCH');
assert.deepEqual(atomicCalls[1].body, { 'a/x': 2 });
assert.equal(atomicCalls[2].method, 'GET');
assert.equal(atomicCalls[3].method, 'PATCH');
assert.deepEqual(atomicCalls[3].body, { 'a/x': 2 });
let retryReads = 0;
await assert.rejects(() => firebaseAdminAtomicPatch({}, () => ({ updates: { 'a/x': 1 }, result: true }), {
  attempts: 2,
  read: async () => { retryReads += 1; return { data: { a: { x: retryReads } }, etag: String(retryReads) }; },
  write: async () => { throw new Error('FIREBASE_ETAG_CONFLICT'); }
}), /FIREBASE_ETAG_CONFLICT/);
assert.equal(retryReads, 2);
let failedPutCalls = 0;
await assert.rejects(() => firebaseAdminAtomicPatch({}, () => ({ updates: { 'a/x': 1 }, result: true }), {
  read: async () => ({ data: { a: {} }, etag: 'one' }),
  write: async () => { failedPutCalls += 1; throw new Error('FIREBASE_500'); }
}), /FIREBASE_500/);
assert.equal(failedPutCalls, 1);
let oversizedPutCalls = 0;
await assert.rejects(() => firebaseAdminAtomicPatch({}, () => ({ updates: { 'a/x': 1 }, result: true }), {
  maxRootBytes: 5,
  read: async () => ({ data: { a: {} }, etag: 'one' }),
  write: async () => { oversizedPutCalls += 1; }
}), /FIREBASE_ROOT_TOO_LARGE/);
assert.equal(oversizedPutCalls, 0);
globalThis.fetch = originalFetch;
console.log('service-account JWT/OAuth fixture: PASS');
