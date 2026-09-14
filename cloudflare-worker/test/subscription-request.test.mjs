import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

globalThis.crypto ||= webcrypto;

function privateKeyPem(pkcs8) {
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----`;
}

test('subscription request validates and stores an anonymous request idempotently', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const root = { subscription_plans: { small: { enabled: true, nameAr: 'صغير', totalUses: 8, durationDays: 30, price: 40000 } }, subscription_requests: {} };
  const originalFetch = globalThis.fetch;
  let putCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'fixture-token', expires_in: 3600 }), { status: 200 });
    if (address === 'https://fixture.firebaseio.test/subscription_plans/small.json') return new Response(JSON.stringify(root.subscription_plans.small), { status: 200 });
    const requestMatch = address.match(/^https:\/\/fixture\.firebaseio\.test\/subscription_requests\/([^/]+)\.json$/);
    if (requestMatch && (options.method || 'GET') === 'GET') return new Response(JSON.stringify(root.subscription_requests[requestMatch[1]] ?? null), { status: 200 });
    if (requestMatch && options.method === 'PUT') { putCount += 1; root.subscription_requests[requestMatch[1]] = JSON.parse(options.body); return new Response(JSON.stringify(root.subscription_requests[requestMatch[1]]), { status: 200 }); }
    throw new Error(`Unexpected fixture request: ${address}`);
  };
  const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyPem(privatePkcs8) };
  try {
    const makeRequest = body => new Request('https://worker.test/api/subscription/request', { method: 'POST', headers: { Origin: 'https://101coffees.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const first = await handleLoyaltyRoutes(makeRequest({ requestId: 'request-fixture-1', name: 'عميل اختبار', phone: '07701234567', planId: 'small' }), env, new URL('https://worker.test/api/subscription/request'));
    const firstPayload = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstPayload.ok, true);
    assert.equal(firstPayload.request.phone, '9647701234567');
    assert.equal(firstPayload.request.status, 'pending');
    assert.equal(root.subscription_requests['request-fixture-1'].paymentStatus, 'pending');
    const replay = await handleLoyaltyRoutes(makeRequest({ requestId: 'request-fixture-1', name: 'عميل اختبار', phone: '+9647701234567', planId: 'small' }), env, new URL('https://worker.test/api/subscription/request'));
    const replayPayload = await replay.json();
    assert.equal(replayPayload.duplicate, true);
    assert.equal(putCount, 1);
    const invalid = await handleLoyaltyRoutes(makeRequest({ requestId: 'request-fixture-2', name: 'x', phone: '123', planId: 'small' }), env, new URL('https://worker.test/api/subscription/request'));
    assert.equal(invalid.status, 400);
  } finally { globalThis.fetch = originalFetch; }
});
