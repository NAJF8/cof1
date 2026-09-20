import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { createCredential } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_PEPPER: 'fixture-pepper' };
const root = { loyalty_customers: { '101-1': { uid: 'member-1', currentHearts: 2 }, '101-2': { uid: 'member-2', currentHearts: 1 } }, loyalty_links: { 'member-1': '101-1', 'member-2': '101-2' }, loyalty_credentials: { '101-1': await createCredential('5678', env.LOYALTY_PIN_PEPPER), '101-2': await createCredential('2468', env.LOYALTY_PIN_PEPPER) } };
const publicJwk = publicKey.export({ format: 'jwk' });
function token(uid, membership = '') { const now = Math.floor(Date.now() / 1000); const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' })).toString('base64url'); const body = Buffer.from(JSON.stringify({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 5, exp: now + 3600, email: `${uid}@example.test`, email_verified: false, loyaltyMembership: membership })).toString('base64url'); const signer = createSign('RSA-SHA256'); signer.update(`${head}.${body}`); return `${head}.${body}.${signer.sign(key).toString('base64url')}`; }
globalThis.fetch = async (url, options = {}) => { const address = String(url); if (address.includes('googleapis.com/service_accounts')) return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] }); if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 }); if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`); if (options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE') throw new Error('UNEXPECTED_WRITE'); const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, ''); let value = root; for (const part of path ? path.split('/') : []) value = value?.[part]; return new Response(JSON.stringify(value ?? null), { headers: { 'Content-Type': 'application/json' } }); };
async function verify(auth, pin) { const request = new Request('https://worker.test/api/loyalty/verify-pin-for-reveal', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }

let result = await verify(token('member-1', '101-1'), '5678');
assert.equal(result.status, 200);
assert.equal(result.body.verified, true);
assert.equal('pin' in result.body, false);
assert.equal('pinHash' in result.body, false);
assert.equal('salt' in result.body, false);

result = await verify(token('member-1', '101-1'), '2468');
assert.equal(result.status, 400);
assert.equal(result.body.error, 'INVALID_PIN');

result = await verify(token('member-1', '101-2'), '2468');
assert.equal(result.status, 400);
assert.equal(result.body.error, 'INVALID_PIN');

result = await verify(token('member-2', '101-1'), '5678');
assert.equal(result.status, 400);
assert.equal(result.body.error, 'INVALID_PIN');

result = await verify(token('unlinked', '101-1'), '5678');
assert.equal(result.status, 404);
assert.equal(result.body.error, 'PROFILE_NOT_FOUND');

console.log('loyalty reveal PIN hash ownership fixtures: PASS');
