import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';
import { createCredential } from '../src/loyalty-security.js';

globalThis.crypto ||= webcrypto;
const encoder = new TextEncoder();
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const jsonPart = value => b64url(encoder.encode(JSON.stringify(value)));
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
publicJwk.kid = 'pin-test-key';
const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
const privatePem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateKey).toString('base64')}\n-----END PRIVATE KEY-----`;
const hashed = await createCredential('5678', 'fixture-pepper');
const root = {
  loyalty_links: { 'member-uid': '101-5', 'legacy-uid': '101-6' },
  loyalty_customers: {
    '101-5': { uid: 'member-uid', name: 'Hashed Fixture', currentHearts: 5, pin: undefined },
    '101-6': { uid: 'legacy-uid', name: 'Legacy Fixture', currentHearts: 2, pin: '1234' }
  },
  loyalty_credentials: { '101-5': hashed }
};
let writes = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('service_accounts/v1/jwk')) return Response.json({ keys: [publicJwk] });
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
  if (!url.startsWith('https://fixture.firebaseio.test/')) throw new Error(`unexpected fixture request: ${url}`);
  const path = decodeURIComponent(new URL(url).pathname).replace(/^\//, '').replace(/\.json$/, '');
  if ((options.method || 'GET') !== 'GET') { writes += 1; return Response.json({}); }
  let value = root;
  for (const part of path ? path.split('/') : []) value = value?.[part];
  return Response.json(value ?? null);
};
const tokenFor = async uid => {
  const header = jsonPart({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid });
  const payload = jsonPart({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600, email: `${uid}@example.com`, email_verified: true });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
};
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privatePem, LOYALTY_PIN_PEPPER: 'fixture-pepper' };
const call = async (path, uid) => handleLoyaltyRoutes(new Request(`https://worker.test${path}`, { method: 'POST', headers: { Origin: 'https://101coffees.com', Authorization: `Bearer ${await tokenFor(uid)}`, 'Content-Type': 'application/json' }, body: '{}' }), env, new URL(`https://worker.test${path}`));

let response = await call('/api/loyalty/profile', 'member-uid');
let body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.profile.currentHearts, 5);
assert.equal(body.profile.pinDisplayAvailable, false);
assert.equal('pin' in body.profile, false);
response = await call('/api/loyalty/reveal-pin', 'member-uid');
body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.available, false);
assert.equal(writes, 0);
response = await call('/api/loyalty/reveal-pin', 'legacy-uid');
body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.available, true);
assert.equal(body.pin, '1234');
assert.equal(writes, 0);
console.log('PIN display hash/legacy fixtures: PASS');
