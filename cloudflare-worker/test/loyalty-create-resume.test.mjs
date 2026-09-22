import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const signingKey = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: signingKey.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_PEPPER: 'fixture-pepper', LOYALTY_PIN_REVEAL_KEY: 'fixture-reveal-key' };
const root = { admins: { 'admin-1': { role: 'super_admin', status: 'active', displayName: 'Fixture admin' } }, loyalty_counter: 40, loyalty_customers: {}, loyalty_credentials: {}, loyalty_pin_index: {}, loyalty_operation_requests: {} };
const jwk = publicKey.export({ format: 'jwk' });
function setPath(path, value) { const parts = path.split('/'); let target = root; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = structuredClone(value); }
function token(uid, email = 'admin@example.test') { const now = Math.floor(Date.now() / 1000), head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' })).toString('base64url'), payload = Buffer.from(JSON.stringify({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 5, exp: now + 3600, email, email_verified: true, name: 'Fixture admin' })).toString('base64url'), signer = createSign('RSA-SHA256'); signer.update(`${head}.${payload}`); return `${head}.${payload}.${signer.sign(signingKey).toString('base64url')}`; }
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address.includes('googleapis.com/service_accounts')) return Response.json({ keys: [{ ...jwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
  if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
  if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw Error(`unexpected request ${address}`);
  const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, '');
  if (options.method === 'PATCH') { for (const [key, value] of Object.entries(JSON.parse(options.body))) setPath(key, value); return Response.json({}); }
  let value = root; for (const part of path ? path.split('/') : []) value = value?.[part];
  return new Response(JSON.stringify(value ?? null), { headers: { 'Content-Type': 'application/json', ETag: 'fixture-etag' } });
};
async function create(payload, auth = token('admin-1')) { const request = new Request('https://worker.test/api/admin/loyalty/create', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }
try {
  const payload = { requestId: 'create-resume-fixture-1', name: 'Test customer', phone: '07701234567', hearts: 2, memberType: 'زبون' };
  const first = await create(payload);
  assert.equal(first.status, 200); assert.equal(first.body.membershipNumber, '101-41'); assert.match(first.body.pin, /^\d{4}$/); assert.equal(root.loyalty_customers['101-41'].pin, undefined); assert.equal(typeof root.loyalty_credentials['101-41'].pinHash, 'string'); assert.equal(typeof root.loyalty_credentials['101-41'].pinCiphertext, 'string');
  const replay = await create(payload);
  assert.equal(replay.status, 200); assert.equal(replay.body.membershipNumber, first.body.membershipNumber); assert.equal(replay.body.pin, first.body.pin); assert.equal(replay.body.resumed, true); assert.equal(Object.keys(root.loyalty_customers).length, 1);
  const otherActor = await create(payload, token('admin-2', 'other@example.test'));
  assert.equal(otherActor.status, 403); assert.equal(Object.keys(root.loyalty_customers).length, 1);
  const noPhoneZeroHearts = await create({ requestId: 'create-no-phone-zero-hearts', name: 'No phone customer', phone: '', hearts: 0, memberType: 'عضو مميز' });
  assert.equal(noPhoneZeroHearts.status, 200); assert.equal(root.loyalty_customers['101-42'].phone, ''); assert.equal(root.loyalty_customers['101-42'].hearts, 0);
  const invalidHearts = await create({ requestId: 'create-invalid-hearts', name: 'Invalid hearts customer', phone: '', hearts: '.', memberType: 'زبون' });
  assert.equal(invalidHearts.status, 400); assert.equal(invalidHearts.body.error, 'INVALID_FIELD'); assert.equal(invalidHearts.body.field, 'hearts'); assert.equal(Object.keys(root.loyalty_customers).length, 2);
  const invalidRequestId = await create({ requestId: 'bad request id!', name: 'Invalid request customer', phone: '', hearts: 0, memberType: 'زبون' });
  assert.equal(invalidRequestId.status, 400); assert.equal(invalidRequestId.body.field, 'requestId'); assert.equal(Object.keys(root.loyalty_customers).length, 2);
  const missingId = await create({ ...payload, requestId: '' });
  assert.equal(missingId.status, 400); assert.equal(missingId.body.field, 'requestId'); assert.equal(Object.keys(root.loyalty_customers).length, 2);
  console.log('LOYALTY_CREATE_RESUME_TESTS=PASS');
} finally { globalThis.fetch = originalFetch; }
