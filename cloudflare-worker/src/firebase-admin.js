const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATABASE_SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database';
let tokenCache = { accessToken: '', expiresAt: 0 };

function base64Url(bytes) { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function jsonPart(value) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function privateKeyBytes(value) { const normalized = String(value || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, ''); const binary = atob(normalized); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function serviceAccountToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60) return tokenCache.accessToken;
  const email = String(env.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || '');
  if (!email || !privateKey) throw new Error('FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED');
  const header = jsonPart({ alg: 'RS256', typ: 'JWT' });
  const claim = jsonPart({ iss: email, scope: DATABASE_SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const signingKey = await crypto.subtle.importKey('pkcs8', privateKeyBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('FIREBASE_OAUTH_TOKEN_FAILED');
  tokenCache = { accessToken: String(data.access_token), expiresAt: now + Math.min(Number(data.expires_in) || 3600, 3600) };
  return tokenCache.accessToken;
}
async function firebaseAdminRequest(env, path, options = {}) {
  const base = String(env.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
  const response = await fetch(`${base}/${String(path).replace(/^\//, '')}.json`, { method: options.method || 'GET', headers: { Authorization: `Bearer ${await serviceAccountToken(env)}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`FIREBASE_${response.status}`);
  return data;
}
async function firebaseAdminReadWithEtag(env, path = '') {
  const base = String(env.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
  const response = await fetch(`${base}/${String(path).replace(/^\//, '')}.json`, { headers: { Authorization: `Bearer ${await serviceAccountToken(env)}`, Accept: 'application/json', 'X-Firebase-ETag': 'true' } });
  const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`FIREBASE_${response.status}`);
  const etag = response.headers.get('ETag');
  if (!etag) throw new Error('FIREBASE_ETAG_MISSING');
  return { data, etag };
}
async function firebaseAdminConditionalPatch(env, updates, etag) {
  const base = String(env.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
  const response = await fetch(`${base}/.json`, { method: 'PATCH', headers: { Authorization: `Bearer ${await serviceAccountToken(env)}`, 'Content-Type': 'application/json', Accept: 'application/json', 'If-Match': etag }, body: JSON.stringify(updates) });
  const text = await response.text();
  if (response.status === 412) throw new Error('FIREBASE_ETAG_CONFLICT');
  if (!response.ok) throw new Error(`FIREBASE_${response.status}`);
  return text ? JSON.parse(text) : null;
}
async function firebaseAdminConditionalPut(env, path, body, etag) {
  const base = String(env.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
  const response = await fetch(`${base}/${String(path).replace(/^\//, '')}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${await serviceAccountToken(env)}`, 'Content-Type': 'application/json', Accept: 'application/json', 'If-Match': etag }, body: JSON.stringify(body) });
  const text = await response.text();
  if (response.status === 412) throw new Error('FIREBASE_ETAG_CONFLICT');
  if (!response.ok) throw new Error(`FIREBASE_${response.status}`);
  return text ? JSON.parse(text) : null;
}
async function firebaseAdminAtomicPatch(env, plan, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts) || 8, 20));
  const read = options.read || ((currentEnv) => firebaseAdminReadWithEtag(currentEnv, ''));
  const write = options.write || ((currentEnv, updates, etag) => firebaseAdminConditionalPatch(currentEnv, updates, etag));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await read(env);
    const decision = await plan(snapshot.data || {});
    if (decision?.replay) return decision.result;
    if (!decision?.updates || typeof decision.result === 'undefined') throw new Error('FIREBASE_ATOMIC_PLAN_INVALID');
    try {
      await write(env, decision.updates, snapshot.etag);
      return decision.result;
    } catch (error) {
      if (error?.message !== 'FIREBASE_ETAG_CONFLICT' || attempt === attempts - 1) throw error;
    }
  }
  throw new Error('FIREBASE_ETAG_CONFLICT');
}
export { firebaseAdminRequest, firebaseAdminReadWithEtag, firebaseAdminConditionalPatch, firebaseAdminConditionalPut, firebaseAdminAtomicPatch, serviceAccountToken };
