import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { createCredential } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyObject = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const publicJwk = publicKey.export({ format: 'jwk' });
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyObject.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_PEPPER: 'fixture-pepper' };
const root = { loyalty_customers: { '101-78': { name: 'Fixture Member', hearts: 2, currentHearts: 2, uid: 'loya_78' }, '101-79': { name: 'Other Member', hearts: 1, currentHearts: 1, uid: 'other-user' }, '101-80': { name: 'PIN Only Fixture', hearts: 3, currentHearts: 3 } }, loyalty_links: { 'loya_78': '101-78' }, loyalty_credentials: { '101-78': await createCredential('5678', env.LOYALTY_PIN_PEPPER), '101-80': await createCredential('6789', env.LOYALTY_PIN_PEPPER) } };

function jwt(claims) {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${body}`);
  return `${head}.${body}.${signer.sign(privateKeyObject).toString('base64url')}`;
}

globalThis.fetch = async (url) => {
  const address = String(url);
  if (address === 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com') return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] });
  if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
  if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`);
  const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, '');
  let value = root;
  for (const part of path ? path.split('/') : []) value = value?.[part];
  return new Response(JSON.stringify(value ?? null), { headers: { ETag: '"fixture-etag"', 'Content-Type': 'application/json' } });
};

function idToken(uid, loyaltyMembership, provider = 'custom', authTime = Math.floor(Date.now() / 1000) - 5, email = 'member@example.test') {
  const now = Math.floor(Date.now() / 1000);
  return jwt({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 5, exp: now + 3600, auth_time: authTime, firebase: { sign_in_provider: provider }, ...(email ? { email, email_verified: true } : {}), loyaltyMembership });
}

async function profile(token) {
  const request = new Request('https://worker.test/api/loyalty/profile', { headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${token}` } });
  const response = await handleLoyaltyRoutes(request, env, new URL(request.url));
  return { status: response.status, body: await response.json() };
}

let result = await profile(idToken('loya_78', '101-78'));
assert.equal(result.status, 200);
assert.equal(result.body.profile.membershipNumber, '101-78');
assert.equal(result.body.profile.currentHearts, 2);
assert.equal('pin' in result.body.profile, false);

result = await profile(idToken('loya_78', '101-79'));
assert.equal(result.status, 200);
assert.equal(result.body.profile.membershipNumber, '101-78');
assert.equal(root.loyalty_customers['101-79'].uid, 'other-user');

console.log('loyalty profile ownership fixtures: PASS');
