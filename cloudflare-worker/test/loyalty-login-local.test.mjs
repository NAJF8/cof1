import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createCredential } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyPem, LOYALTY_PIN_PEPPER: 'fixture-pepper' };
const root = { loyalty_customers: { '101-100': { name: 'Legacy Fixture', hearts: 2, pin: '1234' }, '101-101': { name: 'Hashed Fixture', uid: 'existing-google-uid', hearts: 5, currentHearts: 5 }, '101-102': { name: 'Broken Credential Fixture', uid: 'existing-google-uid-2', hearts: 4, pin: '2468' }, '101-103': { name: 'Malformed Credential Fixture', uid: 'existing-google-uid-3', hearts: 5, pin: '1357' }, '101-104': { name: 'Unlinked Fixture', hearts: 1, pin: '9876' } }, loyalty_links: { 'linked-google-uid': '101-100' }, loyalty_credentials: { '101-101': await createCredential('5678', env.LOYALTY_PIN_PEPPER), '101-102': { pinHash: 'old-but-incomplete' }, '101-103': { pinHash: '%%%not-base64%%%', salt: '%%%not-base64%%%', algorithm: 'PBKDF2-SHA512', iterations: 100000 } }, loyalty_login_attempts: {} };
let failCredentialPut = false;

function setPath(path, value) { const parts = path.split('/'); let target = root; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = value; }
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
  if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`);
  const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, '');
  if ((options.method || 'GET') === 'PUT' && path.startsWith('loyalty_credentials/') && failCredentialPut) return new Response('{}', { status: 500 });
  if ((options.method || 'GET') === 'PUT' || (options.method || 'GET') === 'PATCH') { if (path) setPath(path, JSON.parse(options.body)); else for (const [key, value] of Object.entries(JSON.parse(options.body))) setPath(key, value); return Response.json({}); }
  if ((options.method || 'GET') === 'DELETE') { setPath(path, null); return Response.json(null); }
  let value = root; for (const part of path ? path.split('/') : []) value = value?.[part]; return Response.json(value ?? null);
};

async function login(membershipNumber, pin) {
  const request = new Request('https://worker.test/api/loyalty/login', { method: 'POST', headers: { Origin: 'https://101coffees.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipNumber, pin }) });
  const response = await handleLoyaltyRoutes(request, env, new URL(request.url));
  return { status: response.status, body: await response.json() };
}

function decodeTokenPayload(token) {
  const encoded = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

let result = await login('CLUB-101-100', '1234');
assert.equal(result.status, 200);
assert.equal(result.body.profile.currentHearts, 2);
assert.equal(decodeTokenPayload(result.body.token).uid, 'linked-google-uid');
assert.equal(root.loyalty_customers['101-100'].hearts, 2);
assert.equal(root.loyalty_customers['101-100'].currentHearts, undefined);
assert.equal(root.loyalty_customers['101-100'].pin, undefined);
assert.equal(root.loyalty_credentials['101-100'].pinHash.length > 20, true);

result = await login('101-104', '9876');
assert.equal(result.status, 404);
assert.equal(result.body.error, 'PROFILE_NOT_FOUND');
assert.equal(root.loyalty_customers['101-104'].pin, '9876');
assert.equal(root.loyalty_customers['101-104'].hearts, 1);

result = await login('101-101', '9999');
assert.equal(result.status, 401);
assert.equal(result.body.error, 'INVALID_CREDENTIALS');

result = await login('101-101', '5678');
assert.equal(result.status, 200);
assert.equal(result.body.profile.currentHearts, 5);
assert.equal(result.body.ok, true);
let tokenPayload = decodeTokenPayload(result.body.token);
assert.equal(tokenPayload.sub, env.FIREBASE_SERVICE_ACCOUNT_EMAIL);
assert.equal(tokenPayload.uid, 'existing-google-uid');
assert.equal(result.body.profile.name, 'Hashed Fixture');
assert.equal(result.body.profile.pinDisplayAvailable, false);

result = await login('101-103', '1357');
assert.equal(result.status, 200);
assert.equal(root.loyalty_customers['101-103'].pin, undefined);
assert.equal(root.loyalty_credentials['101-103'].pinHash.length > 20, true);

failCredentialPut = true;
result = await login('101-102', '2468');
assert.equal(result.status, 500);
assert.equal(root.loyalty_customers['101-102'].pin, '2468');
assert.equal(root.loyalty_customers['101-102'].hearts, 4);
assert.equal(root.loyalty_credentials['101-102'].pinHash, 'old-but-incomplete');

console.log('credential-write failure preserves legacy PIN: PASS');

console.log('local loyalty login fixtures: PASS');
