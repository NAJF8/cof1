import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { createCredential, encryptPin } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_REVEAL_KEY: 'fixture-reveal-key' };
const uid = 'AyXnONLiBufnrW8TWf636FToHad2';
const credential = await createCredential('2468', 'fixture-pepper');
credential.pinCiphertext = await encryptPin('2468', env.LOYALTY_PIN_REVEAL_KEY);
const root = { admins: { [uid]: { email: '101cofeehouse@gmail.com', role: 'admin', status: 'active' }, 'super-uid': { role: 'Super Admin', status: 'active' }, 'manager-uid': { role: 'Manager', status: 'active' }, 'cashier-uid': { role: 'cashier', status: 'active' }, 'inactive-uid': { role: 'admin', status: 'disabled' } }, loyalty_customers: { '101-1': { uid: 'member-uid' } }, loyalty_credentials: { '101-1': credential } };
const publicJwk = publicKey.export({ format: 'jwk' });
globalThis.fetch = async (url, options = {}) => {
  const address = String(url);
  if (address.includes('googleapis.com/service_accounts')) return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
  if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
  if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`);
  const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, '');
  let value = root;
  for (const part of path ? path.split('/') : []) value = value?.[part];
  return new Response(JSON.stringify(value ?? null), { headers: { 'Content-Type': 'application/json' } });
};
function token(subject) {
  const now = Math.floor(Date.now() / 1000), head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' })).toString('base64url'), body = Buffer.from(JSON.stringify({ sub: subject, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 5, exp: now + 3600 })).toString('base64url');
  const signer = createSign('RSA-SHA256'); signer.update(`${head}.${body}`); return `${head}.${body}.${signer.sign(key).toString('base64url')}`;
}
async function reveal(subject) {
  const request = new Request('https://worker.test/api/admin/loyalty/reveal-pin', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${token(subject)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ membership: '101-1' }) });
  const response = await handleLoyaltyRoutes(request, env, new URL(request.url));
  return { status: response.status, body: await response.json() };
}

for (const role of ['admin', 'Admin', 'super_admin', 'super-admin', 'Super Admin']) {
  root.admins[uid].role = role;
  const result = await reveal(uid);
  assert.equal(result.status, 200, role);
  assert.equal(result.body.pin, '2468', role);
}
for (const role of ['manager', 'Manager']) {
  root.admins[uid].role = role;
  const result = await reveal(uid);
  assert.equal(result.status, 200, role);
  assert.equal(result.body.pin, '2468', role);
}
assert.equal((await reveal('super-uid')).status, 200);
assert.equal((await reveal('manager-uid')).status, 200);
assert.equal((await reveal('cashier-uid')).status, 403);
assert.equal((await reveal('missing-uid')).status, 403);
assert.equal((await reveal('inactive-uid')).status, 403);
console.log('loyalty reveal authorization matrix: PASS');
