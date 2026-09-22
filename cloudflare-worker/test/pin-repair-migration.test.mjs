import assert from 'node:assert/strict';
import { createPrivateKey, createSign, generateKeyPairSync } from 'node:crypto';
import { createCredential, decryptPin, encryptPin, timingSafePinMatch } from '../src/loyalty-security.js';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }));
const env = { ALLOWED_ORIGINS: 'https://101coffees.com', FIREBASE_DATABASE_URL: 'https://fixture.firebaseio.test', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.test', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: key.export({ type: 'pkcs8', format: 'pem' }), LOYALTY_PIN_PEPPER: 'fixture-pepper', LOYALTY_PIN_REVEAL_KEY: 'fixture-reveal-key', PIN_BACKUP_ENCRYPTION_KEY: 'fixture-backup-key' };
let root = { admins: { admin: { role: 'super_admin', status: 'active' } }, loyalty_customers: { '101-1': { pin: '1111', hearts: 5, uid: 'u1' }, '101-2': { pin: '2222', hearts: 2, uid: 'u2' }, '101-3': { hearts: 3, uid: 'u3' }, '101-4': { hearts: 4, uid: 'u4' }, '101-5': { hearts: 1, uid: 'u5' } }, loyalty_credentials: { '101-3': await (async () => { const credential = await createCredential('3333', env.LOYALTY_PIN_PEPPER); credential.pinCiphertext = await encryptPin('3333', env.LOYALTY_PIN_REVEAL_KEY); return credential; })(), '101-4': await createCredential('4444', env.LOYALTY_PIN_PEPPER) }, loyalty_links: { u1: '101-1', u2: '101-2', u3: '101-3', u4: '101-4', u5: '101-5' } };
const beforeProtected = JSON.stringify(root.loyalty_customers['101-2']);
const publicJwk = publicKey.export({ format: 'jwk' });
function setPath(path, value) { if (!path) { root = value; return; } const parts = path.split('/'); let target = root; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = value; }
function token() { const now = Math.floor(Date.now() / 1000), head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture' })).toString('base64url'), body = Buffer.from(JSON.stringify({ sub: 'admin', aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: now - 2, exp: now + 3600, auth_time: now - 2, email: 'admin@example.test', email_verified: true })).toString('base64url'), signer = createSign('RSA-SHA256'); signer.update(`${head}.${body}`); return `${head}.${body}.${signer.sign(key).toString('base64url')}`; }
globalThis.fetch = async (url, options = {}) => { const address = String(url); if (address.includes('service_accounts/v1/jwk')) return Response.json({ keys: [{ ...publicJwk, kid: 'fixture', alg: 'RS256', use: 'sig' }] }); if (address === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture', expires_in: 3600 }); if (!address.startsWith(env.FIREBASE_DATABASE_URL)) throw Error('unexpected request'); const path = decodeURIComponent(new URL(address).pathname).replace(/^\//, '').replace(/\.json$/, ''); const method = options.method || 'GET'; if (method === 'PUT' || method === 'PATCH') { setPath(path, JSON.parse(options.body)); return Response.json(root, { headers: { ETag: 'fixture-etag' } }); } let value = root; for (const part of path ? path.split('/') : []) value = value?.[part]; return new Response(JSON.stringify(value ?? null), { headers: { 'Content-Type': 'application/json', ETag: 'fixture-etag' } }); };
async function call(mode, runId) { const request = new Request('https://worker.test/api/admin/loyalty/pin-migration', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, runId }) }); const response = await handleLoyaltyRoutes(request, env, new URL(request.url)); return { status: response.status, body: await response.json() }; }

let result = await call('apply');
assert.equal(result.status, 400);
result = await call('dry-run');
assert.equal(result.status, 200); assert.equal(result.body.report.eligible, 2); assert.equal(result.body.report.alreadyEncrypted, 1); assert.equal(result.body.report.hashOnly, 1);
result = await call('backup', 'repair-fixture-001');
assert.equal(result.status, 200); assert.equal(result.body.backupVerified, true); assert.equal(result.body.backedUp, 2); assert.equal(typeof root.loyalty_pin_repair_runs['repair-fixture-001'].backup.ciphertext, 'string');
result = await call('apply', 'repair-fixture-001');
assert.equal(result.status, 200); assert.equal(result.body.processed.migrated, 1); assert.equal(result.body.hasMore, true);
assert.equal(root.loyalty_customers['101-1'].pin, undefined); assert.equal(await timingSafePinMatch('1111', root.loyalty_credentials['101-1'], env.LOYALTY_PIN_PEPPER), true); assert.equal(await decryptPin(root.loyalty_credentials['101-1'].pinCiphertext, env.LOYALTY_PIN_REVEAL_KEY), '1111');
result = await call('apply', 'repair-fixture-001');
assert.equal(result.status, 200); assert.equal(result.body.processed.migrated, 1); assert.equal(result.body.hasMore, false);
for (const membership of ['101-1', '101-2']) { const originalPin = membership === '101-1' ? '1111' : '2222', credential = root.loyalty_credentials[membership]; assert.equal(root.loyalty_customers[membership].pin, undefined); assert.equal(await timingSafePinMatch(originalPin, credential, env.LOYALTY_PIN_PEPPER), true); assert.equal(await decryptPin(credential.pinCiphertext, env.LOYALTY_PIN_REVEAL_KEY), originalPin); }
assert.equal(JSON.stringify(root.loyalty_customers['101-2']).includes('2222'), false); assert.equal(root.loyalty_customers['101-3'].pin, undefined); assert.equal(root.loyalty_credentials['101-4'].pinCiphertext, undefined); assert.equal(root.loyalty_customers['101-5'].pin, undefined); assert.equal(JSON.stringify(root.loyalty_customers['101-2']), beforeProtected.replace('"pin":"2222",', ''));
result = await call('apply', 'repair-fixture-001');
assert.equal(result.status, 200); assert.equal(result.body.processed.migrated, 0); assert.equal(result.body.hasMore, false);
console.log('legacy PIN repair fixture: PASS');
