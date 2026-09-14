import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

globalThis.crypto ||= webcrypto;

function base64Url(value) {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64url');
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function privateKeyPem(pkcs8) {
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----`;
}

async function signedToken(pair, claims) {
  const header = base64Url({ alg: 'RS256', kid: 'subscription-test-key', typ: 'JWT' });
  const payload = base64Url(claims);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

test('activation succeeds when request has no uid', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = await signedToken(pair, { sub: 'admin-test-uid', aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', exp: nowSeconds + 300, iat: nowSeconds, email: 'admin@example.test', email_verified: true });
  const root = {
    subscription_requests: { 'request-zero-state': { requestId: 'request-zero-state', status: 'pending', paymentStatus: 'pending', planId: 'large', planName: 'Large', name: 'Zero State Customer', phone: '07701234567', createdAt: 1 } },
    subscription_plans: { large: { enabled: true, nameAr: 'Large', totalUses: 20, durationDays: 30, price: 80000 } },
    subscription_customers: {}, subscriptions: {}, subscription_credentials: {}, subscription_counter: 0
  };
  let rootPut = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'subscription-test-key', alg: 'RS256', use: 'sig' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (address === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'local-fixture-token', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (address === 'https://fixture.firebaseio.test/admins/admin-test-uid.json') return new Response(JSON.stringify({ role: 'admin', status: 'active' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (address === 'https://fixture.firebaseio.test/.json' && (options.method || 'GET') === 'GET') return new Response(JSON.stringify(root), { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"fixture-etag"' } });
    if (address === 'https://fixture.firebaseio.test/.json' && options.method === 'PUT') { rootPut = JSON.parse(options.body); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }); }
    throw new Error(`Unexpected local fixture request: ${address}`);
  };
  try {
    const request = new Request('https://worker.test/api/admin/subscription/activate', { method: 'POST', headers: { Origin: 'https://najf8.github.io', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'request-zero-state', phone: '07701234567' }) });
    const env = { ALLOWED_ORIGINS: 'https://najf8.github.io', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.iam.gserviceaccount.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyPem(privatePkcs8), LOYALTY_PIN_PEPPER: 'local-test-pepper' };
    const response = await handleLoyaltyRoutes(request, env, new URL(request.url));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.clubNumber, 'CLUB-101-1');
    assert.ok(rootPut);
    assert.equal(rootPut.subscription_counter, 1);
    assert.equal(rootPut.subscription_requests['request-zero-state'].status, 'activated');
    assert.equal(rootPut.subscription_requests['request-zero-state'].paymentStatus, 'paid');
    assert.ok(rootPut.subscription_customers['CLUB-101-1']);
    assert.ok(rootPut.subscriptions['sub_request-zero-state']);
    assert.ok(rootPut.subscription_credentials['CLUB-101-1']);
    assert.equal(rootPut.subscription_account_index, undefined);
    assert.equal(rootPut.subscription_customers['CLUB-101-1'].pin, undefined);
    assert.equal(rootPut.subscriptions['sub_request-zero-state'].pin, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
