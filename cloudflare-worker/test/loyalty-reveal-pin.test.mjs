import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { createCredential, encryptPin } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_PEPPER: 'fixture-pepper', LOYALTY_PIN_REVEAL_KEY: 'independent-reveal-secret' };
const legacyCredential = await createCredential('1357', env.LOYALTY_PIN_PEPPER);
const hashOnlyCredential = await createCredential('8642', env.LOYALTY_PIN_PEPPER);
const root = { admins: { 'admin-1': { role: 'super_admin', status: 'active' }, 'admin-2': { role: 'admin', status: 'active' }, 'manager-1': { role: 'manager', status: 'active', permissions: { canRevealMemberPin: true } }, 'manager-2': { role: 'manager', status: 'active', permissions: { canRevealMemberPin: false } }, 'cashier-1': { role: 'cashier', status: 'active' } }, loyalty_customers: { '101-1': { uid: 'member-1', currentHearts: 2 }, '101-2': { uid: 'member-2', currentHearts: 1 }, '101-3': { uid: 'member-3', currentHearts: 0, pin: '1357' }, '101-4': { uid: 'member-4', currentHearts: 0 } }, loyalty_links: { 'member-1': '101-1', 'member-2': '101-2', 'member-3': '101-3', 'member-4': '101-4' }, loyalty_credentials: { '101-1': await createCredential('5678', env.LOYALTY_PIN_PEPPER), '101-2': await createCredential('2468', env.LOYALTY_PIN_PEPPER), '101-3': legacyCredential, '101-4': hashOnlyCredential } };
root.loyalty_credentials['101-1'].pinCiphertext = await encryptPin('5678', env.LOYALTY_PIN_REVEAL_KEY);
const publicJwk = publicKey.export({ format: 'jwk' });
let writes = 0;
function token(uid, membership = '', expiresAt = Math.floor(Date.now() / 1000) + 3600, authTime = Math.floor(Date.now() / 1000)) { const now = Math.floor(Date.now() / 1000); const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture-key' })).toString('base64url'); const body = Buffer.from(JSON.stringify({ sub: uid, aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 5, exp: expiresAt, auth_time: authTime, email: uid === 'admin-1' ? 'mohameadalhaear100@gmail.com' : `${uid}@example.test`, email_verified: uid === 'admin-1', loyaltyMembership: membership })).toString('base64url'); const signer = createSign('RSA-SHA256'); signer.update(`${head}.${body}`); return `${head}.${body}.${signer.sign(key).toString('base64url')}`; }
globalThis.fetch = async (url, options = {}) => { const address = String(url); if (address.includes('googleapis.com/service_accounts')) return Response.json({ keys: [{ ...publicJwk, kid: 'fixture-key', alg: 'RS256', use: 'sig' }] }); if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access', expires_in: 3600 }); if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw new Error(`unexpected fixture request: ${address}`); const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, ''); if (options.method === 'DELETE') { writes += 1; let target = root, parts = path.split('/'); for (const part of parts.slice(0, -1)) target = target[part] ||= {}; delete target[parts.at(-1)]; return Response.json({}); } if (options.method === 'PUT' || options.method === 'PATCH') { writes += 1; const body = JSON.parse(options.body || 'null'); let target = root, parts = path.split('/'); for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (options.method === 'PUT') target[parts.at(-1)] = body; return Response.json(body); } let value = root; for (const part of path ? path.split('/') : []) value = value?.[part]; return new Response(JSON.stringify(value ?? null), { headers: { 'Content-Type': 'application/json', ETag: 'fixture-etag' } }); };
async function verify(auth, pin) { const request = new Request('https://worker.test/api/loyalty/verify-pin-for-reveal', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }
async function reveal(auth) { const request = new Request('https://worker.test/api/loyalty/reveal-pin', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: '{}' }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }
async function login(membershipNumber, pin) { const request = new Request('https://worker.test/api/loyalty/login', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'application/json' }, body: JSON.stringify({ membershipNumber, pin }) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }

let loginResult = await login('101-1', '5678');
assert.equal(loginResult.status, 200);
assert.equal(typeof loginResult.body.token, 'string');
assert.equal('pin' in loginResult.body, false);

let direct = await reveal(token('member-1', '101-1'));
assert.equal(direct.status, 200);
assert.equal(direct.body.available, true);
assert.equal(direct.body.pin, '5678');
assert.equal('pinCiphertext' in direct.body, false);

const legacyHash = root.loyalty_credentials['101-3'].pinHash;
direct = await reveal(token('member-3', '101-3'));
assert.equal(direct.status, 200);
assert.equal(direct.body.available, true);
assert.equal(direct.body.pin, '1357');
assert.equal(root.loyalty_credentials['101-3'].pinHash, legacyHash);
assert.equal(typeof root.loyalty_credentials['101-3'].pinCiphertext, 'string');

direct = await reveal(token('member-2', '101-2'));
assert.equal(direct.status, 200);
assert.equal(direct.body.available, false);
assert.equal('pin' in direct.body, false);

direct = await reveal(token('member-2', '101-1'));
assert.equal(direct.status, 200);
assert.equal(direct.body.available, false);
assert.equal('pin' in direct.body, false);

direct = await reveal(token('member-1', '101-1', Math.floor(Date.now() / 1000) - 1));
assert.equal(direct.status, 401);
assert.equal(direct.body.error, 'AUTH_INVALID');

let result = await verify(token('member-1', '101-1'), '5678');
assert.equal(result.status, 200);
assert.equal(result.body.verified, true);
assert.equal('pin' in result.body, false);
assert.equal('pinHash' in result.body, false);
assert.equal('salt' in result.body, false);
assert.equal(writes, 2);

const beforeHash = root.loyalty_credentials['101-2'].pinHash;
result = await verify(token('member-2', '101-2'), '2468');
assert.equal(result.status, 200);
assert.equal(result.body.activated, true);
assert.equal(root.loyalty_credentials['101-2'].pinHash, beforeHash);
assert.equal((await reveal(token('member-2', '101-2'))).body.pin, '2468');

async function adminReveal(auth, membership) { const request = new Request('https://worker.test/api/admin/loyalty/reveal-pin', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ membership }) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }
let adminResult = await adminReveal(token('admin-1'), '101-2');
assert.equal(adminResult.status, 200);
assert.equal(adminResult.body.pin, '2468');
assert.equal(Object.values(root.loyalty_logs || {}).some(log => log.type === 'PIN_REVEALED' && log.actorUid === 'admin-1' && log.actorEmail === 'mohameadalhaear100@gmail.com' && log.membership === '101-2' && !('pin' in log)), true);
adminResult = await adminReveal(token('member-1'), '101-2');
assert.equal(adminResult.status, 403);
adminResult = await adminReveal(token('admin-2'), '101-2');
assert.equal(adminResult.status, 403);
adminResult = await adminReveal(token('admin-1', '', Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000) - 301), '101-2');
assert.equal(adminResult.status, 200);
adminResult = await adminReveal(token('manager-1', '', Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000) - 301), '101-2');
assert.equal(adminResult.status, 200);
assert.equal(adminResult.body.pin, '2468');
root.admins['admin-1'].role = 'manager';
root.admins['admin-1'].permissions = { canRevealMemberPin: false };
adminResult = await adminReveal(token('admin-1'), '101-2');
assert.equal(adminResult.status, 200);
assert.equal(adminResult.body.pin, '2468');
adminResult = await adminReveal(token('manager-2'), '101-2');
assert.equal(adminResult.status, 403);
adminResult = await adminReveal(token('cashier-1'), '101-2');
assert.equal(adminResult.status, 403);
root.admins['manager-1'].permissions.canRevealMemberPin = false;
adminResult = await adminReveal(token('manager-1'), '101-2');
assert.equal(adminResult.status, 403);
adminResult = await adminReveal(token('admin-1'), '101-4');
assert.equal(adminResult.status, 200);
assert.equal(adminResult.body.available, false);
assert.equal('pinCiphertext' in root.loyalty_credentials['101-4'], false);
adminResult = await adminReveal(token('admin-1', '', Math.floor(Date.now() / 1000) - 1), '101-2');
assert.equal(adminResult.status, 401);

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

const auditRequest = new Request('https://worker.test/api/admin/loyalty/pin-reveal-audit', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${token('admin-1')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ repair: true }) });
const auditResponse = await handleLoyaltyRoutes(auditRequest, env, new URL(auditRequest.url));
assert.equal(auditResponse.status, 404);
assert.equal((await auditResponse.json()).error, 'NOT_FOUND');

console.log('loyalty reveal PIN hash ownership fixtures: PASS');
