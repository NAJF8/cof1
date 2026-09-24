import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { provision } from '../src/loyalty-routes.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicJwk = { ...createPublicKey(privateKey).export({ format: 'jwk' }), kid: 'fixture-kid', alg: 'RS256', use: 'sig' };
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyPem, LOYALTY_PIN_PEPPER: 'fixture-pepper', LOYALTY_PIN_REVEAL_KEY: '0000000000000000000000000000000000000000000000000000000000000000' };
const baseRoot = { loyalty_counter: 10, loyalty_customers: {}, loyalty_credentials: {}, loyalty_pin_index: {}, loyalty_links: {}, loyalty_pending: {}, loyalty_provision_reservations: {} };
let root = structuredClone(baseRoot), failPatch = false, counterConflict = false;

function pathValue(path) { let value = root; for (const part of path ? path.split('/') : []) value = value?.[part]; return value ?? null; }
function setPath(path, value) { const parts = path.split('/'); let target = root; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = value; }
function b64url(value) { return Buffer.from(value).toString('base64url'); }
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') return Response.json({ keys: [publicJwk] });
  if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
  if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`);
  const parsed = new URL(address), path = decodeURIComponent(parsed.pathname).replace(/^\//, '').replace(/\.json$/, '');
  const method = options.method || 'GET';
  if (method === 'PUT') {
    if (counterConflict && path === 'loyalty_counter') { counterConflict = false; return new Response('{}', { status: 412 }); }
    setPath(path, JSON.parse(options.body));
    return Response.json({});
  }
  if (method === 'PATCH') {
    if (failPatch) return new Response('{}', { status: 503 });
    for (const [key, value] of Object.entries(JSON.parse(options.body))) setPath(key, value);
    return Response.json({});
  }
  if (method === 'DELETE') { setPath(path, null); return Response.json(null); }
  let value = pathValue(path);
  if (path === 'loyalty_customers' && parsed.searchParams.has('equalTo')) {
    const uid = JSON.parse(parsed.searchParams.get('equalTo'));
    value = Object.fromEntries(Object.entries(value || {}).filter(([, customer]) => customer?.uid === uid));
  }
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ETag: '"fixture-etag"' } });
};

function request(id) { return new Request('https://worker.test/api/loyalty/provision-google', { method: 'POST', headers: { Origin: 'https://101coffees.com', 'X-Request-Id': id } }); }
const current = { uid: 'google-new-user', email: 'new-user@example.test', emailVerified: true, name: 'New User' };

let response = await provision(request('provision-success-1'), env, current);
assert.equal(response.status, 200);
let body = await response.json();
assert.equal(body.ok, true);
assert.equal(body.profileStatus, 'active');
assert.equal(root.loyalty_links['google-new-user'], body.membershipNumber);
assert.ok(root.loyalty_credentials[body.membershipNumber]);
const createdMembership = body.membershipNumber;

response = await provision(request('provision-retry-1'), env, current);
body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.status, 'already_provisioned');
assert.equal(body.membershipNumber, createdMembership);
assert.equal(Object.keys(root.loyalty_customers).length, 1);

root = structuredClone(baseRoot);
counterConflict = true;
response = await provision(request('provision-counter-conflict'), env, { ...current, uid: 'counter-user', email: 'counter@example.test' });
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);

root = structuredClone(baseRoot);
env.LOYALTY_PIN_REVEAL_KEY = '';
await assert.rejects(() => provision(request('provision-encryption-failure'), env, { ...current, uid: 'encryption-user', email: 'encryption@example.test' }));
assert.equal(Object.keys(root.loyalty_customers).length, 0);
assert.equal(root.loyalty_counter, 11);
assert.equal(root.loyalty_provision_reservations['encryption-user'].membership, '101-11');
env.LOYALTY_PIN_REVEAL_KEY = '0000000000000000000000000000000000000000000000000000000000000000';
response = await provision(request('provision-encryption-retry'), env, { ...current, uid: 'encryption-user', email: 'encryption@example.test' });
body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.membershipNumber, '101-11');
assert.equal(Object.keys(root.loyalty_customers).length, 1);

root = structuredClone(baseRoot);
failPatch = true;
await assert.rejects(() => provision(request('provision-write-failure'), env, { ...current, uid: 'write-user', email: 'write@example.test' }));
failPatch = false;
assert.equal(Object.keys(root.loyalty_customers).length, 0);
assert.equal(Object.keys(root.loyalty_links).length, 0);
assert.equal(Object.keys(root.loyalty_pin_index).length, 0);

console.log('provision-google limited-path/idempotency fixtures: PASS');
