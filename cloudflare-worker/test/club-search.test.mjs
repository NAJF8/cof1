import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleLoyaltyRoutes, clubSearchQuery, normalizeIraqiPhone, safeClubCustomer } from '../src/loyalty-routes.js';

globalThis.crypto ||= webcrypto;
const encoder = new TextEncoder();
const base64url = bytes => Buffer.from(bytes).toString('base64url');
const jsonPart = value => base64url(encoder.encode(JSON.stringify(value)));
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
publicJwk.kid = 'club-test-key';
const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
const privatePem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateKey).toString('base64')}\n-----END PRIVATE KEY-----`;

let role = 'manager';
let writes = 0;
const customer = { status: 'active', clubNumber: 'CLUB-101-14', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
const database = {
  'admins/staff-uid': () => ({ role, status: 'active', permissions: {} }),
  'subscription_customers/CLUB-101-14': () => customer,
  subscription_customers: () => ({ 'CLUB-101-14': customer }),
  subscriptions: () => ({ subscriptionA: { clubNumber: 'CLUB-101-14', status: 'active', planName: 'Test', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } })
};
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('service_accounts/v1/jwk')) return Response.json({ keys: [publicJwk] });
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-service-token', expires_in: 3600 });
  if (url.includes('coffee-30fa7-default-rtdb.firebaseio.com')) {
    if (options.method && options.method !== 'GET') { writes += 1; return Response.json({ error: 'write not expected' }, { status: 500 }); }
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '');
    return Response.json(database[path]?.() ?? null);
  }
  throw new Error(`unexpected fetch ${url}`);
};
async function idToken() {
  const header = jsonPart({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid });
  const payload = jsonPart({ sub: 'staff-uid', aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600, email: 'staff@example.com', email_verified: true });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(signature)}`;
}
const env = { ALLOWED_ORIGINS: 'https://najf8.github.io', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privatePem, FIREBASE_DATABASE_URL: 'https://coffee-30fa7-default-rtdb.firebaseio.com' };
const request = async (query, token) => { const auth = token === null ? null : (token || await idToken()); return handleLoyaltyRoutes(new Request('https://worker.test/api/admin/club/search', { method: 'POST', headers: { Origin: 'https://najf8.github.io', 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify({ query }) }), env, new URL('https://worker.test/api/admin/club/search')); };
const json = async response => ({ status: response.status, body: await response.json() });

assert.equal(normalizeIraqiPhone('07827337942'), '9647827337942');
assert.equal(normalizeIraqiPhone('+9647827337942'), '9647827337942');
assert.deepEqual(clubSearchQuery('CLUB-101-14'), { type: 'club', value: 'CLUB-101-14' });
assert.equal(safeClubCustomer('CLUB-101-14', customer, null, null).pin, undefined);

for (const query of ['CLUB-101-14', '07827337942', '+9647827337942']) {
  const result = await json(await request(query));
  assert.equal(result.status, 200);
  assert.equal(result.body.found, true);
  assert.equal(result.body.customer.customerId, 'CLUB-101-14');
  assert.equal(result.body.customer.status, 'active');
  assert.equal(result.body.customer.activeSubscriptionId, null);
  assert.equal(result.body.customer.pin, undefined);
}
const missing = await json(await request('CLUB-101-999'));
assert.equal(missing.status, 404);
assert.equal(missing.body.error, 'CLUB_MEMBER_NOT_FOUND');
const noAuth = await json(await request('CLUB-101-14', null));
assert.equal(noAuth.status, 401);
assert.equal(noAuth.body.error, 'AUTH_REQUIRED');
role = 'viewer';
const forbidden = await json(await request('CLUB-101-14'));
assert.equal(forbidden.status, 403);
assert.equal(forbidden.body.error, 'FORBIDDEN');
assert.equal(writes, 0);
const loyaltySource = await readFile(new URL('../../loyalty.html', import.meta.url), 'utf8');
const searchFlow = loyaltySource.slice(loyaltySource.indexOf('async function searchClubCust'), loyaltySource.indexOf('async function redeemClubDrink'));
assert.equal((searchFlow.match(/db\.ref\(['"]subscriptions['"]\)\.once\(['"]value['"]\)/g) || []).length, 0);
console.log('club search endpoint fixtures: PASS');
