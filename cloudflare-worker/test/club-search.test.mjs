import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleLoyaltyRoutes, clubSearchQuery, normalizeIraqiPhone, normalizeClubMembership, safeClubCustomer } from '../src/loyalty-routes.js';

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
let allowWrites = false;
let customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
let customerRecords = { 'CLUB-101-6': customer };
let subscriptions = { subscriptionA: { clubNumber: 'CLUB-101-6', status: 'active', planName: 'Test', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } };
const applyRootUpdate = (root, path, value) => {
  const parts = path.split('/').filter(Boolean);
  let target = root;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  if (value === null) delete target[parts.at(-1)];
  else target[parts.at(-1)] = value;
};
const database = {
  'admins/staff-uid': () => ({ role, status: 'active', permissions: {} }),
  'subscription_customers/CLUB-101-6': () => customer,
  subscription_customers: () => customerRecords,
  subscriptions: () => subscriptions
};
const databaseRoot = () => ({ admins: { 'staff-uid': { role, status: 'active', permissions: {} } }, subscription_customers: customerRecords, subscriptions, subscription_pin_index: {} });
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('service_accounts/v1/jwk')) return Response.json({ keys: [publicJwk] });
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-service-token', expires_in: 3600 });
  if (url.includes('coffee-30fa7-default-rtdb.firebaseio.com')) {
    if (options.method && options.method !== 'GET') {
      writes += 1;
      if (!allowWrites) return Response.json({ error: 'write not expected' }, { status: 500 });
      const updates = JSON.parse(options.body || '{}'), root = databaseRoot();
      Object.entries(updates).forEach(([path, value]) => applyRootUpdate(root, path, value));
      if (root.subscriptions) subscriptions = root.subscriptions;
      return Response.json(updates);
    }
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\.json$/, '');
    if (!path) return Response.json(databaseRoot(), { headers: { ETag: 'fixture-etag' } });
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
const post = async (path, payload, token) => { const auth = token === null ? null : (token || await idToken()); return handleLoyaltyRoutes(new Request(`https://worker.test${path}`, { method: 'POST', headers: { Origin: 'https://najf8.github.io', 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(payload) }), env, new URL(`https://worker.test${path}`)); };
const request = async (query, token) => post('/api/admin/club/search', { query }, token);
const json = async response => ({ status: response.status, body: await response.json() });
const phoneFixture = async (records, expectedStatus, expectedClub = null) => {
  customerRecords = records;
  subscriptions = {};
  const result = await json(await request('07827337942'));
  assert.notEqual(result.status, 500);
  assert.equal(result.status, expectedStatus);
  if (expectedClub) assert.equal(result.body.customer.clubNumber, expectedClub);
  return result;
};

assert.equal(normalizeIraqiPhone('07827337942'), '9647827337942');
assert.equal(normalizeIraqiPhone('7827337942'), '9647827337942');
assert.equal(normalizeIraqiPhone('9647827337942'), '9647827337942');
assert.equal(normalizeIraqiPhone('+9647827337942'), '9647827337942');
assert.deepEqual(normalizeClubMembership('101-6'), { displayMembership: '101-6', canonicalClubId: 'CLUB-101-6' });
assert.deepEqual(normalizeClubMembership('CLUB-101-6'), { displayMembership: '101-6', canonicalClubId: 'CLUB-101-6' });
assert.deepEqual(clubSearchQuery('101-6'), { type: 'club', value: 'CLUB-101-6', displayMembership: '101-6', canonicalClubId: 'CLUB-101-6' });
assert.deepEqual(clubSearchQuery('CLUB-101-6'), { type: 'club', value: 'CLUB-101-6', displayMembership: '101-6', canonicalClubId: 'CLUB-101-6' });
assert.equal(safeClubCustomer('CLUB-101-6', customer, null, null).pin, undefined);

await phoneFixture({ normal: { status: 'active', clubNumber: 'CLUB-101-12', name: 'String Phone', phone: '07827337942' } }, 200, '101-12');
await phoneFixture({ numeric: { status: 'active', clubNumber: 'CLUB-101-12', name: 'Number Phone', phone: 7827337942 } }, 200, '101-12');
await phoneFixture({ missing: { status: 'active', clubNumber: 'CLUB-101-12', name: 'Missing Phone' } }, 404);
await phoneFixture({ empty: null }, 404);
await phoneFixture({ malformed: 'not-a-record' }, 404);
await phoneFixture({ malformed: { status: 'active', clubNumber: 'CLUB-101-12', phone: { value: '07827337942' } } }, 404);
await phoneFixture({ unrelatedA: { status: 'active', clubNumber: 'CLUB-101-13', phone: '07811111111' }, unrelatedB: { status: 'inactive', clubNumber: 'CLUB-101-14', phone: '07822222222' } }, 404);
await phoneFixture({ known: { status: 'active', clubNumber: 'CLUB-101-12', name: 'Known 101-12', phone: '+9647827337942' } }, 200, '101-12');
for (const query of ['07827337942', '7827337942', '9647827337942', '+9647827337942']) {
  customerRecords = { known: { status: 'active', clubNumber: 'CLUB-101-12', name: 'Known 101-12', phone: '+9647827337942' } };
  const knownResult = await json(await request(query));
  assert.equal(knownResult.status, 200);
  assert.equal(knownResult.body.found, true);
  assert.equal(knownResult.body.customer.clubNumber, '101-12');
}

customerRecords = {
  activeA: { status: 'active', clubNumber: 'CLUB-101-12', phone: '07827337942' },
  activeB: { status: 'active', clubNumber: 'CLUB-101-13', phone: '07827337942' }
};
const ambiguous = await json(await request('07827337942'));
assert.equal(ambiguous.status, 409);
assert.equal(ambiguous.body.error, 'CLUB_PHONE_AMBIGUOUS');

customerRecords = {
  active: { status: 'active', clubNumber: 'CLUB-101-12', phone: '07827337942' },
  inactive: { status: 'inactive', clubNumber: 'CLUB-101-13', phone: '07827337942' }
};
const activePrecedence = await json(await request('07827337942'));
assert.equal(activePrecedence.status, 200);
assert.equal(activePrecedence.body.customer.clubNumber, '101-12');

customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
customerRecords = { 'CLUB-101-6': customer };
subscriptions = { subscriptionA: { clubNumber: 'CLUB-101-6', status: 'cancelled', planName: 'Historical', remainingUses: 0, totalUses: 10, expiresAt: Date.now() - 86400000 } };
let firstCustomer = null;
for (const query of ['101-6', 'CLUB-101-6', '07827337942', '7827337942', '9647827337942', '+9647827337942']) {
  const result = await json(await request(query));
  assert.equal(result.status, 200);
  assert.equal(result.body.found, true);
  assert.equal(result.body.customer.customerId, 'CLUB-101-6');
  assert.equal(result.body.canonicalClubId, 'CLUB-101-6');
  assert.equal(result.body.customer.canonicalClubId, 'CLUB-101-6');
  assert.equal(result.body.customer.clubNumber, '101-6');
  assert.equal(result.body.customer.status, 'active');
  assert.equal(result.body.isActive, true);
  assert.equal(result.body.customer.isActive, true);
  assert.equal(result.body.customer.activeSubscriptionId, null);
  assert.equal(result.body.customer.subscriptionId, null);
  assert.equal(result.body.subscription.status, 'cancelled');
  assert.equal(result.body.subscriptionRelation, 'historical');
  assert.equal(result.body.customer.pin, undefined);
  firstCustomer ||= result.body.customer;
  assert.deepEqual(result.body.customer, firstCustomer);
}
customer = { status: 'inactive', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
customerRecords = { 'CLUB-101-6': customer };
subscriptions = { subscriptionA: { clubNumber: 'CLUB-101-6', status: 'active', planName: 'Historical', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } };
const inactiveCanonical = await json(await request('CLUB-101-6'));
assert.equal(inactiveCanonical.status, 200);
assert.equal(inactiveCanonical.body.customer.status, 'inactive');
assert.equal(inactiveCanonical.body.subscription.status, 'active');
assert.equal(inactiveCanonical.body.isActive, false);
assert.equal(inactiveCanonical.body.customer.isActive, false);
assert.equal(inactiveCanonical.body.subscriptionRelation, 'historical');
customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
customerRecords = { 'CLUB-101-6': customer };
subscriptions = {};
const noActiveSubscription = await json(await request('CLUB-101-6'));
assert.equal(noActiveSubscription.status, 200);
assert.equal(noActiveSubscription.body.found, true);
assert.equal(noActiveSubscription.body.isActive, true);
assert.equal(noActiveSubscription.body.customer.activeSubscriptionId, null);
assert.equal(noActiveSubscription.body.subscription, null);
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
role = 'manager';
allowWrites = true;
customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
customerRecords = { 'CLUB-101-6': customer };
subscriptions = { subscriptionA: { clubNumber: 'CLUB-101-6', status: 'active', planName: 'Test', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } };
const consumeResult = await json(await post('/api/admin/club/consume', { subscriptionId: 'subscriptionA', requestId: 'consume-fixture' }));
assert.equal(consumeResult.status, 200);
assert.equal(consumeResult.body.remainingUses, 2);
const reserveResult = await json(await post('/api/admin/club/reserve-pin', { customerId: 'CLUB-101-6' }));
assert.equal(reserveResult.status, 200);
assert.match(reserveResult.body.pin, /^\d{4}$/);
const loyaltySource = await readFile(new URL('../../loyalty.html', import.meta.url), 'utf8');
const searchFlow = loyaltySource.slice(loyaltySource.indexOf('async function searchClubCust'), loyaltySource.indexOf('async function redeemClubDrink'));
assert.equal((searchFlow.match(/db\.ref\(['"]subscriptions['"]\)\.once\(['"]value['"]\)/g) || []).length, 0);
assert.match(searchFlow, /result\.isActive/);
assert.match(searchFlow, /canonicalClubId/);
assert.match(searchFlow, /canonicalActive\?'الاشتراك فعال':'الاشتراك غير فعال'/);
console.log('club search endpoint fixtures: PASS');
