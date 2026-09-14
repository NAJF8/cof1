import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { handleLoyaltyRoutes } from '../src/loyalty-routes.js';

globalThis.crypto ||= webcrypto;
const encoder = new TextEncoder();
const b64url = value => Buffer.from(value).toString('base64url');
const root = { products: { a: { name: 'Safe fixture' } }, settings: { locale: 'ar' } };
const roles = new Map();
let firebaseCalls = [];
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicJwk = { ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)), kid: 'debug-root-size-fixture' };
const privatePem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.includes('service_accounts/v1/jwk')) return Response.json({ keys: [publicJwk] });
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-service-token', expires_in: 3600 });
  if (url.includes('coffee-30fa7-default-rtdb.firebaseio.com')) {
    firebaseCalls.push({ url, method: options.method || 'GET' });
    const path = new URL(url).pathname.replace(/\.json$/, '').replace(/^\//, '');
    if (path === 'admins/staff-uid') return Response.json({ role: roles.get('staff-uid') || 'cashier', status: 'active' });
    if (path === '') return Response.json(root);
  }
  throw new Error(`Unexpected fixture request: ${url}`);
};
const idToken = async () => {
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: publicJwk.kid })));
  const payload = b64url(encoder.encode(JSON.stringify({ sub: 'staff-uid', aud: 'coffee-30fa7', iss: 'https://securetoken.google.com/coffee-30fa7', iat: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 3600, email: 'staff@example.com', email_verified: true })));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(signature)}`;
};
const env = { ALLOWED_ORIGINS: 'https://najf8.github.io', FIREBASE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.com', FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: privatePem, FIREBASE_DATABASE_URL: 'https://coffee-30fa7-default-rtdb.firebaseio.com' };
const request = async (method, token) => handleLoyaltyRoutes(new Request('https://worker.test/api/admin/debug/root-size', { method, headers: { Origin: 'https://najf8.github.io', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }), env, new URL('https://worker.test/api/admin/debug/root-size'));

test('root-size diagnostics enforce auth and super_admin role', async () => {
  assert.equal((await request('GET', null)).status, 401);
  const token = await idToken();
  roles.set('staff-uid', 'manager');
  assert.equal((await request('GET', token)).status, 403);
  roles.set('staff-uid', 'super_admin');
  firebaseCalls = [];
  const result = await request('GET', token);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, sizeBytes: encoder.encode(JSON.stringify(root)).byteLength, sizeMB: Number((encoder.encode(JSON.stringify(root)).byteLength / 1024 / 1024).toFixed(3)), topLevelKeys: 2 });
  assert.deepEqual(firebaseCalls.map(call => call.method), ['GET', 'GET']);
  assert.ok(firebaseCalls.some(call => call.url.endsWith('/.json')));
});

test('root-size diagnostics expose only size metadata and allow GET only', async () => {
  roles.set('staff-uid', 'super_admin');
  const token = await idToken();
  const result = await request('POST', token);
  assert.equal(result.status, 404);
  assert.deepEqual(await result.json(), { ok: false, error: 'NOT_FOUND' });
});
