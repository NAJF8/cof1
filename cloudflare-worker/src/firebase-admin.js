const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATABASE_SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/firebase.database';
const DATABASE_SCOPE_FLAGS = { firebaseDatabase: DATABASE_SCOPES.includes('https://www.googleapis.com/auth/firebase.database'), userinfoEmail: DATABASE_SCOPES.includes('https://www.googleapis.com/auth/userinfo.email') };
let tokenCache = { accessToken: '', expiresAt: 0 };

function base64Url(bytes) { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function jsonPart(value) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function privateKeyBytes(value) { const normalized = String(value || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, ''); const binary = atob(normalized); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function serviceAccountToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60) {
    console.info({ tag: 'FIREBASE_OAUTH_TOKEN', created: false, cached: true, scopes: DATABASE_SCOPE_FLAGS });
    return tokenCache.accessToken;
  }
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
  console.info({ tag: 'FIREBASE_OAUTH_TOKEN', created: true, cached: false, scopes: DATABASE_SCOPE_FLAGS });
  return tokenCache.accessToken;
}
function firebaseErrorDetails(text, fallbackCode) {
  try {
    const value = JSON.parse(text || '{}');
    const raw = typeof value?.error === 'object' ? value.error : value;
    return { firebaseErrorCode: raw?.code || fallbackCode || null, firebaseErrorMessage: typeof raw?.message === 'string' ? raw.message.slice(0, 160) : null };
  } catch {
    return { firebaseErrorCode: fallbackCode || null, firebaseErrorMessage: null };
  }
}
function firebasePayloadDiagnostics(updates, includeGroups = true) {
  const counts = { undefined: 0, nan: 0, infinity: 0, bigint: 0, dateObjects: 0, otherInvalidTypes: 0 };
  const invalidPaths = [], paths = Object.keys(updates || {}), seen = new Map(), collisions = [], visitedObjects = new WeakSet();
  const forbidden = /[.#$\[\]]/;
  const visit = (value, path) => {
    if (value === undefined) { counts.undefined += 1; return; }
    if (typeof value === 'number' && Number.isNaN(value)) { counts.nan += 1; return; }
    if (typeof value === 'number' && !Number.isFinite(value)) { counts.infinity += 1; return; }
    if (typeof value === 'bigint') { counts.bigint += 1; return; }
    if (value instanceof Date) { counts.dateObjects += 1; return; }
    if (typeof value === 'function' || typeof value === 'symbol') { counts.otherInvalidTypes += 1; return; }
    if (value && typeof value === 'object') {
      if (visitedObjects.has(value)) return;
      visitedObjects.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (!key || forbidden.test(key)) invalidPaths.push(`${path}.${key}`);
        visit(child, `${path}.${key}`);
      }
    }
  };
  for (const [path, value] of Object.entries(updates || {})) {
    const segments = String(path).split('/');
    if (!path || segments.some(segment => !segment) || segments.some(segment => forbidden.test(segment))) invalidPaths.push(path);
    visit(value, path);
    const normalized = segments.join('/');
    for (const existing of seen.keys()) {
      if (normalized === existing || normalized.startsWith(`${existing}/`) || existing.startsWith(`${normalized}/`)) {
        if (normalized !== existing) collisions.push([existing, normalized]);
      }
    }
    seen.set(normalized, true);
  }
  let serialization = { status: 'PASS', serializedSize: 0, topLevelKeyCount: paths.length };
  try {
    const serialized = JSON.stringify(updates);
    const parsed = JSON.parse(serialized);
    serialization = { status: Object.keys(parsed || {}).length === paths.length ? 'PASS' : 'FAIL', serializedSize: new TextEncoder().encode(serialized).byteLength, topLevelKeyCount: Object.keys(parsed || {}).length };
  } catch (error) {
    serialization = { status: 'FAIL', serializedSize: null, topLevelKeyCount: paths.length, error: String(error?.message || error).slice(0, 200) };
  }
  const report = { totalUpdatePaths: paths.length, invalidPaths, parentChildCollisions: collisions, counts, serialization };
  if (includeGroups) {
    const groups = {
      A_request_updates: path => path.startsWith('subscription_requests/'),
      B_customer: path => path.startsWith('subscription_customers/'),
      C_subscription: path => path.startsWith('subscriptions/'),
      D_counter: path => path === 'subscription_counter',
      E_pin_index: path => path.startsWith('subscription_pin_index/'),
      F_audit_logs: path => path.startsWith('subscription_activation_logs/') || path.startsWith('subscription_logs/')
    };
    report.groups = Object.fromEntries(Object.entries(groups).map(([name, matches]) => [name, firebasePayloadDiagnostics(Object.fromEntries(paths.filter(matches).map(path => [path, updates[path]])), false)]));
  }
  return report;
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
  const etag = response.headers.get('ETag');
  console.info({ tag: 'FIREBASE_ROOT_READ', status: response.status, hasEtag: Boolean(etag) });
  if (!response.ok) {
    console.error({ tag: 'FIREBASE_ROOT_READ_FAILED', status: response.status, ...firebaseErrorDetails(text, `FIREBASE_${response.status}`) });
    throw new Error(`FIREBASE_${response.status}`);
  }
  if (!etag) throw new Error('FIREBASE_ETAG_MISSING');
  return { data, etag };
}
async function firebaseAdminConditionalPut(env, path, body, etag) {
  const base = String(env.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
  const response = await fetch(`${base}/${String(path).replace(/^\//, '')}.json`, { method: 'PUT', headers: { Authorization: `Bearer ${await serviceAccountToken(env)}`, 'Content-Type': 'application/json', Accept: 'application/json', 'If-Match': etag }, body: JSON.stringify(body) });
  const text = await response.text();
  if (response.status === 412) throw new Error('FIREBASE_ETAG_CONFLICT');
  if (!response.ok) throw new Error(`FIREBASE_${response.status}`);
  return text ? JSON.parse(text) : null;
}
function cloneJsonValue(value) { return JSON.parse(JSON.stringify(value)); }
function setMergedPath(root, path, value) {
  const parts = String(path).split('/').filter(Boolean);
  if (!parts.length) throw new Error('FIREBASE_PAYLOAD_INVALID');
  let target = root;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  const leaf = parts.at(-1);
  if (value === null) delete target[leaf]; else target[leaf] = cloneJsonValue(value);
}
function mergeFirebaseUpdates(rootSnapshot, updates) {
  const mergedRoot = rootSnapshot === null ? {} : cloneJsonValue(rootSnapshot);
  if (!mergedRoot || typeof mergedRoot !== 'object' || Array.isArray(mergedRoot)) throw new Error('FIREBASE_ROOT_INVALID');
  for (const [path, value] of Object.entries(updates)) setMergedPath(mergedRoot, path, value);
  return mergedRoot;
}
function validateMergedRoot(rootSnapshot, mergedRoot, updates, maxRootBytes) {
  if (!mergedRoot || typeof mergedRoot !== 'object' || Array.isArray(mergedRoot)) throw new Error('FIREBASE_ROOT_INVALID');
  const originalKeys = rootSnapshot && typeof rootSnapshot === 'object' && !Array.isArray(rootSnapshot) ? Object.keys(rootSnapshot) : [];
  const explicitTopLevelDeletes = new Set(Object.entries(updates).filter(([path, value]) => value === null && !path.includes('/')).map(([path]) => path));
  const mergedKeys = new Set(Object.keys(mergedRoot));
  if (originalKeys.some(key => !mergedKeys.has(key) && !explicitTopLevelDeletes.has(key))) throw new Error('FIREBASE_ROOT_GUARD_FAILED');
  let serialized;
  try {
    serialized = JSON.stringify(mergedRoot);
    if (typeof serialized !== 'string') throw new Error('root serialization returned no string');
    JSON.parse(serialized);
  } catch {
    throw new Error('FIREBASE_ROOT_SERIALIZATION_FAILED');
  }
  const bytes = new TextEncoder().encode(serialized).byteLength;
  console.info({ tag: 'FIREBASE_ROOT_SIZE', bytes, megabytes: Number((bytes / 1024 / 1024).toFixed(3)) });
  if (Number.isFinite(maxRootBytes) && bytes > maxRootBytes) throw new Error('FIREBASE_ROOT_TOO_LARGE');
  return serialized;
}
async function firebaseAdminAtomicPatch(env, plan, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts) || 8, 20));
  const read = options.read || ((currentEnv) => firebaseAdminReadWithEtag(currentEnv, ''));
  const maxRootBytes = Number.isFinite(Number(options.maxRootBytes)) ? Number(options.maxRootBytes) : 10 * 1024 * 1024;
  const write = options.write || (async (currentEnv, mergedRoot, etag, retry, writeOptions) => {
    const base = String(currentEnv.FIREBASE_DATABASE_URL || 'https://coffee-30fa7-default-rtdb.firebaseio.com').replace(/\/$/, '');
    const response = await fetch(`${base}/.json`, { method: 'PUT', headers: { Authorization: `Bearer ${await serviceAccountToken(currentEnv)}`, 'Content-Type': 'application/json', Accept: 'application/json', 'If-Match': etag }, body: JSON.stringify(mergedRoot) });
    const text = await response.text();
    console.info({ tag: 'FIREBASE_ROOT_PUT', status: response.status, retry });
    if (response.status === 412) {
      console.error({ tag: 'FIREBASE_ROOT_PUT_CONFLICT', status: response.status, retry, stage: writeOptions.stage || 'ATOMIC_PATCH', requestId: writeOptions.requestId || null });
      throw new Error('FIREBASE_ETAG_CONFLICT');
    }
    if (!response.ok) {
      console.error({ tag: 'FIREBASE_ROOT_PUT_FAILED', status: response.status, ...firebaseErrorDetails(text, `FIREBASE_${response.status}`), stage: writeOptions.stage || 'ATOMIC_PATCH', requestId: writeOptions.requestId || null });
      throw new Error(`FIREBASE_${response.status}`);
    }
    return text ? JSON.parse(text) : null;
  });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await read(env);
    const decision = await plan(snapshot.data || {});
    if (decision?.replay) return decision.result;
    if (!decision?.updates || typeof decision.result === 'undefined') throw new Error('FIREBASE_ATOMIC_PLAN_INVALID');
    const diagnostics = firebasePayloadDiagnostics(decision.updates);
    console.info({ tag: 'FIREBASE_PAYLOAD_DIAGNOSTICS', requestId: options.requestId || null, stage: options.stage || 'PAYLOAD_OK', paths: Object.fromEntries(Object.entries(decision.updates).map(([path, value]) => [path, value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value])), ...diagnostics });
    if (diagnostics.invalidPaths.length || diagnostics.parentChildCollisions.length || diagnostics.serialization.status !== 'PASS' || Object.values(diagnostics.counts).some(Number)) throw Error('FIREBASE_PAYLOAD_INVALID');
    const mergedRoot = mergeFirebaseUpdates(snapshot.data, decision.updates);
    const serializedRoot = validateMergedRoot(snapshot.data, mergedRoot, decision.updates, maxRootBytes);
    try {
      await write(env, options.write ? mergedRoot : JSON.parse(serializedRoot), snapshot.etag, attempt, options);
      return decision.result;
    } catch (error) {
      if (error?.message !== 'FIREBASE_ETAG_CONFLICT' || attempt === attempts - 1) throw error;
    }
  }
  throw new Error('FIREBASE_ETAG_CONFLICT');
}
export { firebaseAdminRequest, firebaseAdminReadWithEtag, firebaseAdminConditionalPut, firebaseAdminAtomicPatch, firebasePayloadDiagnostics, serviceAccountToken };
