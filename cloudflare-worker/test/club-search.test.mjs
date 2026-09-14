import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { handleLoyaltyRoutes, clubSearchQuery, normalizeIraqiPhone, normalizeClubMembership, safeClubCustomer, safeSubscriptionMe } from '../src/loyalty-routes.js';
import { createCredential } from '../src/loyalty-security.js';

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
let clubCredential = await createCredential('1234', 'fixture');
let writes = 0;
let allowWrites = false;
let customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid', pin: '1234' };
let customerRecords = { 'CLUB-101-6': customer };
let subscriptions = { subscriptionA: { clubNumber: 'CLUB-101-6', status: 'active', planName: 'Test', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } };
let plans = { small: { nameAr: 'Small', totalUses: 5, durationDays: 30 } };
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
  subscriptions: () => subscriptions,
  'subscription_plans/small': () => plans.small,
  subscription_plans: () => plans,
  'subscription_account_index/staff-uid': () => 'stale-customer',
  'subscription_credentials/CLUB-101-6': () => clubCredential
};
const databaseRoot = () => ({ admins: { 'staff-uid': { role, status: 'active', permissions: {} } }, subscription_customers: customerRecords, subscriptions, subscription_plans: plans, subscription_account_index: { 'staff-uid': 'stale-customer' }, subscription_credentials: { 'CLUB-101-6': clubCredential }, subscription_pin_index: {} });
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
    if (path.startsWith('subscriptions/')) return Response.json(subscriptions[path.slice('subscriptions/'.length)] ?? null);
    return Response.json(database[path]?.() ?? null);
  }
  throw new Error(`unexpected fetch ${url}`);
};
async function idToken(uid = 'staff-uid') {
  const header = jsonPart({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid });
  const payload = jsonPart({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600, email: `${uid}@example.com`, email_verified: true });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(signature)}`;
}
const env = { ALLOWED_ORIGINS: 'https://najf8.github.io', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privatePem, FIREBASE_DATABASE_URL: 'https://coffee-30fa7-default-rtdb.firebaseio.com', LOYALTY_PIN_PEPPER: 'fixture' };
const post = async (path, payload, token) => { const auth = token === null ? null : (token || await idToken()); return handleLoyaltyRoutes(new Request(`https://worker.test${path}`, { method: 'POST', headers: { Origin: 'https://najf8.github.io', 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(payload) }), env, new URL(`https://worker.test${path}`)); };
const request = async (query, token) => post('/api/admin/club/search', { query }, token);
const get = async (path, uid = 'staff-uid') => handleLoyaltyRoutes(new Request(`https://worker.test${path}`, { method: 'GET', headers: { Origin: 'https://najf8.github.io', Authorization: `Bearer ${await idToken(uid)}` } }), env, new URL(`https://worker.test${path}`));
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
const safeMe = safeSubscriptionMe('CLUB-101-6', { uid: 'private-uid', status: 'active', clubNumber: 'CLUB-101-6', pin: '1234', email: 'private@example.com' }, 'sub-safe', { planId: 'small', status: 'active', remainingUses: 0, expiresAt: Date.now() + 86400000 }, { id: 'small', nameAr: 'Small', totalUses: 5, durationDays: 30 });
assert.equal(safeMe.customer.clubNumber, 'CLUB-101-6');
assert.equal(safeMe.subscription.remainingUses, 0);
assert.equal(safeMe.subscription.totalUses, 5);
assert.equal(safeMe.plan.id, 'small');
assert.equal('uid' in safeMe.customer, false);
assert.equal('pin' in safeMe, false);
assert.equal('email' in safeMe, false);

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
  member12: { status: 'active', clubNumber: 'CLUB-101-12', name: 'محمد الحار', phone: '07827337942', pin: '1111', email: 'hidden@example.com', uid: 'uid-12' },
  member8: { status: 'active', clubNumber: 'CLUB-101-8', name: 'MOHAMMED MUSLIM', phone: '07827337942', pin: '2222', email: 'hidden@example.com', uid: 'uid-8' },
  member3: { status: 'active', clubNumber: 'CLUB-101-3', name: 'Member Three', phone: '07827337942', pin: '3333' },
  member4: { status: 'active', clubNumber: 'CLUB-101-4', name: 'Member Four', phone: '07827337942', pin: '4444' },
  member5: { status: 'active', clubNumber: 'CLUB-101-5', name: 'Member Five', phone: '07827337942', pin: '5555' },
  member6: { status: 'active', clubNumber: 'CLUB-101-6', name: 'Member Six', phone: '07827337942', pin: '6666' }
};
subscriptions = {
  sub12: { clubNumber: 'CLUB-101-12', status: 'active', planName: '101 CLUB Large', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 },
  sub8: { clubNumber: 'CLUB-101-8', status: 'active', planName: '101 CLUB Small', remainingUses: 2, totalUses: 10, expiresAt: Date.now() + 86400000 },
  sub3: { clubNumber: 'CLUB-101-3', status: 'active', planName: '101 CLUB Basic', remainingUses: 1, totalUses: 5, expiresAt: Date.now() + 86400000 },
  sub4: { clubNumber: 'CLUB-101-4', status: 'active', planName: '101 CLUB Basic', remainingUses: 1, totalUses: 5, expiresAt: Date.now() + 86400000 },
  sub5: { clubNumber: 'CLUB-101-5', status: 'active', planName: '101 CLUB Basic', remainingUses: 1, totalUses: 5, expiresAt: Date.now() + 86400000 },
  sub6: { clubNumber: 'CLUB-101-6', status: 'active', planName: '101 CLUB Basic', remainingUses: 1, totalUses: 5, expiresAt: Date.now() + 86400000 }
};
const ambiguousQueries = ['07827337942', '7827337942', '9647827337942', '+9647827337942'];
for (const query of ambiguousQueries) {
  const ambiguous = await json(await request(query));
  assert.equal(ambiguous.status, 200);
  assert.equal(ambiguous.body.ok, true);
  assert.equal(ambiguous.body.found, true);
  assert.equal(ambiguous.body.ambiguous, true);
  assert.equal(ambiguous.body.matches.length, 6);
  assert.deepEqual(ambiguous.body.matches.map(match => match.clubNumber), ['101-3', '101-4', '101-5', '101-6', '101-8', '101-12']);
  assert.equal(ambiguous.body.matches.find(match => match.clubNumber === '101-12').planName, '101 CLUB Large');
  for (const match of ambiguous.body.matches) {
    assert.equal(match.status, 'active');
    assert.equal('pin' in match, false);
    assert.equal('email' in match, false);
    assert.equal('token' in match, false);
    assert.equal('privateKey' in match, false);
  }
}

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

customerRecords = {
  owner: { status: 'active', clubNumber: 'CLUB-101-15', uid: 'member-uid', activeSubscriptionId: 'stale-sub' },
  other: { status: 'active', clubNumber: 'CLUB-101-16', uid: 'other-uid', activeSubscriptionId: 'other-sub' }
};
subscriptions = {
  'stale-sub': { customerId: 'CLUB-101-16', uid: 'other-uid', planId: 'small', status: 'active', remainingUses: 4, expiresAt: Date.now() + 86400000 },
  'owner-sub': { customerId: 'owner', uid: 'member-uid', planId: 'small', status: 'active', remainingUses: 2, expiresAt: Date.now() + 86400000 },
  'other-sub': { customerId: 'other', uid: 'other-uid', planId: 'small', status: 'active', remainingUses: 8, expiresAt: Date.now() + 86400000 }
};
const unauthenticatedMe = await json(await handleLoyaltyRoutes(new Request('https://worker.test/api/subscription/me', { method: 'GET', headers: { Origin: 'https://najf8.github.io' } }), env, new URL('https://worker.test/api/subscription/me')));
assert.equal(unauthenticatedMe.status, 401);
const ownedMe = await json(await get('/api/subscription/me', 'member-uid'));
assert.equal(ownedMe.status, 200);
assert.equal(ownedMe.body.customer.customerId, 'owner');
assert.equal(ownedMe.body.subscription.id, 'owner-sub');
assert.equal(ownedMe.body.subscription.remainingUses, 2);
assert.equal('uid' in ownedMe.body.customer, false);
assert.equal('pin' in ownedMe.body, false);
assert.equal('email' in ownedMe.body, false);
const noSubscription = await json(await get('/api/subscription/me', 'unlinked-uid'));
assert.equal(noSubscription.status, 200);
assert.equal(noSubscription.body.customer, null);
assert.equal(noSubscription.body.subscription, null);
console.log('subscription /me security fixtures: PASS');
role = 'viewer';
const forbidden = await json(await request('CLUB-101-14'));
assert.equal(forbidden.status, 403);
assert.equal(forbidden.body.error, 'FORBIDDEN');
assert.equal(writes, 0);
role = 'manager';
allowWrites = true;
customer = { status: 'active', clubNumber: 'CLUB-101-6', name: 'Known Club Member', phone: '07827337942', uid: 'member-uid' };
customerRecords = { 'CLUB-101-6': customer };
subscriptions = { subscriptionA: { customerId: 'CLUB-101-6', clubNumber: 'CLUB-101-6', status: 'active', planName: 'Test', remainingUses: 3, totalUses: 10, expiresAt: Date.now() + 86400000 } };
clubCredential = await createCredential('1234', 'fixture');
const consumeResult = await json(await post('/api/admin/club/consume', { subscriptionId: 'subscriptionA', customerId: 'CLUB-101-6', clubNumber: 'CLUB-101-6', pin: '1234', requestId: 'consume-fixture' }));
assert.equal(consumeResult.status, 200);
assert.equal(consumeResult.body.remainingUses, 2);
const wrongPin = await json(await post('/api/admin/club/consume', { subscriptionId: 'subscriptionA', customerId: 'CLUB-101-6', clubNumber: 'CLUB-101-6', pin: '9999', requestId: 'wrong-pin' }));
assert.equal(wrongPin.status, 400);
assert.equal(wrongPin.body.error, 'INVALID_PIN');
const missingPin = await json(await post('/api/admin/club/consume', { subscriptionId: 'subscriptionA', customerId: 'CLUB-101-6', clubNumber: 'CLUB-101-6', requestId: 'missing-pin' }));
assert.equal(missingPin.status, 400);
assert.equal(missingPin.body.error, 'INVALID_ARGUMENT');
const otherCustomer = await json(await post('/api/admin/club/consume', { subscriptionId: 'subscriptionA', customerId: 'other-customer', clubNumber: 'CLUB-101-6', pin: '1234', requestId: 'other-customer' }));
assert.equal(otherCustomer.status, 404);
assert.equal(otherCustomer.body.error, 'CLUB_MEMBER_NOT_FOUND');
const loyaltySource = await readFile(new URL('../../loyalty.html', import.meta.url), 'utf8');
const searchFlow = loyaltySource.slice(loyaltySource.indexOf('async function searchClubCust'), loyaltySource.indexOf('async function redeemClubDrink'));
const clubUiFlow = loyaltySource.slice(loyaltySource.indexOf('function renderClubCustomer'), loyaltySource.indexOf('async function redeemClubDrink'));
const selectionFlow = loyaltySource.slice(loyaltySource.indexOf('function selectClubAmbiguousMatch'), loyaltySource.indexOf('async function searchClubCust'));
assert.equal((searchFlow.match(/db\.ref\(['"]subscriptions['"]\)\.once\(['"]value['"]\)/g) || []).length, 0);
assert.match(searchFlow, /result\.isActive/);
assert.match(searchFlow, /result\.ambiguous===true/);
assert.match(searchFlow, /renderClubAmbiguousMatches\(result\.matches\)/);
assert.match(clubUiFlow, /canonicalClubId/);
assert.match(clubUiFlow, /canonicalActive\?'الاشتراك فعال':'الاشتراك غير فعال'/);
assert.match(clubUiFlow, /currentClubAmbiguousMatches\.get/);
assert.doesNotMatch(selectionFlow, /searchClubCust\(/);
console.log('club search endpoint fixtures: PASS');
