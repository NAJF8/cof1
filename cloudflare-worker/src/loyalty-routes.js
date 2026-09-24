import * as security from './loyalty-security.js';
import { firebaseAdminRequest, firebaseAdminReadWithEtag, firebaseAdminConditionalPut, firebaseAdminAtomicPatch } from './firebase-admin.js';
import { planGiftDecision, planGiftRedemption } from './gift-delivery.js';

const PROJECT_ID = 'coffee-30fa7';
const SUPER_ADMIN_EMAIL = 'mohameadalhaear100@gmail.com';
const PROVISION_BUILD = 'provision-google-stages-v3';
const requestContext = new WeakMap();
function provisionRequestId(request) {
  if (!requestContext.has(request)) {
    const supplied = String(request.headers.get('X-Request-Id') || '').trim();
    const requestId = /^[A-Za-z0-9._:-]{1,120}$/.test(supplied) ? supplied : crypto.randomUUID();
    requestContext.set(request, { requestId, stage: 'REQUEST_RECEIVED' });
  }
  return requestContext.get(request);
}
function setProvisionRequestStage(request, stage) {
  const context = provisionRequestId(request);
  context.stage = stage;
  return context;
}
const MAX_BODY = 16 * 1024;
const MAX_REDEMPTION_DESCRIPTION_LENGTH = 120;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSHOP_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BACKGROUND_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_BACKGROUND_POSTER_BYTES = 2 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const WORKSHOP_IMAGE_TYPES = PRODUCT_IMAGE_TYPES;
const BACKGROUND_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const PRODUCT_IMAGE_RATE_LIMIT = 30;
const PRODUCT_IMAGE_RATE_WINDOW_MS = 10 * 60 * 1000;
const productImageRateBuckets = new Map();
let publicKeys = { expiresAt: 0, value: {} };
let customTokenKey = { fingerprint: '', value: null };

function origins(env) { return String(env.ALLOWED_ORIGINS || 'https://najf8.github.io').split(',').map(x => x.trim()).filter(Boolean); }
function cors(request, env) { const origin = request.headers.get('Origin'); return origin && origins(env).includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Cache-Control': 'no-store', Vary: 'Origin' } : null; }
function response(request, env, body, status = 200) {
  const provisionPath = new URL(request.url).pathname === '/api/loyalty/provision-google';
  const context = provisionPath ? provisionRequestId(request) : null;
  const payload = provisionPath && body && typeof body === 'object' && !Array.isArray(body) ? { ...body, requestId: body.requestId || context.requestId, ...(body.stage ? {} : { stage: context.stage }) } : body;
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(provisionPath ? { 'X-Request-ID': context.requestId, 'X-Worker-Build': String(env.WORKER_BUILD || PROVISION_BUILD) } : {}), ...(cors(request, env) || {}) } });
}
function fail(request, env, error, status) { return response(request, env, { ok: false, error }, status); }
function pinRevealAuthorizationFailure(request, env, error, status, stage) { return response(request, env, { ok: false, error, stage }, status); }
function loginRequestId() { return crypto.randomUUID(); }
function loginFailure(request, env, requestId, stage, code, status) { console.warn('[LOYALTY_LOGIN_FAILURE]', { requestId, stage, code }); return response(request, env, { ok: false, error: code, requestId }, status); }
function giftDiagnostic(marker, details = {}) { console.info(marker, details); }
function giftId(value) { const id = String(value || '').trim(); return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : ''; }
function firebaseHttpStatus(error) { const match = String(error?.message || '').match(/^FIREBASE_(\d{3})$/); return match ? Number(match[1]) : null; }
const SUBSCRIPTION_DIAGNOSTIC_STAGES = new Set(['START', 'AUTH_START', 'AUTH_OK', 'ROLE_START', 'ROLE_OK', 'REQUEST_READ_START', 'REQUEST_READ_OK', 'REQUEST_VALIDATE_START', 'REQUEST_VALIDATE_OK', 'PLAN_READ_START', 'PLAN_READ_OK', 'PLAN_VALIDATE_START', 'PLAN_VALIDATE_OK', 'PHONE_VALIDATE_START', 'PHONE_VALIDATE_OK', 'UID_RESOLVE_START', 'UID_RESOLVE_OK', 'ROOT_READ_START', 'ROOT_READ_OK', 'ETAG_OK', 'COUNTER_READ_OK', 'CLUB_NUMBER_OK', 'PIN_GENERATE_OK', 'CREDENTIAL_PREPARE_START', 'CREDENTIAL_PEPPER_OK', 'CREDENTIAL_HASH_START', 'CREDENTIAL_HASH_OK', 'CRED_RANDOM_START', 'CRED_RANDOM_OK', 'CRED_SALT_ENCODE_START', 'CRED_SALT_ENCODE_OK', 'CRED_IMPORT_KEY_START', 'CRED_IMPORT_KEY_OK', 'CRED_SALT_DECODE_START', 'CRED_SALT_DECODE_OK', 'CRED_DERIVE_START', 'CRED_DERIVE_OK', 'CRED_HASH_ENCODE_START', 'CRED_HASH_ENCODE_OK', 'CRED_OBJECT_BUILD_START', 'CRED_OBJECT_BUILD_OK', 'CUSTOMER_BUILD_OK', 'SUBSCRIPTION_BUILD_OK', 'INDEX_BUILD_OK', 'ROOT_MERGE_OK', 'ATOMIC_PUT_START', 'ATOMIC_PUT_OK', 'RESPONSE_BUILD_OK']);
const SUBSCRIPTION_SAFE_CODES = new Set(['AUTH_FAILED', 'ROLE_FAILED', 'REQUEST_READ_FAILED', 'REQUEST_INVALID', 'PLAN_READ_FAILED', 'PLAN_INVALID', 'PHONE_INVALID', 'UID_RESOLVE_FAILED', 'ROOT_READ_FAILED', 'ETAG_MISSING', 'PIN_HASH_FAILED', 'ATOMIC_PUT_FAILED', 'UNKNOWN']);
function subscriptionDiagnosticStage(stage) { return SUBSCRIPTION_DIAGNOSTIC_STAGES.has(stage) ? stage : 'START'; }
function subscriptionDiagnosticCode(stage, error) {
  const raw = String(error?.message || '');
  if (raw === 'FIREBASE_ETAG_MISSING') return 'ETAG_MISSING';
  if (stage.startsWith('AUTH_')) return 'AUTH_FAILED';
  if (stage.startsWith('ROLE_')) return 'ROLE_FAILED';
  if (stage === 'REQUEST_READ_START') return 'REQUEST_READ_FAILED';
  if (stage.startsWith('REQUEST_VALIDATE')) return 'REQUEST_INVALID';
  if (stage.startsWith('PLAN_READ')) return 'PLAN_READ_FAILED';
  if (stage.startsWith('PLAN_VALIDATE')) return 'PLAN_INVALID';
  if (stage.startsWith('PHONE_VALIDATE')) return 'PHONE_INVALID';
  if (stage.startsWith('UID_RESOLVE')) return 'UID_RESOLVE_FAILED';
  if (stage === 'ROOT_READ_START') return 'ROOT_READ_FAILED';
  if (stage.startsWith('PIN_') || stage === 'CREDENTIAL_HASH_OK' || stage.startsWith('CRED_')) return 'PIN_HASH_FAILED';
  if (stage.startsWith('ATOMIC_PUT') || raw === 'FIREBASE_ETAG_CONFLICT') return 'ATOMIC_PUT_FAILED';
  return SUBSCRIPTION_SAFE_CODES.has(raw) ? raw : 'UNKNOWN';
}
function subscriptionActivationFailure(request, env, stage, error) {
  const safeStage = subscriptionDiagnosticStage(stage);
  const safeCode = subscriptionDiagnosticCode(safeStage, error);
  const diagnostic = { ok: false, error: 'INTERNAL_SERVER_ERROR', stage: safeStage, code: safeCode };
  if (safeStage === 'CRED_DERIVE_START' || error?.cryptoErrorName) diagnostic.cryptoErrorName = security.safeCredentialCryptoErrorName(error?.cryptoErrorName);
  if (error?.firebaseOp === 'GET' || error?.firebaseOp === 'PUT') diagnostic.firebaseOp = error.firebaseOp;
  if (Number.isInteger(error?.firebaseStatus)) diagnostic.firebaseStatus = error.firebaseStatus;
  return response(request, env, diagnostic, 500);
}
async function body(request) { const type = request.headers.get('Content-Type') || ''; if (!type.toLowerCase().includes('application/json')) throw Error('INVALID_CONTENT_TYPE'); const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw Error('PAYLOAD_TOO_LARGE'); const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_JSON'); return value; }
function b64(value) { let text = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); while (text.length % 4) text += '='; return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
function b64url(bytes) { let text = ''; for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function jsonPart(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function pemBytes(value) { return b64(String(value).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '')); }
async function signingKeys() { if (publicKeys.expiresAt > Date.now() && Object.keys(publicKeys.value).length) return publicKeys.value; const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'); if (!r.ok) throw Error('AUTH_KEYS_UNAVAILABLE'); const value = {}; for (const key of (await r.json()).keys || []) if (key.kid) value[key.kid] = key; publicKeys = { value, expiresAt: Date.now() + 300000 }; return value; }
async function verifyIdToken(token) { const parts = String(token || '').split('.'); if (parts.length !== 3) throw Error('AUTH_INVALID'); let header, claims; try { header = JSON.parse(new TextDecoder().decode(b64(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64(parts[1]))); } catch { throw Error('AUTH_INVALID'); } const jwk = (await signingKeys())[header.kid]; if (header.alg !== 'RS256' || !jwk) throw Error('AUTH_INVALID'); const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']); if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw Error('AUTH_INVALID'); const now = Math.floor(Date.now() / 1000); if (!claims.sub || claims.aud !== PROJECT_ID || claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` || Number(claims.exp) <= now || Number(claims.iat || 0) > now + 300) throw Error('AUTH_INVALID'); return { uid: String(claims.sub), email: String(claims.email || '').toLowerCase(), emailVerified: claims.email_verified === true, authTime: Number(claims.auth_time || 0), name: String(claims.name || ''), picture: String(claims.picture || '') }; }
async function auth(request) { const header = request.headers.get('Authorization') || ''; if (!header.startsWith('Bearer ')) throw Error('AUTH_REQUIRED'); return verifyIdToken(header.slice(7).trim()); }
async function optionalAuth(request) { const header = request.headers.get('Authorization') || ''; if (!header) return null; if (!header.startsWith('Bearer ')) throw Error('AUTH_INVALID'); return verifyIdToken(header.slice(7).trim()); }
async function customToken(env, uid, membership) { const email = String(env.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim(), privateKey = String(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || ''); if (!email || !privateKey) throw Error('FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED'); const fingerprint = privateKey.slice(0, 24); if (customTokenKey.fingerprint !== fingerprint) customTokenKey = { fingerprint, value: await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']) }; const now = Math.floor(Date.now() / 1000), head = jsonPart({ alg: 'RS256', typ: 'JWT' }), claim = jsonPart({ iss: email, sub: email, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, uid, claims: { loyaltyMembership: membership } }), signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', customTokenKey.value, new TextEncoder().encode(`${head}.${claim}`)); return `${head}.${claim}.${b64url(signature)}`; }
function safeCustomer(membership, customer) { return security.publicProfile(membership, customer); }
function credentialShapeIsUsable(credential) { return Boolean(credential && typeof credential.pinHash === 'string' && typeof credential.salt === 'string' && /^[A-Za-z0-9+/_-]+={0,2}$/.test(credential.pinHash) && /^[A-Za-z0-9+/_-]+={0,2}$/.test(credential.salt)); }
async function createLoyaltyCredential(pin, env, now = Date.now(), onStage) {
  const credential = await security.createCredential(pin, String(env.LOYALTY_PIN_PEPPER || ''), now, onStage);
  const revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!revealKey) throw Error('PIN_REVEAL_KEY_NOT_CONFIGURED');
  credential.pinCiphertext = await security.encryptPin(pin, revealKey);
  return credential;
}
async function chooseUniqueLoyaltyPin(root, pepper) {
  const customers = root.loyalty_customers || {}, credentials = root.loyalty_credentials || {}, indexes = root.loyalty_pin_index || {};
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const pin = security.generatePin(), indexKey = await security.pinIndexKey(pin, pepper);
    if (indexes[indexKey]) continue;
    const legacyCollision = Object.values(customers).some(customer => customer && customer.status !== 'inactive' && customer.deleted !== true && String(customer.pin || '') === pin);
    if (legacyCollision) continue;
    let hashedCollision = false;
    for (const [membership, credential] of Object.entries(credentials)) {
      if (hashedCollision || !customers[membership] || customers[membership].status === 'inactive' || customers[membership].deleted === true || !credentialShapeIsUsable(credential)) continue;
      hashedCollision = await security.timingSafePinMatch(pin, credential, pepper);
    }
    if (!hashedCollision) return { pin, indexKey };
  }
  throw Error('PIN_GENERATION_FAILED');
}
function requestId(payload) { const value = String(payload?.requestId || payload?.idempotencyKey || '').trim(); if (!value) return ''; if (!/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw Error('INVALID_ARGUMENT'); return value; }
export function redemptionDescription(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw Error('INVALID_ARGUMENT');
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/[<>]/.test(clean)) throw Error('INVALID_ARGUMENT');
  if (clean.length > MAX_REDEMPTION_DESCRIPTION_LENGTH) throw Error('INVALID_ARGUMENT');
  return clean || undefined;
}
function operationPath(kind, request) { return request ? `loyalty_operation_requests/${kind}/${encodeURIComponent(request).replace(/%/g, '_')}` : ''; }
function replayOrPlan(root, kind, request) { if (!request) return null; const saved = root.loyalty_operation_requests?.[kind]?.[encodeURIComponent(request).replace(/%/g, '_')]; return saved?.result ? { replay: true, result: saved.result } : null; }
async function atomicPlan(env, plan, diagnostics = {}) { return firebaseAdminAtomicPatch(env, plan, { attempts: 12, ...diagnostics }); }
async function ensurePinLoginLink(env, membership, tokenUid) {
  return atomicPlan(env, root => {
    const customer = root?.loyalty_customers?.[membership];
    if (!customer) throw Error('PROFILE_NOT_FOUND');
    const directUid = String(customer.uid || '').trim();
    if (directUid && directUid !== tokenUid) throw Error('PROFILE_LINK_CONFLICT');
    const links = root?.loyalty_links || {};
    const membershipLinks = Object.entries(links).filter(([, linked]) => security.normalizeMembershipNumber(linked) === membership).map(([uid]) => String(uid || '').trim()).filter(Boolean);
    if (membershipLinks.some(uid => uid !== tokenUid)) throw Error('PROFILE_LINK_CONFLICT');
    if (links[tokenUid] && security.normalizeMembershipNumber(links[tokenUid]) !== membership) throw Error('PROFILE_LINK_CONFLICT');
    const uidMatches = Object.entries(root?.loyalty_customers || {}).filter(([id, value]) => id !== membership && String(value?.uid || '').trim() === tokenUid);
    if (uidMatches.length) throw Error('PROFILE_LINK_CONFLICT');
    const updates = {};
    if (!directUid) updates[`loyalty_customers/${membership}/uid`] = tokenUid;
    if (security.normalizeMembershipNumber(links[tokenUid]) !== membership) updates[`loyalty_links/${tokenUid}`] = membership;
    return { updates, result: { ok: true, linked: true } };
  }, { stage: 'PIN_LOGIN_UID_LINK' });
}
function normalizeStaffRole(value) { const role = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); return role === 'superadmin' ? 'super_admin' : role; }
async function staff(env, current, capability = 'staff') {
  let record = {};
  try { record = await firebaseAdminRequest(env, `admins/${current.uid}`) || {}; } catch (error) { if (!(current.emailVerified && current.email === SUPER_ADMIN_EMAIL)) throw error; }
  const allowlisted = current.emailVerified && current.email === SUPER_ADMIN_EMAIL;
  // The verified server-side Super Admin allowlist is authoritative for this account.
  const role = allowlisted ? 'super_admin' : normalizeStaffRole(record.role);
  const bootstrap = capability === 'provision-super-admin' && allowlisted;
  if (record.status !== 'active' && !allowlisted && !bootstrap) throw Error('FORBIDDEN');
  const permissions = record.permissions || {};
  const full = ['super_admin', 'admin', 'manager'].includes(role);
  const cashier = role === 'cashier' && ['search', 'adjust', 'redeem', 'consume', 'redeem-gift', 'manage-gifts'].includes(capability);
  const permitted = full || cashier || permissions[capability] === true || bootstrap;
  if (!permitted || (capability === 'delete' || capability === 'provision-super-admin') && role !== 'super_admin' && !bootstrap) throw Error('FORBIDDEN');
  if (bootstrap) await firebaseAdminRequest(env, `admins/${current.uid}`, { method: 'PATCH', body: { email: current.email, role: 'super_admin', status: 'active', displayName: current.name || 'Super Admin', addedBy: 'server', addedAt: Date.now() } });
  return { record, role };
}
function productImageType(bytes) { if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'; if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return 'image/png'; if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'; return ''; }
function ascii(bytes, start, end) { return String.fromCharCode(...bytes.slice(start, end)); }
function backgroundVideoType(bytes) {
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'MSNV', '3gp4', '3g2a', 'qt  ']).has(ascii(bytes, 8, 12))) return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && ascii(bytes, 0, Math.min(bytes.length, 128)).includes('webm')) return 'video/webm';
  return '';
}
function backgroundPosterType(bytes) {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' ? 'image/webp' : '';
}
function videoExtension(name) { const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return match?.[1] || ''; }
function consumeProductImageRate(uid) { const now = Date.now(), current = productImageRateBuckets.get(uid); if (!current || now >= current.resetAt) { productImageRateBuckets.set(uid, { count: 1, resetAt: now + PRODUCT_IMAGE_RATE_WINDOW_MS }); return true; } if (current.count >= PRODUCT_IMAGE_RATE_LIMIT) return false; current.count += 1; return true; }
function productImageId(value) { const id = String(value || '').trim(); return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : 'unknown'; }
function workshopImageId(value) { const id = String(value || '').trim(); return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : 'new'; }
function base64Bytes(bytes) { let output = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) output += String.fromCharCode(...bytes.slice(offset, offset + 0x8000)); return btoa(output); }
async function githubContentsUpload(env, path, bytes, message, userAgent) { const token = String(env.GITHUB_PRODUCT_IMAGES_TOKEN || '').trim(); if (!token) throw Error('GITHUB_UPLOAD_NOT_CONFIGURED'); const github = await fetch(`https://api.github.com/repos/NAJF8/cof1/contents/${path}`, { method: 'PUT', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': userAgent, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, content: base64Bytes(bytes), branch: 'main' }) }); if (!github.ok) throw Error('GITHUB_UPLOAD_FAILED'); }
async function uploadProductImage(request, env, current) { await staff(env, current, 'manage-products'); if (!consumeProductImageRate(current.uid)) throw Error('IMAGE_RATE_LIMITED'); const form = await request.formData(), file = form.get('image'); if (!file || typeof file.arrayBuffer !== 'function') throw Error('IMAGE_REQUIRED'); if (Number(file.size) > MAX_PRODUCT_IMAGE_BYTES) throw Error('IMAGE_TOO_LARGE'); const bytes = new Uint8Array(await file.arrayBuffer()), type = String(file.type || '').toLowerCase(); if (!PRODUCT_IMAGE_TYPES.has(type) || productImageType(bytes) !== type) throw Error('IMAGE_TYPE_UNSUPPORTED'); const extension = type === 'image/jpeg' ? 'jpg' : type.slice(6), productId = productImageId(form.get('productId')), random = crypto.randomUUID().replace(/-/g, ''), filename = `product-${productId}-${Date.now()}-${random}.${extension}`, path = `assets/products/${filename}`; try { await githubContentsUpload(env, path, bytes, 'chore: upload product image', '101-coffee-product-image-uploader'); } catch (error) { if (error.message === 'GITHUB_UPLOAD_NOT_CONFIGURED') throw Error('IMAGE_STORAGE_NOT_CONFIGURED'); throw Error('IMAGE_UPLOAD_FAILED'); } return response(request, env, { success: true, imageUrl: `https://101coffees.com/assets/products/${encodeURIComponent(filename)}`, path }); }
async function uploadWorkshopImage(request, env, current) { await staff(env, current, 'manage-settings'); if (!consumeProductImageRate(current.uid)) throw Error('IMAGE_RATE_LIMITED'); const form = await request.formData(), file = form.get('image'); if (!file || typeof file.arrayBuffer !== 'function') throw Error('IMAGE_REQUIRED'); if (Number(file.size) > MAX_WORKSHOP_IMAGE_BYTES) throw Error('IMAGE_TOO_LARGE'); const bytes = new Uint8Array(await file.arrayBuffer()), type = String(file.type || '').toLowerCase(); if (!WORKSHOP_IMAGE_TYPES.has(type) || productImageType(bytes) !== type) throw Error('IMAGE_TYPE_UNSUPPORTED'); const extension = type === 'image/jpeg' ? 'jpg' : type.slice(6), eventId = workshopImageId(form.get('eventId')), random = crypto.randomUUID().replace(/-/g, ''), filename = `workshop-${eventId}-${Date.now()}-${random}.${extension}`, path = `assets/workshops/${filename}`; try { await githubContentsUpload(env, path, bytes, 'chore: upload workshop image', '101-coffee-workshop-image-uploader'); } catch (error) { if (error.message === 'GITHUB_UPLOAD_NOT_CONFIGURED') throw Error('IMAGE_STORAGE_NOT_CONFIGURED'); throw Error('IMAGE_UPLOAD_FAILED'); } return response(request, env, { success: true, imageUrl: `https://101coffees.com/${path}`, path }); }
async function uploadBackgroundVideo(request, env, current) { await staff(env, current, 'manage-settings'); const file = (await request.formData()).get('video'); if (!file || typeof file.arrayBuffer !== 'function') throw Error('VIDEO_REQUIRED'); const type = String(file.type || '').toLowerCase(), extension = videoExtension(file.name); if (Number(file.size) > MAX_BACKGROUND_VIDEO_BYTES) throw Error('VIDEO_TOO_LARGE'); if (!BACKGROUND_VIDEO_TYPES.has(type) || (type === 'video/mp4' && extension !== 'mp4') || (type === 'video/webm' && extension !== 'webm')) throw Error('VIDEO_TYPE_UNSUPPORTED'); const bytes = new Uint8Array(await file.arrayBuffer()); if (backgroundVideoType(bytes) !== type) throw Error('VIDEO_TYPE_UNSUPPORTED'); const safeExtension = type === 'video/mp4' ? 'mp4' : 'webm', filename = `bg_video_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}.${safeExtension}`, path = `assets/backgrounds/${filename}`; try { await githubContentsUpload(env, path, bytes, 'chore: upload background video', '101-coffee-background-video-uploader'); } catch (error) { if (error.message === 'GITHUB_UPLOAD_NOT_CONFIGURED') throw Error('VIDEO_STORAGE_NOT_CONFIGURED'); throw Error('VIDEO_UPLOAD_FAILED'); } return response(request, env, { ok: true, url: `https://101coffees.com/${path}`, path }); }
async function uploadBackgroundPoster(request, env, current) { await staff(env, current, 'manage-settings'); const file = (await request.formData()).get('poster'); if (!file || typeof file.arrayBuffer !== 'function') throw Error('POSTER_REQUIRED'); if (Number(file.size) > MAX_BACKGROUND_POSTER_BYTES) throw Error('POSTER_TOO_LARGE'); const type = String(file.type || '').toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer()); if (type !== 'image/webp' || backgroundPosterType(bytes) !== type) throw Error('POSTER_TYPE_UNSUPPORTED'); const filename = `bg_poster_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}.webp`, path = `assets/backgrounds/posters/${filename}`; try { await githubContentsUpload(env, path, bytes, 'chore: upload background video poster', '101-coffee-background-poster-uploader'); } catch (error) { if (error.message === 'GITHUB_UPLOAD_NOT_CONFIGURED') throw Error('POSTER_STORAGE_NOT_CONFIGURED'); throw Error('POSTER_UPLOAD_FAILED'); } return response(request, env, { ok: true, posterUrl: `https://101coffees.com/${path}`, path }); }
async function login(request, env) {
  const requestId = loginRequestId(); let stage = 'START';
  try {
    stage = 'INPUT_VALIDATION';
    const payload = await body(request), membership = security.normalizeMembershipNumber(payload.membershipNumber), pin = String(payload.pin || ''), pepper = String(env.LOYALTY_PIN_PEPPER || '');
    if (!membership || !security.validPin(pin) || !pepper) return loginFailure(request, env, requestId, stage, 'INVALID_CREDENTIALS', 401);
    stage = 'RATE_LIMIT_READ';
    const key = await security.attemptKey(membership, request.headers.get('CF-Connecting-IP') || 'unknown', pepper), state = await firebaseAdminRequest(env, `loyalty_login_attempts/${key}`) || {}, now = Date.now();
    if (Number(state.lockedUntil) > now || Number(state.failedAttempts) >= security.MAX_FAILURES && now - Number(state.firstFailureAt || 0) < security.WINDOW_MS) return loginFailure(request, env, requestId, stage, 'RATE_LIMITED', 429);
    stage = 'CUSTOMER_CREDENTIAL_READ';
    const [customer, credential] = await Promise.all([firebaseAdminRequest(env, `loyalty_customers/${membership}`), firebaseAdminRequest(env, `loyalty_credentials/${membership}`)]);
    stage = 'UID_LINK_RESOLVE';
    const tokenUid = await resolvePinLoginUid(env, membership, customer);
    if (!tokenUid) return loginFailure(request, env, requestId, stage, 'PROFILE_NOT_FOUND', 404);
    let valid = false, migrated = false;
    stage = 'HASH_VERIFY';
    try { valid = await security.timingSafePinMatch(pin, credential, pepper); } catch { valid = false; }
    const legacyPin = customer?.pin;
    if (!valid && customer && security.validPin(legacyPin) && !credentialShapeIsUsable(credential)) {
      stage = 'LEGACY_VERIFY';
      valid = security.timingSafeEqual(new TextEncoder().encode(pin), new TextEncoder().encode(String(legacyPin)));
      if (valid) {
        stage = 'LEGACY_MIGRATION';
        const nextCredential = await createLoyaltyCredential(pin, env, now);
        await saveCredentialAndRemoveLegacyPin(env, membership, nextCredential);
        migrated = true;
      }
    }
    if (!customer || !valid) {
      const within = Number(state.firstFailureAt) > 0 && now - Number(state.firstFailureAt) < security.WINDOW_MS, failures = within ? Number(state.failedAttempts || 0) + 1 : 1;
      stage = 'FAILURE_RECORD';
      await firebaseAdminRequest(env, `loyalty_login_attempts/${key}`, { method: 'PUT', body: { failedAttempts: failures, firstFailureAt: within ? Number(state.firstFailureAt) : now, lastFailureAt: now, lockedUntil: failures >= security.MAX_FAILURES ? now + security.WINDOW_MS : 0 } });
      return loginFailure(request, env, requestId, stage, failures >= security.MAX_FAILURES ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS', failures >= security.MAX_FAILURES ? 429 : 401);
    }
    stage = 'UID_LINK_WRITE';
    await ensurePinLoginLink(env, membership, tokenUid);
    stage = 'PIN_REVEAL_ENSURE';
    if (credential && !credential.pinCiphertext && String(env.LOYALTY_PIN_REVEAL_KEY || '').trim()) { try { await ensurePinCiphertext(env, membership, credential, pin); } catch (error) { console.warn('[PIN_REVEAL_ENSURE_FAILED]', { stage, code: String(error?.message || 'PIN_REVEAL_WRITE_FAILED').slice(0, 80) }); } }
    stage = 'FIREBASE_AUTH';
    await firebaseAdminRequest(env, `loyalty_login_attempts/${key}`, { method: 'DELETE' });
    const token = await customToken(env, tokenUid, membership);
    console.info('[LOYALTY_LOGIN_SUCCESS]', { requestId, stage, migrated, hasToken: Boolean(token) });
    return response(request, env, { ok: true, token, profile: safeCustomer(membership, customer) });
  } catch (error) {
    if (stage === 'INPUT_VALIDATION' && ['INVALID_CONTENT_TYPE', 'PAYLOAD_TOO_LARGE'].includes(error?.message)) return loginFailure(request, env, requestId, stage, error.message, error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 415);
    if (stage === 'INPUT_VALIDATION' && error?.name === 'SyntaxError') return loginFailure(request, env, requestId, stage, 'REQUEST_FAILED', 400);
    const code = String(error?.message || '').startsWith('FIREBASE_') ? 'FIREBASE_BACKEND_ERROR' : stage === 'UID_LINK_RESOLVE' ? 'UID_LINK_RESOLUTION_FAILED' : stage === 'FIREBASE_AUTH' ? 'FIREBASE_AUTH_FAILED' : stage === 'LEGACY_MIGRATION' ? 'PIN_MIGRATION_FAILED' : stage === 'HASH_VERIFY' || stage === 'LEGACY_VERIFY' ? 'PIN_VERIFICATION_FAILED' : 'LOGIN_BACKEND_ERROR';
    const status = code === 'RATE_LIMITED' ? 429 : code === 'FIREBASE_AUTH_FAILED' || code === 'LOGIN_BACKEND_ERROR' || code === 'FIREBASE_BACKEND_ERROR' || code === 'PIN_MIGRATION_FAILED' ? 500 : 401;
    return loginFailure(request, env, requestId, stage, code, status);
  }
}
async function saveCredentialAndRemoveLegacyPin(env, membership, credential) {
  await firebaseAdminRequest(env, `loyalty_credentials/${membership}`, { method: 'PUT', body: credential });
  const saved = await firebaseAdminRequest(env, `loyalty_credentials/${membership}`);
  if (!saved || saved.pinHash !== credential.pinHash || saved.salt !== credential.salt || saved.algorithm !== credential.algorithm || Number(saved.iterations) !== Number(credential.iterations) || (credential.pinCiphertext && saved.pinCiphertext !== credential.pinCiphertext)) throw Error('CREDENTIAL_WRITE_UNVERIFIED');
  await firebaseAdminRequest(env, `loyalty_customers/${membership}/pin`, { method: 'DELETE' });
}
async function ensurePinCiphertext(env, membership, credential, pin) {
  if (credential?.pinCiphertext) return false;
  const revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!revealKey) return false;
  const latest = await firebaseAdminRequest(env, `loyalty_credentials/${membership}`);
  if (latest?.pinCiphertext) return false;
  if (!latest || latest.pinHash !== credential.pinHash || latest.salt !== credential.salt || Number(latest.iterations) !== Number(credential.iterations)) throw Error('CREDENTIAL_CHANGED');
  const ciphertext = await security.encryptPin(pin, revealKey);
  await firebaseAdminRequest(env, `loyalty_credentials/${membership}/pinCiphertext`, { method: 'PUT', body: ciphertext });
  const saved = await firebaseAdminRequest(env, `loyalty_credentials/${membership}/pinCiphertext`);
  if (saved !== ciphertext) throw Error('PIN_REVEAL_WRITE_UNVERIFIED');
  return true;
}
async function ensureTrustedLegacyPinCiphertext(env, membership, customer, credential) {
  if (credential?.pinCiphertext) return true;
  const legacyPin = String(customer?.pin || '').trim();
  const pepper = String(env.LOYALTY_PIN_PEPPER || '').trim();
  const revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!security.validPin(legacyPin) || !pepper || !revealKey || !credentialShapeIsUsable(credential)) return false;
  if (!await security.timingSafePinMatch(legacyPin, credential, pepper)) return false;
  const latest = await firebaseAdminReadWithEtag(env, `loyalty_credentials/${membership}`);
  const latestCredential = latest.data;
  if (latestCredential?.pinCiphertext) return true;
  if (!credentialShapeIsUsable(latestCredential) || latestCredential.pinHash !== credential.pinHash || latestCredential.salt !== credential.salt || Number(latestCredential.iterations) !== Number(credential.iterations)) return false;
  const ciphertext = await security.encryptPin(legacyPin, revealKey);
  await firebaseAdminConditionalPut(env, `loyalty_credentials/${membership}`, { ...latestCredential, pinCiphertext: ciphertext }, latest.etag);
  const saved = await firebaseAdminRequest(env, `loyalty_credentials/${membership}`);
  if (!saved || saved.pinCiphertext !== ciphertext || saved.pinHash !== latestCredential.pinHash || saved.salt !== latestCredential.salt || Number(saved.iterations) !== Number(latestCredential.iterations)) throw Error('PIN_REVEAL_WRITE_UNVERIFIED');
  return true;
}
function normalizedEmail(value) { return String(value || '').trim().toLowerCase(); }
function cleanText(value, limit) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''; }
function normalizeIraqiPhone(value) {
  const cleaned = String(value || '').trim().replace(/[\s()-]/g, '');
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
  if (/^7\d{9}$/.test(digits)) digits = `964${digits}`;
  return /^9647\d{9}$/.test(digits) ? digits : '';
}
function subscriptionRequestId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{8,120}$/.test(id) ? id : '';
}
function subscriptionRequestName(value) {
  const name = cleanText(value, 120);
  return name.length >= 2 ? name : '';
}
async function requestSubscription(request, env, current) {
  const payload = await body(request);
  const name = subscriptionRequestName(payload.name || payload.customerName);
  const phone = normalizeIraqiPhone(payload.phone);
  const planId = String(payload.planId || '').trim();
  const idempotencyKey = subscriptionRequestId(payload.requestId || payload.idempotencyKey);
  if (!name || !phone || !/^[A-Za-z0-9_-]{1,80}$/.test(planId)) throw Error('INVALID_ARGUMENT');
  const plan = await firebaseAdminRequest(env, `subscription_plans/${planId}`);
  if (!plan || plan.enabled === false || !Number.isInteger(Number(plan.totalUses)) || Number(plan.totalUses) < 1 || !Number.isInteger(Number(plan.durationDays)) || Number(plan.durationDays) < 1) throw Error('SUB_PLAN_NOT_FOUND');
  const requestIdValue = idempotencyKey || crypto.randomUUID();
  const existing = await firebaseAdminRequest(env, `subscription_requests/${requestIdValue}`);
  if (existing) {
    if (String(existing.phone || '') !== phone || String(existing.planId || '') !== planId || String(existing.name || existing.customerName || '') !== name) throw Error('ALREADY_EXISTS');
    return response(request, env, { ok: true, duplicate: true, requestId: requestIdValue, request: { requestId: requestIdValue, ...existing, phone } });
  }
  const requestRecord = {
    requestId: requestIdValue,
    registrationMethod: String(payload.registrationMethod || (current ? 'google' : 'manual')).slice(0, 30),
    uid: current?.uid || '',
    email: current?.email || '',
    name,
    customerName: name,
    phone,
    planId,
    planName: String(plan.nameAr || plan.nameEn || planId).slice(0, 120),
    price: Number(plan.price) || 0,
    status: 'pending',
    paymentStatus: 'pending',
    ...(typeof payload.notes === 'string' && payload.notes.trim() ? { notes: cleanText(payload.notes, 500) } : {}),
    createdAt: Date.now()
  };
  await firebaseAdminRequest(env, `subscription_requests/${requestIdValue}`, { method: 'PUT', body: requestRecord });
  return response(request, env, { ok: true, duplicate: false, requestId: requestIdValue, request: requestRecord });
}
function normalizeClubNumber(value) { return String(value || '').trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-'); }
function normalizeClubMembership(value) {
  const normalized = normalizeClubNumber(value);
  if (/^CLUB-101-\d+$/.test(normalized)) {
    const displayMembership = normalized.slice(5);
    return { displayMembership, canonicalClubId: `CLUB-${displayMembership}` };
  }
  if (/^101-\d+$/.test(normalized)) return { displayMembership: normalized, canonicalClubId: `CLUB-${normalized}` };
  return null;
}
function clubSearchQuery(value) {
  const raw = String(value || '').trim();
  const membership = normalizeClubMembership(raw);
  if (membership) return { type: 'club', value: membership.canonicalClubId, displayMembership: membership.displayMembership, canonicalClubId: membership.canonicalClubId };
  const phone = normalizeIraqiPhone(raw);
  if (phone) return { type: 'phone', value: phone };
  throw Error('INVALID_INPUT');
}
function safeClubSubscription(id, value) {
  if (!value || typeof value !== 'object') return null;
  return { id, planName: String(value.planName || '').slice(0, 120), planId: String(value.planId || '').slice(0, 120), status: String(value.status || '').slice(0, 40), remainingUses: Number(value.remainingUses) || 0, totalUses: Number(value.totalUses) || 0, expiresAt: value.expiresAt == null ? null : Number(value.expiresAt) || null };
}
function canonicalClubIsActive(value) {
  return String(value?.status || '').trim().toLowerCase() === 'active';
}
const CLUB_PHONE_FIELDS = ['phone', 'phoneNumber', 'mobile', 'mobileNumber'];
function clubRecordType(value) { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }
function maskClubRecordKey(value) {
  const key = String(value ?? '').trim();
  if (!key) return '[empty]';
  if (key.length <= 4) return `${key.slice(0, 1)}***`;
  return `${key.slice(0, 2)}***${key.slice(-2)}`;
}
function safeClubExceptionMessage(error) {
  return String(error?.message || error || 'UNKNOWN')
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/(?:\+?964|0)?7\d{9}/g, '[redacted]')
    .slice(0, 160);
}
function clubPhoneFieldValue(record) {
  if (record === null) return { skip: true, reason: 'null-record' };
  if (typeof record !== 'object' || Array.isArray(record)) return { skip: true, reason: 'non-object-record' };
  for (const field of CLUB_PHONE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const rawPhone = record[field];
    if (rawPhone === null || rawPhone === undefined) continue;
    if (typeof rawPhone !== 'string' && typeof rawPhone !== 'number') return { skip: true, field, reason: Array.isArray(rawPhone) ? 'phone-array' : 'phone-object' };
    return { field, rawPhone };
  }
  return { skip: true, reason: 'missing-phone' };
}
function isActiveCanonicalClubCustomer(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && canonicalClubIsActive(value) && Boolean(normalizeClubMembership(value.clubNumber));
}
function clubPhoneSourceEntries(source) {
  if (source === null || source === undefined) return [];
  if (Array.isArray(source) || (typeof source === 'object' && source !== null)) return Object.entries(source);
  return [];
}
function safeClubCustomer(id, value, subscriptionId, subscription, subscriptionRelation = null) {
  const customer = value || {};
  const relation = subscription ? subscriptionRelation : null;
  const authoritativeSubscriptionId = relation === 'current' ? subscriptionId : null;
  const membership = normalizeClubMembership(customer.clubNumber || id);
  const canonicalClubId = membership?.canonicalClubId || String(id || '').slice(0, 80);
  const displayMembership = membership?.displayMembership || String(customer.clubNumber || id).slice(0, 80);
  return { customerId: canonicalClubId, id: canonicalClubId, canonicalClubId, clubNumber: displayMembership, name: String(customer.name || customer.displayName || '').slice(0, 120), phone: String(customer.phone || customer.phoneNumber || customer.mobile || customer.mobileNumber || '').slice(0, 40), status: String(customer.status || '').slice(0, 40), isActive: canonicalClubIsActive(customer), uid: customer.uid ? String(customer.uid).slice(0, 180) : null, membershipNumber: customer.membershipNumber ? String(customer.membershipNumber).slice(0, 80) : null, activeSubscriptionId: customer.activeSubscriptionId ? String(customer.activeSubscriptionId).slice(0, 180) : null, subscriptionId: authoritativeSubscriptionId || null, subscriptionRelation: relation, subscription: subscription ? safeClubSubscription(subscriptionId, subscription) : null };
}
function maskClubPhone(value) { const digits = normalizeIraqiPhone(value); return digits ? `${digits.slice(0, 5)}***${digits.slice(-2)}` : '[invalid]'; }
async function findClubSubscription(env, customerId, customer) {
  const directId = String(customer?.activeSubscriptionId || '').trim();
  if (directId) {
    const direct = await firebaseAdminRequest(env, `subscriptions/${directId}`);
    if (direct) return { id: directId, value: direct, relation: 'current' };
  }
  const subscriptions = await firebaseAdminRequest(env, 'subscriptions') || {};
  const clubNumber = normalizeClubMembership(customer?.clubNumber || customerId)?.canonicalClubId || normalizeClubNumber(customer?.clubNumber || customerId);
  const matches = Object.entries(subscriptions).filter(([, value]) => {
    const item = value || {};
    return (normalizeClubMembership(item.clubNumber)?.canonicalClubId || normalizeClubNumber(item.clubNumber)) === clubNumber || String(item.customerId || '') === customerId;
  });
  if (matches.length !== 1) return null;
  return { id: matches[0][0], value: matches[0][1], relation: 'historical' };
}
function subscriptionBelongsToCustomer(subscription, customerId, customer) {
  if (!subscription || typeof subscription !== 'object') return false;
  const linkedCustomerId = String(subscription.customerId || '').trim();
  const linkedUid = String(subscription.uid || '').trim();
  return (linkedCustomerId && linkedCustomerId === String(customerId || '').trim()) ||
    (linkedUid && linkedUid === String(customer?.uid || '').trim());
}
async function findOwnedSubscription(env, customerId, customer) {
  const directId = String(customer?.activeSubscriptionId || '').trim();
  if (directId) {
    const direct = await firebaseAdminRequest(env, `subscriptions/${directId}`);
    if (subscriptionBelongsToCustomer(direct, customerId, customer)) return { id: directId, value: direct };
  }
  const subscriptions = await firebaseAdminRequest(env, 'subscriptions') || {};
  const matches = Object.entries(subscriptions).filter(([, value]) => subscriptionBelongsToCustomer(value, customerId, customer));
  return matches.length === 1 ? { id: matches[0][0], value: matches[0][1] } : null;
}
function safeSubscriptionMe(customerId, customer, subscriptionId, subscription, plan) {
  const sub = subscription && typeof subscription === 'object' ? subscription : null;
  const planValue = plan && typeof plan === 'object' ? plan : {};
  return {
    ok: true,
    customer: {
      customerId: String(customerId || '').slice(0, 180),
      clubNumber: String(customer?.clubNumber || '').slice(0, 80),
      status: String(customer?.status || '').slice(0, 40)
    },
    subscription: sub ? {
      id: String(subscriptionId || '').slice(0, 180),
      planId: String(sub.planId || '').slice(0, 120),
      status: String(sub.status || '').slice(0, 40),
      remainingUses: Number(sub.remainingUses) || 0,
      totalUses: Number.isFinite(Number(sub.totalUses)) ? Number(sub.totalUses) : Number(planValue.totalUses) || 0,
      expiresAt: sub.expiresAt == null ? null : Number(sub.expiresAt) || null,
      startedAt: sub.startedAt == null ? null : Number(sub.startedAt) || null
    } : null,
    plan: planValue && Object.keys(planValue).length ? {
      id: String(planValue.id || sub?.planId || '').slice(0, 120),
      nameAr: String(planValue.nameAr || '').slice(0, 120),
      nameEn: String(planValue.nameEn || '').slice(0, 120),
      totalUses: Number(planValue.totalUses) || 0,
      durationDays: Number(planValue.durationDays) || 0
    } : null
  };
}
async function subscriptionMe(request, env, current) {
  const customers = await firebaseAdminRequest(env, 'subscription_customers') || {};
  const matches = Object.entries(customers).filter(([, value]) => value && typeof value === 'object' && String(value.uid || '') === current.uid);
  if (matches.length !== 1) return response(request, env, { ok: true, ambiguous: matches.length > 1, customer: null, subscription: null, plan: null });
  const [customerId, customer] = matches[0];
  const related = await findOwnedSubscription(env, customerId, customer);
  if (!related) return response(request, env, safeSubscriptionMe(customerId, customer, '', null, null));
  const plan = related.value?.planId ? await firebaseAdminRequest(env, `subscription_plans/${related.value.planId}`) : null;
  return response(request, env, safeSubscriptionMe(customerId, customer, related.id, related.value, plan ? { id: related.value.planId, ...plan } : null));
}
async function searchClub(request, env, current) {
  console.info('[CLUB_SEARCH_ENTER]');
  const actor = await staff(env, current, 'search');
  console.info('[CLUB_SEARCH_AUTH_OK]', { hasUid: Boolean(current.uid) });
  console.info('[CLUB_SEARCH_ROLE_OK]', { role: actor.role });
  const query = clubSearchQuery((await body(request)).query);
  console.info('[CLUB_SEARCH_QUERY_TYPE]', { type: query.type, value: query.type === 'phone' ? maskClubPhone(query.value) : query.value });
  let customerId = query.type === 'club' ? query.value : '';
  let customer = query.type === 'club' ? await firebaseAdminRequest(env, `subscription_customers/${customerId}`) : null;
  if (query.type === 'phone') {
    console.info('[CLUB_PHONE_SEARCH_START]');
    console.info('[CLUB_PHONE_SOURCE_READ_START]');
    let customers;
    try {
      customers = await firebaseAdminRequest(env, 'subscription_customers');
      console.info('[CLUB_PHONE_SOURCE_READ_OK]', { sourceType: clubRecordType(customers) });
    } catch (error) {
      console.error('[CLUB_PHONE_EXCEPTION]', { name: String(error?.name || 'Error').slice(0, 80), message: safeClubExceptionMessage(error), stage: 'source-read', currentRecordType: 'unavailable', recordKey: '[none]' });
      throw error;
    }
    const entries = clubPhoneSourceEntries(customers);
    console.info('[CLUB_PHONE_RECORD_COUNT]', { count: entries.length });
    const matches = [];
    let scanned = 0, skipped = 0;
    for (const [recordKey, record] of entries) {
      scanned += 1;
      console.info('[CLUB_PHONE_RECORD_SCAN]', { recordKey: maskClubRecordKey(recordKey), recordType: clubRecordType(record) });
      try {
        const fieldValue = clubPhoneFieldValue(record);
        if (fieldValue.skip) {
          skipped += 1;
          console.info('[CLUB_PHONE_RECORD_SKIPPED]', { recordKey: maskClubRecordKey(recordKey), recordType: clubRecordType(record), field: fieldValue.field || null, reason: fieldValue.reason });
          continue;
        }
        const normalizedPhone = normalizeIraqiPhone(String(fieldValue.rawPhone));
        if (!normalizedPhone) {
          skipped += 1;
          console.info('[CLUB_PHONE_RECORD_SKIPPED]', { recordKey: maskClubRecordKey(recordKey), recordType: clubRecordType(record), field: fieldValue.field, reason: 'invalid-phone' });
          continue;
        }
        if (normalizedPhone === query.value) {
          matches.push([recordKey, record, fieldValue.field]);
          console.info('[CLUB_PHONE_MATCH]', { recordKey: maskClubRecordKey(recordKey), field: fieldValue.field });
        }
      } catch (error) {
        skipped += 1;
        console.error('[CLUB_PHONE_EXCEPTION]', { name: String(error?.name || 'Error').slice(0, 80), message: safeClubExceptionMessage(error), stage: 'record-phone-normalization', currentRecordType: clubRecordType(record), recordKey: maskClubRecordKey(recordKey) });
        console.info('[CLUB_PHONE_RECORD_SKIPPED]', { recordKey: maskClubRecordKey(recordKey), recordType: clubRecordType(record), field: null, reason: 'normalization-exception' });
      }
    }
    console.info('[CLUB_PHONE_SCAN_COMPLETE]', { scanned, skipped, matches: matches.length });
    const activeMatches = matches.filter(([, value]) => isActiveCanonicalClubCustomer(value));
    if (activeMatches.length > 1) {
      const safeMatches = await Promise.all(activeMatches.map(async ([recordKey, record]) => {
        const related = await findClubSubscription(env, recordKey, record);
        const safe = safeClubCustomer(recordKey, record, related?.id, related?.value, related?.relation);
        return { ...safe, planName: safe.subscription?.planName || safe.subscription?.planId || '' };
      }));
      safeMatches.sort((a, b) => String(a.clubNumber || '').localeCompare(String(b.clubNumber || ''), 'en', { numeric: true }));
      console.info('[CLUB_PHONE_AMBIGUOUS]', { matches: matches.length, activeCanonicalMatches: activeMatches.length, returnedMatches: safeMatches.length });
      return response(request, env, { ok: true, found: true, ambiguous: true, matches: safeMatches });
    }
    if (activeMatches.length === 0 && matches.length > 1) {
      console.error('[CLUB_PHONE_AMBIGUOUS]', { matches: matches.length, activeCanonicalMatches: activeMatches.length });
      throw Error('CLUB_PHONE_AMBIGUOUS');
    }
    const selected = activeMatches[0] || (matches.length === 1 ? matches[0] : null);
    if (selected) [customerId, customer] = selected;
  }
  if (!customer || typeof customer !== 'object') { console.info('[CLUB_SEARCH_NOT_FOUND]', { type: query.type }); throw Error('CLUB_MEMBER_NOT_FOUND'); }
  const related = await findClubSubscription(env, customerId, customer);
  const result = safeClubCustomer(customerId, customer, related?.id, related?.value, related?.relation);
  console.info('[CLUB_SEARCH_FOUND]', { customerId, hasSubscription: Boolean(related) });
  return response(request, env, { ok: true, found: true, customer: result, canonicalClubId: result.canonicalClubId, isActive: result.isActive, subscription: result.subscription, subscriptionRelation: result.subscriptionRelation });
}
function customerBelongsTo(current, customer) { return String(customer?.uid || '') === current.uid || Boolean(current.emailVerified && current.email && normalizedEmail(customer?.email) === normalizedEmail(current.email)); }
async function resolveLoyaltyMembership(env, current) {
  const linked = security.normalizeMembershipNumber(await firebaseAdminRequest(env, `loyalty_links/${current.uid}`));
  if (linked) {
    const customer = await firebaseAdminRequest(env, `loyalty_customers/${linked}`);
    if (customerBelongsTo(current, customer)) return { membership: linked, customer, source: 'link' };
  }
  const customers = await firebaseAdminRequest(env, 'loyalty_customers') || {};
  const uidMatches = Object.entries(customers).filter(([, customer]) => String(customer?.uid || '') === current.uid);
  if (uidMatches.length === 1) return { membership: security.normalizeMembershipNumber(uidMatches[0][0]), customer: uidMatches[0][1], source: 'uid' };
  if (uidMatches.length > 1) throw Error('PROFILE_LINK_CONFLICT');
  if (!current.emailVerified || !current.email) return null;
  const emailMatches = Object.entries(customers).filter(([, customer]) => normalizedEmail(customer?.email) === normalizedEmail(current.email));
  if (emailMatches.length === 1) return { membership: security.normalizeMembershipNumber(emailMatches[0][0]), customer: emailMatches[0][1], source: 'legacy-email' };
  if (emailMatches.length > 1) throw Error('PROFILE_LINK_CONFLICT');
  return null;
}
async function resolvePinLoginUid(env, membership, customer) {
  const directUid = String(customer?.uid || '').trim();
  const links = await firebaseAdminRequest(env, 'loyalty_links') || {};
  const matches = [...new Set(Object.entries(links)
    .filter(([, linkedMembership]) => security.normalizeMembershipNumber(linkedMembership) === membership)
    .map(([uid]) => String(uid || '').trim())
    .filter(Boolean))];
  if (matches.length > 1) throw Error('PROFILE_LINK_CONFLICT');
  if (directUid && matches.length === 1 && matches[0] !== directUid) throw Error('PROFILE_LINK_CONFLICT');
  if (directUid) return directUid;
  return matches[0] || `loyalty-member:${membership}`;
}
async function profile(request, env, current) { const resolved = await resolveLoyaltyMembership(env, current); if (!resolved?.membership || !resolved.customer) return fail(request, env, 'PROFILE_NOT_FOUND', 404); return response(request, env, { ok: true, status: 'active', profile: safeCustomer(resolved.membership, resolved.customer) }); }
async function verifyPinForReveal(request, env, current) {
  const payload = await body(request), pin = String(payload.pin || '').trim(), pepper = String(env.LOYALTY_PIN_PEPPER || '');
  if (!security.validPin(pin) || !pepper) throw Error('INVALID_ARGUMENT');
  const resolved = await resolveLoyaltyMembership(env, current);
  if (!resolved?.membership || !resolved.customer || !customerBelongsTo(current, resolved.customer)) throw Error('PROFILE_NOT_FOUND');
  const linkedMembership = security.normalizeMembershipNumber(await firebaseAdminRequest(env, `loyalty_links/${current.uid}`));
  if (linkedMembership !== resolved.membership) throw Error('PROFILE_NOT_FOUND');
  const credential = await firebaseAdminRequest(env, `loyalty_credentials/${resolved.membership}`);
  if (!await security.timingSafePinMatch(pin, credential, pepper)) throw Error('INVALID_PIN');
  const activated = await ensurePinCiphertext(env, resolved.membership, credential, pin);
  return response(request, env, { ok: true, verified: true, activated, available: Boolean(activated || credential?.pinCiphertext) });
}
async function revealPin(request, env, current) {
  const resolved = await resolveLoyaltyMembership(env, current);
  if (!resolved?.membership || !resolved.customer || !customerBelongsTo(current, resolved.customer)) throw Error('PROFILE_NOT_FOUND');
  const linkedMembership = security.normalizeMembershipNumber(await firebaseAdminRequest(env, `loyalty_links/${current.uid}`));
  if (linkedMembership !== resolved.membership) throw Error('PROFILE_NOT_FOUND');
  const credential = await firebaseAdminRequest(env, `loyalty_credentials/${resolved.membership}`);
  if (!credential?.pinCiphertext && await ensureTrustedLegacyPinCiphertext(env, resolved.membership, resolved.customer, credential)) credential.pinCiphertext = await firebaseAdminRequest(env, `loyalty_credentials/${resolved.membership}/pinCiphertext`);
  if (!credential?.pinCiphertext) return response(request, env, { ok: true, available: false, membershipNumber: resolved.membership });
  const revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!revealKey) return response(request, env, { ok: true, available: false, membershipNumber: resolved.membership });
  const pin = await security.decryptPin(credential.pinCiphertext, revealKey);
  return response(request, env, { ok: true, available: true, pin, membershipNumber: resolved.membership });
}
async function revealPinForAdmin(request, env, current) {
  const actor = await staff(env, current, 'reveal-pin');
  const canReveal = actor.role === 'super_admin' || (actor.role === 'manager' && actor.record?.permissions?.canRevealMemberPin === true);
  if (!canReveal) throw Error('FORBIDDEN');
  const payload = await body(request), membership = security.normalizeMembershipNumber(payload.membership);
  if (!membership) throw Error('INVALID_MEMBERSHIP');
  const [customer, credential] = await Promise.all([firebaseAdminRequest(env, `loyalty_customers/${membership}`), firebaseAdminRequest(env, `loyalty_credentials/${membership}`)]);
  if (!credential?.pinCiphertext) return response(request, env, { ok: true, available: false, membershipNumber: membership });
  const revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!revealKey) return response(request, env, { ok: true, available: false, membershipNumber: membership });
  let pin;
  try { pin = await security.decryptPin(credential.pinCiphertext, revealKey); } catch { return response(request, env, { ok: true, available: false, membershipNumber: membership }); }
  const auditId = `pin_reveal_${crypto.randomUUID()}`;
  await firebaseAdminRequest(env, `loyalty_logs/${auditId}`, { method: 'PUT', body: { type: 'PIN_REVEALED', membership, actorUid: current.uid, actorEmail: current.email, actorRole: actor.role, timestamp: Date.now() } });
  return response(request, env, { ok: true, available: true, pin, membershipNumber: membership });
}
async function revealPinAuthorization(request, env, current) {
  const actor = await staff(env, current, 'reveal-pin');
  const canRevealMemberPin = actor.role === 'super_admin' || (actor.role === 'manager' && actor.record?.permissions?.canRevealMemberPin === true);
  if (!canRevealMemberPin) throw Error('FORBIDDEN');
  return response(request, env, { ok: true, canRevealMemberPin: true, stage: 'WORKER_AUTHORIZATION' });
}
function recoveryFingerprint(c) { return `${String(c?.pinHash || '')}.${String(c?.salt || '')}.${String(c?.algorithm || '')}.${Number(c?.iterations || 0)}`; }
async function planOriginalPinRecovery(root, env) {
  const customers=root?.loyalty_customers||{}, credentials=root?.loyalty_credentials||{}, pepper=String(env.LOYALTY_PIN_PEPPER||''), revealKey=String(env.LOYALTY_PIN_REVEAL_KEY||''), plan=[], reasons={}, add=r=>reasons[r]=(reasons[r]||0)+1;
  for(const membership of Object.keys(customers).sort()) { const customer=customers[membership], credential=credentials[membership], legacyPin=String(customer?.pin||'').trim();
    if(credential?.pinCiphertext) { try { await security.decryptPin(credential.pinCiphertext,revealKey); add('already_encrypted'); } catch { add('cipher_invalid'); } continue; }
    if(security.validPin(legacyPin)) { if(!credentialShapeIsUsable(credential)||!pepper||!revealKey) { add('configuration_or_credential_invalid'); continue; } let matches=false; try { matches=await security.timingSafePinMatch(legacyPin,credential,pepper); } catch {} if(!matches) { add('credential_mismatch'); continue; } plan.push({membership,pin:legacyPin,fingerprint:recoveryFingerprint(credential)}); continue; }
    add(credentialShapeIsUsable(credential)?'hash_only':'no_legacy_pin');
  }
  return {plan,report:{totalMemberships:Object.keys(customers).length,eligible:plan.length,alreadyEncrypted:Number(reasons.already_encrypted||0),hashOnly:Number(reasons.hash_only||0),cannotRecover:Object.values(reasons).reduce((n,v)=>n+Number(v||0),0)-Number(reasons.already_encrypted||0),reasons}};
}
async function diagnoseOriginalPinRecovery(root, env) {
  const customers=root?.loyalty_customers||{}, credentials=root?.loyalty_credentials||{}, pepper=String(env.LOYALTY_PIN_PEPPER||'').trim(), revealKey=String(env.LOYALTY_PIN_REVEAL_KEY||'').trim(), memberships=[];
  for(const membership of Object.keys(customers).sort()) {
    const customer=customers[membership]||{}, credential=credentials[membership], hasLegacyPin=security.validPin(customer.pin), hasValidCredential=credentialShapeIsUsable(credential);
    let legacyMatchesCredential=null, hasValidCiphertext=false;
    if(typeof credential?.pinCiphertext==='string'&&credential.pinCiphertext.length>0&&revealKey){try{await security.decryptPin(credential.pinCiphertext,revealKey);hasValidCiphertext=true;}catch{}}
    if(hasLegacyPin&&hasValidCredential&&pepper){try{legacyMatchesCredential=await security.timingSafePinMatch(String(customer.pin).trim(),credential,pepper);}catch{legacyMatchesCredential=false;}}
    let reason='no_legacy_pin';
    if(hasValidCiphertext)reason='already_encrypted';
    else if(!hasLegacyPin&&hasValidCredential)reason='hash_only';
    else if(!hasLegacyPin&&!hasValidCredential)reason='no_legacy_pin_or_credential';
    else if(!hasValidCredential)reason='legacy_pin_without_credential';
    else if(!pepper||!revealKey)reason='configuration_missing';
    else if(legacyMatchesCredential===false)reason='credential_mismatch';
    else if(legacyMatchesCredential===true)reason='eligible_missing_ciphertext';
    memberships.push({membership,hasLegacyPin,hasValidCredential,legacyMatchesCredential,reason});
  }
  return {totalMemberships:memberships.length,memberships};
}
// Each member repair performs multiple full-root reads/writes and verification
// passes. Keep the resumable unit below the Worker request timeout so a 503
// cannot strand the final member of an otherwise successful batch.
const PIN_REPAIR_BATCH_SIZE = 5;
function pinRepairRunId(value) { const id = String(value || '').trim(); return /^[A-Za-z0-9._:-]{8,120}$/.test(id) ? id : ''; }
function pinRepairPath(runId, suffix = '') { return `loyalty_pin_repair_runs/${runId}${suffix ? `/${suffix}` : ''}`; }
function credentialFingerprint(credential) { return credentialShapeIsUsable(credential) ? `${credential.pinHash}.${credential.salt}.${credential.algorithm || ''}.${Number(credential.iterations || 0)}` : ''; }
async function assessLegacyPinRepair(env, root, membership) {
  const customer = root?.loyalty_customers?.[membership] || null, credential = root?.loyalty_credentials?.[membership] || null;
  const pin = String(customer?.pin || '').trim(), hasLegacyPin = security.validPin(pin), usable = credentialShapeIsUsable(credential), ciphertext = String(credential?.pinCiphertext || '');
  if (!hasLegacyPin) {
    if (ciphertext) { try { await security.decryptPin(ciphertext, String(env.LOYALTY_PIN_REVEAL_KEY || '').trim()); return { kind: 'already_encrypted', membership }; } catch { return { kind: 'cipher_invalid', membership }; } }
    return { kind: usable ? 'hash_only' : 'no_legacy_pin', membership };
  }
  const pepper = String(env.LOYALTY_PIN_PEPPER || '').trim(), revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!pepper || !revealKey) return { kind: 'configuration_missing', membership };
  if (ciphertext) { try { if (await security.decryptPin(ciphertext, revealKey) !== pin) return { kind: 'cipher_mismatch', membership }; } catch { return { kind: 'cipher_invalid', membership }; } }
  if (usable) { try { if (!await security.timingSafePinMatch(pin, credential, pepper)) return { kind: 'credential_mismatch', membership }; } catch { return { kind: 'credential_mismatch', membership }; } }
  const indexKey = await security.pinIndexKey(pin, pepper), indexedMembership = String(root?.loyalty_pin_index?.[indexKey] || '');
  if (indexedMembership && indexedMembership !== membership) return { kind: 'pin_index_conflict', membership };
  return { kind: 'eligible', membership, pin, createCredential: !usable, indexKey, credentialFingerprint: credentialFingerprint(credential) };
}
async function legacyPinRepairReport(env, root) {
  const customers = root?.loyalty_customers || {}, reasons = {}, eligible = [];
  for (const membership of Object.keys(customers).sort()) { if (security.normalizeMembershipNumber(membership) !== membership) continue; const assessment = await assessLegacyPinRepair(env, root, membership); reasons[assessment.kind] = Number(reasons[assessment.kind] || 0) + 1; if (assessment.kind === 'eligible') eligible.push(assessment); }
  return { report: { totalMemberships: Object.keys(customers).length, eligible: eligible.length, alreadyEncrypted: Number(reasons.already_encrypted || 0), hashOnly: Number(reasons.hash_only || 0), cannotRecover: Object.entries(reasons).filter(([key]) => !['eligible', 'already_encrypted', 'hash_only'].includes(key)).reduce((sum, [, count]) => sum + Number(count || 0), 0), reasons }, eligible };
}
async function writeAndVerifyPinRepairBackup(env, root, runId, eligible) {
  const backupKey = String(env.PIN_BACKUP_ENCRYPTION_KEY || '').trim(); if (!backupKey) throw Error('PIN_RECOVERY_CONFIGURATION_MISSING');
  const entries = [];
  for (const item of eligible) entries.push({ membership: item.membership, customer: root.loyalty_customers[item.membership], credential: root.loyalty_credentials?.[item.membership] || null, pinIndex: root.loyalty_pin_index?.[item.indexKey] || null, indexKey: item.indexKey });
  const payload = { version: 2, type: 'legacy_pin_repair', createdAt: Date.now(), entries }, ciphertext = await security.encryptRecoveryPayload(payload, backupKey);
  await firebaseAdminRequest(env, pinRepairPath(runId, 'backup'), { method: 'PUT', body: { version: 2, algorithm: 'AES-256-GCM', ciphertext, createdAt: payload.createdAt, entryCount: entries.length } });
  const saved = await firebaseAdminRequest(env, pinRepairPath(runId, 'backup')), restored = await security.decryptRecoveryPayload(saved?.ciphertext, backupKey);
  if (!saved || restored?.version !== 2 || restored?.type !== 'legacy_pin_repair' || restored?.entries?.length !== entries.length || restored.entries.some((entry, index) => entry.membership !== entries[index].membership || entry.customer?.pin !== entries[index].customer?.pin)) throw Error('PIN_BACKUP_UNVERIFIED');
  await firebaseAdminRequest(env, pinRepairPath(runId, 'metadata'), { method: 'PUT', body: { version: 2, backupVerified: true, memberships: entries.map(entry => entry.membership), createdAt: payload.createdAt } });
  return entries.length;
}
async function applyLegacyPinRepairRecord(env, runId, membership) {
  const root = await firebaseAdminRequest(env, '') || {}, metadata = root?.loyalty_pin_repair_runs?.[runId]?.metadata, backup = root?.loyalty_pin_repair_runs?.[runId]?.backup;
  if (!metadata?.backupVerified || !Array.isArray(metadata.memberships) || !metadata.memberships.includes(membership) || !backup?.ciphertext) throw Error('PIN_BACKUP_UNVERIFIED');
  const backupPayload = await security.decryptRecoveryPayload(backup.ciphertext, String(env.PIN_BACKUP_ENCRYPTION_KEY || '').trim()); const backupEntry = backupPayload?.entries?.find(entry => entry.membership === membership);
  if (!backupEntry || !security.validPin(backupEntry.customer?.pin)) throw Error('PIN_BACKUP_UNVERIFIED');
  const assessment = await assessLegacyPinRepair(env, root, membership); if (assessment.kind !== 'eligible' || assessment.pin !== backupEntry.customer.pin || credentialFingerprint(root?.loyalty_credentials?.[membership]) !== credentialFingerprint(backupEntry.credential)) return 'skipped';
  const nextCredential = assessment.createCredential ? await createLoyaltyCredential(assessment.pin, env) : { ...root.loyalty_credentials[membership] };
  if (!nextCredential.pinCiphertext || !await security.timingSafePinMatch(assessment.pin, nextCredential, String(env.LOYALTY_PIN_PEPPER || '').trim()) || await security.decryptPin(nextCredential.pinCiphertext, String(env.LOYALTY_PIN_REVEAL_KEY || '').trim()) !== assessment.pin) throw Error('PIN_REVEAL_WRITE_UNVERIFIED');
  await atomicPlan(env, current => {
    const customer = current?.loyalty_customers?.[membership], credential = current?.loyalty_credentials?.[membership];
    if (String(customer?.pin || '') !== assessment.pin || credentialFingerprint(credential) !== assessment.credentialFingerprint || current?.loyalty_pin_index?.[assessment.indexKey] && current.loyalty_pin_index[assessment.indexKey] !== membership) throw Error('PIN_MIGRATION_CONCURRENT_CHANGE');
    return { updates: { [`loyalty_credentials/${membership}`]: nextCredential, [`loyalty_pin_index/${assessment.indexKey}`]: membership, [`loyalty_customers/${membership}/pin`]: null, [pinRepairPath(runId, `completed/${membership}`)]: { completedAt: Date.now(), createdCredential: assessment.createCredential } }, result: { migrated: true } };
  }, { stage: 'PIN_REPAIR_ATOMIC' });
  const saved = await firebaseAdminRequest(env, '') || {}, savedCredential = saved?.loyalty_credentials?.[membership];
  if (saved?.loyalty_customers?.[membership]?.pin || !credentialShapeIsUsable(savedCredential) || !savedCredential.pinCiphertext || !await security.timingSafePinMatch(assessment.pin, savedCredential, String(env.LOYALTY_PIN_PEPPER || '').trim()) || await security.decryptPin(savedCredential.pinCiphertext, String(env.LOYALTY_PIN_REVEAL_KEY || '').trim()) !== assessment.pin) throw Error('PIN_REVEAL_WRITE_UNVERIFIED');
  return 'migrated';
}
async function recoverOriginalPins(request, env, current) {
  const actor = await staff(env, current, 'pin-migration'); if (actor.role !== 'super_admin') throw Error('FORBIDDEN'); const payload = await body(request), mode = String(payload.mode || 'dry-run').trim(), runId = pinRepairRunId(payload.runId);
  if (!['dry-run', 'diagnostic', 'backup', 'apply'].includes(mode)) throw Error('INVALID_ARGUMENT'); const root = await firebaseAdminRequest(env, '') || {};
  if (mode === 'diagnostic') return response(request, env, { ok: true, mode, ...await diagnoseOriginalPinRecovery(root, env) });
  const planned = await legacyPinRepairReport(env, root); if (mode === 'dry-run') return response(request, env, { ok: true, mode, report: planned.report });
  if (!runId) throw Error('PIN_MIGRATION_RUN_ID_REQUIRED');
  if (mode === 'backup') return response(request, env, { ok: true, mode, runId, backedUp: await writeAndVerifyPinRepairBackup(env, root, runId, planned.eligible), backupVerified: true, report: planned.report });
  const completed = root?.loyalty_pin_repair_runs?.[runId]?.completed || {}, pending = (root?.loyalty_pin_repair_runs?.[runId]?.metadata?.memberships || []).filter(membership => !completed[membership]).slice(0, PIN_REPAIR_BATCH_SIZE), processed = { migrated: 0, skipped: 0 };
  for (const membership of pending) { const result = await applyLegacyPinRepairRecord(env, runId, membership); processed[result] += 1; }
  const after = await firebaseAdminRequest(env, '') || {}, report = await legacyPinRepairReport(env, after);
  return response(request, env, { ok: true, mode, runId, processed, hasMore: (after?.loyalty_pin_repair_runs?.[runId]?.metadata?.memberships || []).some(membership => !after?.loyalty_pin_repair_runs?.[runId]?.completed?.[membership]), report: report.report });
}
async function verifyMemberPin(env, membership, pin) {
  const pepper = String(env.LOYALTY_PIN_PEPPER || ''), normalizedPin = String(pin || '').trim();
  if (!security.validPin(normalizedPin) || !pepper) throw Error('INVALID_PIN');
  const [customer, credential] = await Promise.all([
    firebaseAdminRequest(env, `loyalty_customers/${membership}`),
    firebaseAdminRequest(env, `loyalty_credentials/${membership}`)
  ]);
  if (!customer) throw Error('NOT_FOUND');
  let valid = false;
  try { valid = await security.timingSafePinMatch(normalizedPin, credential, pepper); } catch { valid = false; }
  if (!valid && !credentialShapeIsUsable(credential) && security.validPin(customer.pin)) {
    valid = security.timingSafeEqual(new TextEncoder().encode(normalizedPin), new TextEncoder().encode(String(customer.pin)));
  }
  if (!valid) throw Error('INVALID_PIN');
  return customer;
}
async function provision(request, env, current, superAdmin = false) {
  let stage = 'START';
  const setStage = value => { stage = value; setProvisionRequestStage(request, value); console.info('[LOYALTY_PROVISION_STAGE]', { requestId: provisionRequestId(request).requestId, uid: current?.uid || null, stage: value }); };
  try {
    setStage('AUTH_START');
    if (!current.emailVerified || !current.email) return fail(request, env, 'VERIFIED_EMAIL_REQUIRED', 403);
    if (superAdmin && current.email !== SUPER_ADMIN_EMAIL) throw Error('FORBIDDEN');
    setStage('AUTH_OK');
    setStage('PROFILE_LOOKUP');
    const pending = await firebaseAdminRequest(env, `loyalty_pending/${current.uid}`) || {};
    setStage('UID_LINK_CHECK');
    const linked = security.normalizeMembershipNumber(await firebaseAdminRequest(env, `loyalty_links/${current.uid}`));
    let linkedCustomer = null;
    if (linked) {
      linkedCustomer = await firebaseAdminRequest(env, `loyalty_customers/${linked}`);
      if (linkedCustomer && !customerBelongsTo(current, linkedCustomer)) throw Error('PROFILE_LINK_CONFLICT');
      if (linkedCustomer) {
        setStage('PROFILE_READBACK');
        setStage('COMPLETE');
        return response(request, env, { ok: true, status: 'already_provisioned', profileStatus: 'active', provisioned: false, membershipNumber: linked, profile: safeCustomer(linked, linkedCustomer) });
      }
    }
    const pepper = String(env.LOYALTY_PIN_PEPPER || '');
    if (!pepper) throw Error('INTERNAL_ERROR');
    const reservationPath = `loyalty_provision_reservations/${current.uid}`;
    const reservation = await firebaseAdminRequest(env, reservationPath) || {};
    let membership = security.normalizeMembershipNumber(reservation.membership) || linked;
    let previousPinIndexKey = String(reservation.pinIndexKey || '').trim();
    setStage('COUNTER_READ');
    if (!membership) {
      let counterEtag = '';
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const counter = await firebaseAdminReadWithEtag(env, 'loyalty_counter');
        const next = (Number(counter.data) || 0) + 1;
        membership = `101-${next}`;
        setStage('COUNTER_RESERVE');
        try {
          await firebaseAdminConditionalPut(env, 'loyalty_counter', next, counter.etag);
          counterEtag = counter.etag;
          if (await firebaseAdminRequest(env, `loyalty_customers/${membership}`)) { counterEtag = ''; continue; }
          break;
        } catch (error) {
          if (error.message !== 'FIREBASE_ETAG_CONFLICT' || attempt === 11) throw error;
        }
      }
      if (!membership || !counterEtag) throw Error('COUNTER_CONFLICT');
    } else {
      setStage('COUNTER_RESERVE');
      if (await firebaseAdminRequest(env, `loyalty_customers/${membership}`) && !linkedCustomer) throw Error('PROFILE_READBACK_FAILED');
    }
    const now = Date.now();
    if (!reservation.membership) await firebaseAdminRequest(env, '', { method: 'PATCH', body: { [reservationPath]: { membership, pinIndexKey: '', createdAt: now } } });
    setStage('PIN_GENERATE');
    let pin = '', pinIndexKey = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      pin = security.generatePin();
      pinIndexKey = await security.pinIndexKey(pin, pepper);
      if (pinIndexKey === previousPinIndexKey || !await firebaseAdminRequest(env, `loyalty_pin_index/${pinIndexKey}`)) break;
      if (attempt === 19) throw Error('PIN_GENERATION_FAILED');
    }
    setStage('CREDENTIAL_CREATE');
    const credential = await createLoyaltyCredential(pin, env, now);
    setStage('PIN_ENCRYPT');
    if (!credential?.pinHash || !credential?.salt) throw Error('CREDENTIAL_CREATE_FAILED');
    const pinReservation = `loyalty_pin_index/${pinIndexKey}`;
    const pinSnapshot = await firebaseAdminReadWithEtag(env, pinReservation);
    try { await firebaseAdminConditionalPut(env, pinReservation, membership, pinSnapshot.etag); }
    catch (error) { if (error.message === 'FIREBASE_ETAG_CONFLICT') throw Error('PIN_GENERATION_FAILED'); throw error; }
    setStage('FIREBASE_WRITE');
    const customer = { ...linkedCustomer, uid: current.uid, email: current.email, name: String(linkedCustomer?.name || pending.displayName || current.name || 'عضو 101').slice(0, 120), memberType: superAdmin ? 'Super Admin' : linkedCustomer?.memberType || 'زبون', hearts: Number(linkedCustomer?.hearts || 0), currentHearts: Number(linkedCustomer?.currentHearts ?? linkedCustomer?.hearts ?? 0), createdAt: Number(linkedCustomer?.createdAt) || now, updatedAt: now };
    const updates = { [`loyalty_customers/${membership}`]: customer, [`loyalty_credentials/${membership}`]: credential, [`loyalty_links/${current.uid}`]: membership, ...(previousPinIndexKey && previousPinIndexKey !== pinIndexKey ? { [`loyalty_pin_index/${previousPinIndexKey}`]: null } : {}) };
    if (pending.status === 'pending') updates[`loyalty_pending/${current.uid}`] = null;
    try {
      await firebaseAdminRequest(env, '', { method: 'PATCH', body: { [reservationPath]: { membership, pinIndexKey, createdAt: Number(reservation.createdAt) || now } } });
      await firebaseAdminRequest(env, '', { method: 'PATCH', body: updates });
    }
    catch (error) { error.provisionStage = 'FIREBASE_WRITE'; await firebaseAdminRequest(env, pinReservation, { method: 'DELETE' }).catch(() => {}); throw error; }
    setStage('PROFILE_READBACK');
    const [savedLink, savedCustomer, savedCredential] = await Promise.all([firebaseAdminRequest(env, `loyalty_links/${current.uid}`), firebaseAdminRequest(env, `loyalty_customers/${membership}`), firebaseAdminRequest(env, `loyalty_credentials/${membership}`)]);
    if (security.normalizeMembershipNumber(savedLink) !== membership || !savedCustomer || !savedCredential) throw Error('PROFILE_READBACK_FAILED');
    await firebaseAdminRequest(env, '', { method: 'PATCH', body: { [reservationPath]: null } }).catch(() => {});
    setStage('COMPLETE');
    return response(request, env, { ok: true, status: 'created', profileStatus: 'active', provisioned: true, membershipNumber: membership, profile: safeCustomer(membership, savedCustomer) });
  } catch (error) { error.provisionStage = error.provisionStage || stage; throw error; }
}

async function createLoyaltyCustomer(request, env, current) {
  const actor = await staff(env, current, 'manage_customers'), p = await body(request);
  const invalidField = field => Object.assign(Error('INVALID_FIELD'), { field });
  const name = typeof p.name === 'string' ? p.name.trim() : '', phone = p.phone === undefined || p.phone === null ? '' : typeof p.phone === 'string' ? p.phone.trim() : null;
  const hearts = p.hearts === undefined || p.hearts === null || p.hearts === '' ? 0 : Number(p.hearts);
  let id;
  try { id = requestId(p); } catch { throw invalidField('requestId'); }
  if (!id) throw invalidField('requestId');
  if (!name || name.length > 120) throw invalidField('name');
  if (phone === null || phone.length > 40) throw invalidField('phone');
  if (!Number.isInteger(hearts) || hearts < 0 || hearts > 5) throw invalidField('hearts');
  const defaultMemberType = decodeURIComponent('%D8%B2%D8%A8%D9%88%D9%86');
  const memberType = String(p.memberType || defaultMemberType).slice(0, 80);
  const pepper = String(env.LOYALTY_PIN_PEPPER || ''), revealKey = String(env.LOYALTY_PIN_REVEAL_KEY || '').trim();
  if (!pepper || !revealKey) throw Error('INTERNAL_ERROR');

  const opPath = operationPath('customer-create', id);
  if (opPath) {
    const snap = await firebaseAdminReadWithEtag(env, opPath).catch(() => ({ data: null, etag: 'null' }));
    const existingOp = snap.data;
    if (existingOp?.result) return response(request, env, existingOp.result);
    if (existingOp?.pending && Date.now() - (existingOp.createdAt || 0) < 60000) throw Error('CONCURRENT_MODIFICATION');
    try {
      await firebaseAdminConditionalPut(env, opPath, { pending: true, createdAt: Date.now() }, snap.etag);
    } catch (err) {
      if (err.message === 'FIREBASE_ETAG_CONFLICT') throw Error('CONCURRENT_MODIFICATION');
      throw err;
    }
  }

  let membership = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const snap = await firebaseAdminReadWithEtag(env, 'loyalty_counter').catch(() => ({ data: 0, etag: '*' }));
    const counter = Number(snap.data) || 0;
    const nextCounter = counter + 1;
    membership = '101-' + nextCounter;
    try {
      if (snap.etag === '*') {
        const rootCounter = await firebaseAdminReadWithEtag(env, 'loyalty_counter');
        await firebaseAdminConditionalPut(env, 'loyalty_counter', Number(rootCounter.data || 0) + 1, rootCounter.etag);
      } else {
        await firebaseAdminConditionalPut(env, 'loyalty_counter', nextCounter, snap.etag);
      }
      break;
    } catch (err) {
      if (err.message !== 'FIREBASE_ETAG_CONFLICT' || attempt === 11) throw err;
    }
  }

  let pin = security.generatePin();
  while (pin === '0224') pin = security.generatePin();

  const credential = await security.createCredential(pin, pepper);
  const encrypted = await security.encryptPin(pin, revealKey);
  const now = Date.now();
  
  const customer = { name, phone, hearts, currentHearts: hearts, totalEarned: hearts, totalHeartsEarned: hearts, totalSpent: 0, memberType, createdAt: now, createdBy: actor.record.displayName || current.name || 'كاشير', updatedAt: now };
  
  const outcome = { ok: true, membershipNumber: membership, pinAvailable: true, requestId: id, profile: security.publicProfile(membership, customer) };
  const storedResult = { membershipNumber: membership, actorUid: current.uid, requestId: id, pinAvailable: true };
  
  const updates = {
    [`loyalty_customers/${membership}`]: customer,
    [`loyalty_credentials/${membership}`]: credential,
    [`loyalty_pin_reveals/${membership}`]: { ...encrypted, enabled: true, enabledAt: now, migration: false }
  };
  if (opPath) updates[opPath] = { result: storedResult, createdAt: now };
  
  await firebaseAdminRequest(env, '', { method: 'PATCH', body: updates });
  return response(request, env, outcome);
}

async function activatePending(request, env, current) {
  const actor = await staff(env, current, 'activate-pending'), p = await body(request), uid = String(p.uid || '').trim();
  if (!/^[A-Za-z0-9_-]{6,180}$/.test(uid)) throw Error('INVALID_PENDING');
  const pending = await firebaseAdminRequest(env, `loyalty_pending/${uid}`); if (!pending || pending.status !== 'pending') throw Error('INVALID_PENDING');
  const pepper = String(env.LOYALTY_PIN_PEPPER || ''); if (!pepper) throw Error('INTERNAL_ERROR');
  const result = await atomicPlan(env, async root => {
    const existing = root.loyalty_links?.[uid]; if (existing) return { updates: { [`loyalty_pending/${uid}`]: null }, result: { ok: true, membershipNumber: existing, existing: true } };
    const counter = (Number(root.loyalty_counter) || 0) + 1, membership = `101-${counter}`, now = Date.now(), pinData = await chooseUniqueLoyaltyPin(root, pepper), credential = await createLoyaltyCredential(pinData.pin, env, now);
    const customer = { uid, name: String(pending.displayName || pending.email || '╪╣╪╢┘ê 101').slice(0, 120), email: String(pending.email || '').slice(0, 180), memberType: '╪▓╪¿┘ê┘å', membershipStatus: '╪╣╪╢┘ê ┘à┘à┘è╪▓', hearts: 0, currentHearts: 0, createdAt: now, updatedAt: now };
    return { updates: { [`loyalty_customers/${membership}`]: customer, [`loyalty_credentials/${membership}`]: credential, [`loyalty_pin_index/${pinData.indexKey}`]: membership, [`loyalty_links/${uid}`]: membership, [`loyalty_pending/${uid}`]: null, loyalty_counter: counter }, result: { ok: true, membershipNumber: membership, existing: false, pin: pinData.pin } };
  }, { stage: 'LOYALTY_PENDING_ACTIVATION' });
  return response(request, env, result);
}
function normalizeActivationPhone(value) { return normalizeIraqiPhone(value); }
function subscriptionActivationResult(requestId, subscriptionId, customerId, customer, pin, idempotent = false) { return { ok: true, requestId, subscriptionId, customerId, clubNumber: customer.clubNumber, ...(pin ? { pin } : {}), idempotent }; }
async function activateSubscription(request, env, current) {
  let activationStage = 'START';
  let requestIdValue = '';
  let planId = '';
  const stage = next => { activationStage = next; console.info({ tag: 'SUB_ACTIVATE_STAGE', stage: activationStage }); };
  try {
    stage('START');
    stage('AUTH_START');
    if (!current?.uid) throw Error('AUTH_INVALID');
    stage('AUTH_OK');
    stage('ROLE_START');
    const actor = await staff(env, current, 'activate-subscription');
    stage('ROLE_OK');
    stage('REQUEST_READ_START');
    const payload = await body(request);
    stage('REQUEST_READ_OK');
    stage('REQUEST_VALIDATE_START');
    requestIdValue = String(payload.requestId || payload.id || '').trim();
    const suppliedPhone = String(payload.phone || '').trim();
    if (!requestIdValue) throw Error('INVALID_ARGUMENT');
    stage('REQUEST_VALIDATE_OK');
    stage('ROOT_READ_START');
    const result = await atomicPlan(env, async root => {
    stage('ROOT_READ_OK');
    stage('ETAG_OK');
    const clubRequest = root.subscription_requests?.[requestIdValue];
    if (!clubRequest) throw Error('SUB_REQUEST_NOT_FOUND');
    if ((clubRequest.status === 'activated' || clubRequest.paymentStatus === 'paid') && clubRequest.subscriptionId) {
      const subscription = root.subscriptions?.[clubRequest.subscriptionId];
      const customerId = clubRequest.customerId || subscription?.customerId || '';
      const customer = root.subscription_customers?.[customerId];
      if (subscription && customer) return { replay: true, result: subscriptionActivationResult(requestIdValue, clubRequest.subscriptionId, customerId, customer, '', true) };
    }
    if (clubRequest.status !== 'pending') throw Error('SUB_REQUEST_NOT_PENDING');
    planId = String(clubRequest.planId || '');
    stage('PLAN_READ_START');
    const plan = root.subscription_plans?.[planId];
    stage('PLAN_READ_OK');
    stage('PLAN_VALIDATE_START');
    if (!plan || plan.enabled === false) throw Error('SUB_PLAN_NOT_FOUND');
    stage('PLAN_VALIDATE_OK');
    stage('PHONE_VALIDATE_START');
    const normalizedPhone = normalizeActivationPhone(suppliedPhone || clubRequest.phone);
    if (!normalizedPhone) throw Error('INVALID_ARGUMENT');
    stage('PHONE_VALIDATE_OK');
    stage('UID_RESOLVE_START');
    const requestUid = clubRequest.uid ? String(clubRequest.uid).slice(0, 180) : '';
    stage('UID_RESOLVE_OK');
    const customers = root.subscription_customers || {}, subscriptions = root.subscriptions || {};
    const existingEntry = Object.entries(customers).find(([id, value]) => (requestUid && String(value?.uid || '') === requestUid) || normalizeActivationPhone(value?.phone) === normalizedPhone);
    const existingId = existingEntry?.[0] || '';
    const existingCustomer = existingEntry?.[1] || null;
    if (existingCustomer?.activeSubscriptionId && subscriptions[existingCustomer.activeSubscriptionId]?.status === 'active') throw Error('SUB_CUSTOMER_ALREADY_ACTIVE');
    let customerId = existingId, clubNumber = existingCustomer?.clubNumber || '';
    const counter = Number(root.subscription_counter) || 0;
    stage('COUNTER_READ_OK');
    let nextCounter = counter;
    if (existingId && !clubNumber) throw Error('SUB_CUSTOMER_DATA_INCOMPLETE');
    if (!customerId) {
      do { nextCounter += 1; clubNumber = `CLUB-101-${nextCounter}`; customerId = clubNumber; } while (customers[customerId]);
    }
    stage('CLUB_NUMBER_OK');
    const pin = security.generatePin();
    stage('PIN_GENERATE_OK');
    const now = Date.now(), subscriptionId = `sub_${requestIdValue}`, totalUses = Number(plan.totalUses), durationDays = Number(plan.durationDays);
    if (!Number.isInteger(totalUses) || totalUses < 1 || !Number.isInteger(durationDays) || durationDays < 1) throw Error('SUB_PLAN_NOT_FOUND');
    const { pin: _legacyCustomerPin, ...customerWithoutPin } = existingCustomer || {};
    const customer = { ...customerWithoutPin, customerId, name: String(clubRequest.name || clubRequest.customerName || existingCustomer?.name || '╪╣╪╢┘ê 101').slice(0, 120), phone: normalizedPhone, email: String(clubRequest.email || existingCustomer?.email || '').slice(0, 180), ...(requestUid ? { uid: requestUid } : {}), clubNumber, status: 'active', activeSubscriptionId: subscriptionId, createdAt: Number(existingCustomer?.createdAt) || now, updatedAt: now };
    stage('CUSTOMER_BUILD_OK');
    const subscription = { subscriptionId, requestId: requestIdValue, customerId, uid: customer.uid || '', name: customer.name, phone: normalizedPhone, clubNumber, planId: String(clubRequest.planId), planName: String(clubRequest.planName || plan.nameAr || plan.nameEn || clubRequest.planId), price: Number(clubRequest.price || plan.price || 0), status: 'active', paymentStatus: 'paid', totalUses, remainingUses: totalUses, startedAt: now, activatedAt: now, expiresAt: now + durationDays * 86400000, createdAt: Number(clubRequest.createdAt) || now };
    stage('SUBSCRIPTION_BUILD_OK');
    stage('CREDENTIAL_PREPARE_START');
    const pepper = String(env.LOYALTY_PIN_PEPPER || '');
    if (!pepper) throw Error('INTERNAL_ERROR');
    stage('CREDENTIAL_PEPPER_OK');
    stage('CREDENTIAL_HASH_START');
    const credentialStage = name => { stage(name); };
    const generatedCredential = await security.createCredential(pin, pepper, now, credentialStage);
    const credential = { pinHash: generatedCredential.pinHash, salt: generatedCredential.salt, algorithm: generatedCredential.algorithm, iterations: generatedCredential.iterations, version: generatedCredential.version };
    stage('CREDENTIAL_HASH_OK');
    const updatedRequest = { ...clubRequest, requestId: clubRequest.requestId || requestIdValue, phone: normalizedPhone, status: 'activated', paymentStatus: 'paid', customerId, subscriptionId, clubNumber, activatedAt: now, updatedAt: now };
    const updates = { [`subscription_requests/${requestIdValue}`]: updatedRequest, [`subscription_customers/${customerId}`]: customer, [`subscriptions/${subscriptionId}`]: subscription, [`subscription_activation_logs/${requestIdValue}`]: { type: 'subscription_activated', requestId: requestIdValue, subscriptionId, customerId, uid: current.uid, role: actor.role, createdAt: now } };
    if (customer.uid) updates[`subscription_account_index/${customer.uid}`] = customerId;
    updates[`subscription_credentials/${customerId}`] = credential;
    if (!existingId) updates.subscription_counter = nextCounter;
    stage('INDEX_BUILD_OK');
    return { updates, result: subscriptionActivationResult(requestIdValue, subscriptionId, customerId, customer, pin, false) };
    }, { requestId: requestIdValue, stage: 'ATOMIC_PATCH', onStage: stage });
    stage('ATOMIC_PUT_OK');
    stage('RESPONSE_BUILD_OK');
    return response(request, env, result);
  } catch (err) {
    console.error({ tag: 'SUB_ACTIVATE_FAILED', stage: subscriptionDiagnosticStage(activationStage), code: subscriptionDiagnosticCode(activationStage, err), firebaseOp: err?.firebaseOp || null, firebaseStatus: Number.isInteger(err?.firebaseStatus) ? err.firebaseStatus : firebaseHttpStatus(err) });
    return subscriptionActivationFailure(request, env, activationStage, err);
  }
}
async function changeMembership(request, env, current) { await staff(env, current, 'change-membership'); const p = await body(request), oldId = security.normalizeMembershipNumber(p.oldId), newId = security.normalizeMembershipNumber(p.newId), id = requestId(p); if (!oldId || !newId || oldId === newId) throw Error('INVALID_MEMBERSHIP'); const result = await atomicPlan(env, (root) => { const replay = replayOrPlan(root, 'membership-change', id); if (replay) return replay; const customer = root.loyalty_customers?.[oldId]; if (!customer) throw Error('NOT_FOUND'); if (root.loyalty_customers?.[newId]) throw Error('ALREADY_EXISTS'); const outcome = { ok: true, membershipNumber: newId }; const updates = { [`loyalty_customers/${newId}`]: customer, [`loyalty_customers/${oldId}`]: null, ...(customer.uid ? { [`loyalty_links/${customer.uid}`]: newId } : {}) }; if (id) updates[operationPath('membership-change', id)] = { result: outcome, createdAt: Date.now() }; return { updates, result: outcome }; }); return response(request, env, result); }
async function setLoyaltyPin(request, env, current) { await staff(env, current, 'manage_customers'); const p = await body(request), membership = security.normalizeMembershipNumber(p.membership || p.customerId), pin = String(p.pin || '').trim(), pepper = String(env.LOYALTY_PIN_PEPPER || ''); if (!membership || !security.validPin(pin) || !pepper) throw Error('INVALID_ARGUMENT'); const customer = await firebaseAdminRequest(env, `loyalty_customers/${membership}`); if (!customer) throw Error('NOT_FOUND'); const credential = await createLoyaltyCredential(pin, env); await saveCredentialAndRemoveLegacyPin(env, membership, credential); return response(request, env, { ok: true, saved: true, membershipNumber: membership }); }
async function search(request, env, current) { await staff(env, current, 'search'); const p = await body(request), q = String(p.query || '').trim().toLowerCase(), all = await firebaseAdminRequest(env, 'loyalty_customers') || {}; const found = Object.entries(all).map(([membership, customer]) => ({ membership, customer })).find(({ membership, customer }) => !q || [membership, customer.name, customer.email, customer.phone].some(v => String(v || '').toLowerCase().includes(q))); return response(request, env, { ok: true, customer: found ? safeCustomer(found.membership, found.customer) : null }); }
async function deleteCustomer(request, env, current) { await staff(env, current, 'delete'); const p = await body(request), membership = security.normalizeMembershipNumber(p.membership); if (!membership) throw Error('INVALID_MEMBERSHIP'); const customer = await firebaseAdminRequest(env, `loyalty_customers/${membership}`); if (!customer) return response(request, env, { ok: true, deleted: false }); await firebaseAdminRequest(env, '', { method: 'PATCH', body: { [`loyalty_customers/${membership}`]: null, ...(customer.uid ? { [`loyalty_links/${customer.uid}`]: null } : {}) } }); return response(request, env, { ok: true, deleted: true }); }
async function adjustHearts(request, env, current) { await staff(env, current, 'adjust'); const p = await body(request), membership = security.normalizeMembershipNumber(p.membership || p.customerId), delta = Number(p.amount ?? p.hearts ?? p.change); if (!membership || !Number.isInteger(delta) || Math.abs(delta) > 1000) throw Error('INVALID_ARGUMENT'); const result = await atomicPlan(env, (root) => { const customer = root.loyalty_customers?.[membership]; if (!customer) throw Error('NOT_FOUND'); const currentHearts = Number(customer.currentHearts ?? customer.hearts ?? 0), next = currentHearts + delta; if (!Number.isInteger(currentHearts) || next < 0 || next > 5) throw Error('HEARTS_OUT_OF_RANGE'); return { updates: { [`loyalty_customers/${membership}/currentHearts`]: next, [`loyalty_customers/${membership}/hearts`]: next, [`loyalty_customers/${membership}/updatedAt`]: Date.now() }, result: { ok: true, profile: safeCustomer(membership, { ...customer, currentHearts: next, hearts: next }) } }; }); return response(request, env, result); }
export function planStaffRedemption(root, membership, id, actor = {}, rewardDescription) {
  const replay = replayOrPlan(root, 'redeem', id);
  if (replay) return replay;
  const customer = root.loyalty_customers?.[membership], hearts = Number(customer?.currentHearts ?? customer?.hearts ?? 0);
  if (!customer) throw Error('NOT_FOUND');
  if (!Number.isInteger(hearts) || hearts < 5) throw Error('INSUFFICIENT_HEARTS');
  const redemptionEntries = [
    ...Object.values(root.loyalty_redemption_logs || {}),
    ...Object.values(root.loyalty_logs || {}).filter(log => ['REWARD_REDEEMED', 'REDEEM_REWARD'].includes(log?.type))
  ].filter(log => String(log?.membership || log?.customerId || log?.cardId || '') === membership);
  const redemptionKeys = new Set(), addRedemptionKey = log => {
    const requestKey = String(log?.requestId || '').trim();
    redemptionKeys.add(requestKey ? `request:${requestKey}` : `entry:${redemptionKeys.size}`);
  };
  redemptionEntries.forEach(addRedemptionKey);
  const now = Date.now(), previousCount = redemptionKeys.size;
  const totalRedemptions = Math.max(Number(customer.totalRedemptions || 0), previousCount) + 1;
  const nextCustomer = { ...customer, hearts: 0, currentHearts: 0, totalRedemptions, totalHeartsSpent: Number(customer.totalHeartsSpent || 0) + 5, totalHeartsRedeemed: Number(customer.totalHeartsRedeemed || 0) + 5, updatedAt: now };
  const outcome = { ok: true, profile: safeCustomer(membership, nextCustomer), redemption: { membershipNumber: membership, totalRedemptions } };
  const redemptionLog = { type: 'REWARD_REDEEMED', membership, customerId: membership, cardId: membership, requiredHearts: 5, heartsSpent: 5, createdAt: now, timestamp: now, requestId: id, cashierId: actor.uid || '', cashierName: actor.name || '┘â╪º╪┤┘è╪▒', cashierRole: actor.role || 'cashier' };
  if (rewardDescription !== undefined) redemptionLog.rewardDescription = rewardDescription;
  return { updates: {
    [`loyalty_customers/${membership}/hearts`]: 0,
    [`loyalty_customers/${membership}/currentHearts`]: 0,
    [`loyalty_customers/${membership}/totalRedemptions`]: totalRedemptions,
    [`loyalty_customers/${membership}/totalHeartsSpent`]: nextCustomer.totalHeartsSpent,
    [`loyalty_customers/${membership}/totalHeartsRedeemed`]: nextCustomer.totalHeartsRedeemed,
    [`loyalty_customers/${membership}/updatedAt`]: now,
    [`loyalty_logs/redeem_${id}`]: redemptionLog,
    [`loyalty_redemption_logs/redeem_${id}`]: redemptionLog,
    [operationPath('redeem', id)]: { result: outcome, createdAt: now }
  }, result: outcome };
}

async function redeem(request, env, current) {
  let stage = 'ROLE_CHECK', membership = '', id = '';
  try {
    const actor = await staff(env, current, 'redeem');
    stage = 'INPUT_VALIDATION';
    const p = await body(request);
    membership = security.normalizeMembershipNumber(p.membership || p.customerId);
    id = requestId(p);
    const pin = String(p.pin || '').trim();
    const rewardDescriptionValue = redemptionDescription(p.rewardDescription);
    if (!membership || !id || !pin) throw Error('INVALID_ARGUMENT');
    stage = 'PIN_VERIFY';
    await verifyMemberPin(env, membership, pin);
    stage = 'ATOMIC_REDEMPTION';
    const result = await atomicPlan(env, root => planStaffRedemption(root, membership, id, { uid: current.uid, name: actor.record.displayName || current.name, role: actor.role }, rewardDescriptionValue), { requestId: id, stage: 'STAFF_REDEMPTION_ATOMIC' });
    return response(request, env, result);
  } catch (error) {
    console.error('[LOYALTY_REDEMPTION_FAILURE]', { requestId: id || null, stage, code: String(error?.message || 'UNKNOWN').slice(0, 80) });
    throw error;
  }
}
async function redeemGift(request, env, current) {
  let stage = 'ENTER';
  try {
    giftDiagnostic('[GIFT_REDEEM_ENTER]');
    stage = 'AUTH_OK';
    giftDiagnostic('[GIFT_REDEEM_AUTH_OK]', { present: Boolean(current?.uid) });
    const actor = await staff(env, current, 'redeem-gift');
    stage = 'ROLE_OK';
    giftDiagnostic('[GIFT_REDEEM_ROLE_OK]', { role: actor.role });
    const lookup = await body(request), id = giftId(lookup.giftId);
    if (!id) throw Error('GIFT_NOT_FOUND');
    const snapshot = await firebaseAdminReadWithEtag(env, `gift_orders/${id}`), currentGift = snapshot.data;
    stage = 'RECORD_FOUND';
    giftDiagnostic('[GIFT_REDEEM_RECORD_FOUND]', { found: Boolean(currentGift) });
    if (currentGift?.giftId && String(currentGift.giftId) !== id) throw Error('GIFT_NOT_FOUND');
    const plan = planGiftRedemption({ gift_orders: { [id]: currentGift } }, { giftId: id }, { uid: current.uid, name: actor.record.displayName || current.name, email: current.email, role: actor.role });
    const updated = plan.updates[`gift_orders/${id}`];
    stage = 'ETAG';
    giftDiagnostic('[GIFT_REDEEM_ETAG]', { present: Boolean(snapshot.etag) });
    stage = 'WRITE_START';
    giftDiagnostic('[GIFT_REDEEM_WRITE_START]', { method: 'PUT', path: 'gift_orders/{giftId}', conditional: true });
    try {
      await firebaseAdminConditionalPut(env, `gift_orders/${id}`, updated, snapshot.etag);
      giftDiagnostic('[GIFT_REDEEM_WRITE_STATUS]', { status: 200 });
    } catch (error) {
      const status = firebaseHttpStatus(error);
      giftDiagnostic('[GIFT_REDEEM_WRITE_STATUS]', { status: status || 500 });
      if (status === 412) throw Error('CONCURRENT_MODIFICATION');
      if (status === 401 || status === 403) throw Error('BACKEND_AUTH_ERROR');
      throw error;
    }
    stage = 'WRITE_OK';
    giftDiagnostic('[GIFT_REDEEM_WRITE_OK]', { status: 200 });
    return response(request, env, { ok: true, giftId: id, giftStatus: 'redeemed' });
  } catch (error) {
    const raw = String(error?.message || 'REQUEST_FAILED');
    giftDiagnostic('[GIFT_REDEEM_FAIL]', { stage, safeError: raw.slice(0, 80), httpStatus: raw === 'CONCURRENT_MODIFICATION' ? 409 : raw === 'FORBIDDEN' ? 403 : raw === 'GIFT_NOT_FOUND' ? 404 : null });
    throw error;
  }
}
async function listGiftOrders(request, env, current) { await staff(env, current, 'manage-gifts'); const root = await firebaseAdminRequest(env, 'gift_orders') || {}; const now = Date.now(); const orders = Object.entries(root).map(([id, value]) => { const gift = value || {}, expired = gift.giftStatus === 'active' && gift.expiresAt && Number(gift.expiresAt) <= now; const approvalStatus = gift.paymentStatus === 'rejected' || gift.giftStatus === 'cancelled' ? 'rejected' : gift.giftStatus === 'redeemed' ? 'redeemed' : gift.giftStatus === 'expired' || expired ? 'expired' : gift.paymentStatus === 'paid' || gift.giftStatus === 'active' ? 'approved' : 'pending'; return { id, orderCode: gift.orderCode || '', giftCode: gift.giftCode || '', senderName: gift.senderName || '', recipientName: gift.recipientName || '', recipientPhone: gift.recipientPhone || '', senderPhone: gift.senderPhone || '', productName: gift.productName || '', giftType: gift.giftType || '', giftValue: Number(gift.giftValue || 0), message: gift.message || '', createdAt: gift.createdAt || null, expiresAt: gift.expiresAt || null, paymentStatus: gift.paymentStatus || '', giftStatus: gift.giftStatus || '', approvalStatus, approvedAt: gift.approvedAt || null, rejectedAt: gift.rejectedAt || null, redeemedAt: gift.redeemedAt || null }; }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)); return response(request, env, { ok: true, orders }); }
async function decideGift(request, env, current, decision) { const actor = await staff(env, current, 'manage-gifts'); const payload = await body(request), id = String(payload.giftId || payload.id || '').trim(); if (!id) throw Error('INVALID_ARGUMENT'); const result = await atomicPlan(env, root => planGiftDecision(root, id, decision, { uid: current.uid, name: actor.record.displayName || current.name, email: current.email, role: actor.role })); return response(request, env, result); }
async function consume(request, env, current) {
  const actor = await staff(env, current, 'consume');
  const p = await body(request), id = String(p.subscriptionId || p.id || '').trim(), customerId = String(p.customerId || '').trim();
  const clubNumber = String(p.clubNumber || '').trim(), pin = String(p.pin || '').trim(), requestKey = requestId(p);
  if (!id || !customerId || !security.validPin(pin)) throw Error('INVALID_ARGUMENT');
  const [customer, subscription, credential] = await Promise.all([firebaseAdminRequest(env, `subscription_customers/${customerId}`), firebaseAdminRequest(env, `subscriptions/${id}`), firebaseAdminRequest(env, `subscription_credentials/${customerId}`)]);
  const customerClub = normalizeClubMembership(customer?.clubNumber || customerId)?.canonicalClubId || normalizeClubNumber(customer?.clubNumber || customerId);
  const suppliedClub = normalizeClubMembership(clubNumber)?.canonicalClubId || normalizeClubNumber(clubNumber);
  const relation = subscriptionBelongsToCustomer(subscription, customerId, customer) && (!suppliedClub || suppliedClub === customerClub) && (!customer?.activeSubscriptionId || String(customer.activeSubscriptionId) === id);
  if (!customer || !subscription || !relation) throw Error('CLUB_MEMBER_NOT_FOUND');
  const pepper = String(env.LOYALTY_PIN_PEPPER || '');
  const verified = Boolean(pepper && await security.timingSafePinMatch(pin, credential, pepper));
  if (!verified) throw Error('INVALID_PIN');
  const result = await atomicPlan(env, (root) => {
    const replay = replayOrPlan(root, 'consume', requestKey); if (replay) return replay;
    const sub = root.subscriptions?.[id], now = Date.now();
    if (!sub || sub.status !== 'active' || Number(sub.expiresAt) <= now || Number(sub.remainingUses) <= 0) throw Error('CLUB_UNAVAILABLE');
    const remaining = Number(sub.remainingUses) - 1, outcome = { ok: true, remainingUses: remaining }, logId = `${id}_${requestKey || crypto.randomUUID()}`;
    const updates = { [`subscriptions/${id}/remainingUses`]: remaining, [`subscriptions/${id}/updatedAt`]: now, [`club_consumption_logs/${logId}`]: { subscriptionId: id, customerId, createdAt: now, requestId: requestKey || null, actorUid: current.uid, actorRole: actor.role } };
    if (requestKey) updates[operationPath('consume', requestKey)] = { result: outcome, createdAt: now };
    return { updates, result: outcome };
  });
  return response(request, env, result);
}
async function submitClaim(request, env, current) { if (!current.emailVerified || !current.email) throw Error('VERIFIED_EMAIL_REQUIRED'); const p = await body(request), clubNumber = String(p.clubNumber || '').trim().toUpperCase(), pin = String(p.pin || '').trim(), phone = String(p.phone || '').trim(); if (!/^CLUB-101-\d+$/.test(clubNumber) || !security.validPin(pin)) throw Error('INVALID_ARGUMENT'); const customerId = normalizeClubMembership(clubNumber)?.canonicalClubId, customer = customerId ? await firebaseAdminRequest(env, `subscription_customers/${customerId}`) : null, credential = customerId ? await firebaseAdminRequest(env, `subscription_credentials/${customerId}`) : null; if (!customer || !credential || !await security.timingSafePinMatch(pin, credential, String(env.LOYALTY_PIN_PEPPER || ''))) throw Error('CLAIM_INVALID'); if (customer.uid && customer.uid !== current.uid) throw Error('PROFILE_LINK_CONFLICT'); const updates = { [`subscription_customers/${customerId}/uid`]: current.uid, [`subscription_customers/${customerId}/email`]: customer.email || current.email || '', [`subscription_account_index/${current.uid}`]: customerId }; if (customer.activeSubscriptionId) updates[`subscriptions/${customer.activeSubscriptionId}/uid`] = current.uid; await firebaseAdminRequest(env, '', { method: 'PATCH', body: updates }); return response(request, env, { ok: true, submitted: true, linked: true }); }
async function approveClaim(request, env, current) { await staff(env, current, 'approve-claim'); const p = await body(request), uid = String(p.uid || p.claimId || '').trim(), claim = await firebaseAdminRequest(env, `subscription_account_claims/${uid}`), customerId = String(claim?.customerId || '').trim(), customer = customerId ? await firebaseAdminRequest(env, `subscription_customers/${customerId}`) : null, credential = customerId ? await firebaseAdminRequest(env, `subscription_credentials/${customerId}`) : null; if (!claim || claim.status !== 'pending' || !customer || !credential || customer.clubNumber !== claim.clubNumber) throw Error('CLAIM_INVALID'); const updates = { [`subscription_customers/${customerId}/uid`]: uid, [`subscription_customers/${customerId}/email`]: claim.email || customer.email || '', [`subscription_account_index/${uid}`]: customerId, [`subscription_account_claims/${uid}/status`]: 'approved', [`subscription_account_claims/${uid}/approvedAt`]: Date.now() }; if (customer.activeSubscriptionId) updates[`subscriptions/${customer.activeSubscriptionId}/uid`] = uid; await firebaseAdminRequest(env, '', { method: 'PATCH', body: updates }); return response(request, env, { ok: true, approved: true }); }
async function setPin(request, env, current) { await staff(env, current, 'set-pin'); const p = await body(request), id = String(p.customerId || p.id || '').trim(), pin = String(p.pin || '').trim(), pepper = String(env.LOYALTY_PIN_PEPPER || ''); if (!id || !security.validPin(pin) || !pepper) throw Error('INVALID_ARGUMENT'); const generatedCredential = await security.createCredential(pin, pepper), credential = { pinHash: generatedCredential.pinHash, salt: generatedCredential.salt, algorithm: generatedCredential.algorithm, iterations: generatedCredential.iterations, version: generatedCredential.version }; const customer = await firebaseAdminRequest(env, `subscription_customers/${id}`); if (!customer) throw Error('CLUB_MEMBER_NOT_FOUND'); const updates = { [`subscription_credentials/${id}`]: credential, [`subscription_customers/${id}/pin`]: null }; if (customer.activeSubscriptionId) updates[`subscriptions/${customer.activeSubscriptionId}/pin`] = null; await firebaseAdminRequest(env, '', { method: 'PATCH', body: updates }); return response(request, env, { ok: true, saved: true }); }
async function debugRootSize(request, env, current) {
  const actor = await staff(env, current, 'root-size-diagnostics');
  if (actor.role !== 'super_admin') throw Error('FORBIDDEN');
  const root = await firebaseAdminRequest(env, '');
  const serialized = JSON.stringify(root);
  if (typeof serialized !== 'string') throw Error('INTERNAL_ERROR');
  const sizeBytes = new TextEncoder().encode(serialized).byteLength;
  return response(request, env, { ok: true, sizeBytes, sizeMB: Number((sizeBytes / 1024 / 1024).toFixed(3)), topLevelKeys: root && typeof root === 'object' && !Array.isArray(root) ? Object.keys(root).length : 0 });
}
async function deleteSubscription(request, env, current) {
  const actor = await staff(env, current, 'delete-subscription');
  if (actor.role !== 'super_admin') throw Error('FORBIDDEN');
  const payload = await body(request);
  const subscriptionId = String(payload.subscriptionId || '').trim();
  if (!subscriptionId) throw Error('INVALID_ARGUMENT');

  const result = await atomicPlan(env, async root => {
    const subscriptions = root.subscriptions || {};
    const sub = subscriptions[subscriptionId];
    if (!sub) return { replay: true, result: { ok: true, deleted: false, reason: 'NOT_FOUND' } };

    const customerId = String(sub.customerId || sub.clubNumber || '');
    const uid = String(sub.uid || '');
    const customers = root.subscription_customers || {};
    const index = root.subscription_account_index || {};
    const credentials = root.subscription_credentials || {};

    const updates = {
      [`subscriptions/${subscriptionId}`]: null
    };
    if (customerId && customers[customerId]) updates[`subscription_customers/${customerId}`] = null;
    if (customerId && credentials[customerId]) updates[`subscription_credentials/${customerId}`] = null;
    if (uid && index[uid] === customerId) updates[`subscription_account_index/${uid}`] = null;

    return { updates, result: { ok: true, deleted: true } };
  });

  return response(request, env, result);
}
async function route(request, env, url) {
  if (!url.pathname.startsWith('/api/loyalty/') && !url.pathname.startsWith('/api/subscription/') && !url.pathname.startsWith('/api/admin/')) return null;
  if (url.pathname === '/api/loyalty/provision-google') setProvisionRequestStage(request, request.method === 'OPTIONS' ? 'PREFLIGHT' : 'ROUTE_ENTRY');
  if (request.method === 'OPTIONS') { const preflight = cors(request, env); return preflight ? new Response(null, { status: 204, headers: { ...preflight, ...(url.pathname === '/api/loyalty/provision-google' ? { 'X-Request-ID': provisionRequestId(request).requestId, 'X-Worker-Build': String(env.WORKER_BUILD || PROVISION_BUILD) } : {}) } }) : fail(request, env, 'ORIGIN_NOT_ALLOWED', 403); }
  if (!cors(request, env)) return fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  try {
    if (url.pathname === '/api/loyalty/login' && request.method === 'POST') return await login(request, env);
    if (url.pathname === '/api/subscription/request' && request.method === 'POST') return await requestSubscription(request, env, await optionalAuth(request));
    if (url.pathname === '/api/loyalty/provision-google') setProvisionRequestStage(request, 'AUTH_START');
    const current = await auth(request, env), path = url.pathname;
    if (url.pathname === '/api/loyalty/provision-google') setProvisionRequestStage(request, 'AUTH_OK');
    if (path === '/api/subscription/me' && request.method === 'GET') return await subscriptionMe(request, env, current);
    if (path === '/api/admin/club/search' && request.method === 'POST') return await searchClub(request, env, current);
    if (path === '/api/loyalty/profile' && ['GET', 'POST'].includes(request.method)) return await profile(request, env, current);
    if (path === '/api/loyalty/verify-pin-for-reveal' && request.method === 'POST') return await verifyPinForReveal(request, env, current);
    if (path === '/api/loyalty/reveal-pin' && request.method === 'POST') return await revealPin(request, env, current);
    if (path === '/api/admin/loyalty/reveal-pin' && request.method === 'POST') return await revealPinForAdmin(request, env, current);
    if (path === '/api/admin/loyalty/reveal-pin-authorization' && request.method === 'POST') return await revealPinAuthorization(request, env, current);
    if (path === '/api/admin/loyalty/pin-migration' && request.method === 'POST') return await recoverOriginalPins(request, env, current);
    if (path === '/api/loyalty/provision-google' && request.method === 'POST') return await provision(request, env, current);
    if (path === '/api/admin/provision-super-admin') { await staff(env, current, 'provision-super-admin'); return await provision(request, env, current, true); }
    if (path === '/api/subscription/claim') return await submitClaim(request, env, current);
    if (path === '/api/admin/subscription/activate' && request.method === 'POST') return await activateSubscription(request, env, current);
    if (path === '/api/admin/subscription/delete' && request.method === 'POST') return await deleteSubscription(request, env, current);
    if (path === '/api/admin/loyalty/activate-pending') return await activatePending(request, env, current);
    if (path === '/api/admin/loyalty/create' && request.method === 'POST') return await createLoyaltyCustomer(request, env, current);
    if (path === '/api/admin/loyalty/change-membership') return await changeMembership(request, env, current);
    if (path === '/api/admin/loyalty/set-pin' && request.method === 'POST') return await setLoyaltyPin(request, env, current);
    if (path === '/api/admin/loyalty/search') return await search(request, env, current);
    if (path === '/api/admin/loyalty/delete') return await deleteCustomer(request, env, current);
    if (path === '/api/admin/loyalty/adjust-hearts') return await adjustHearts(request, env, current);
    if (path === '/api/admin/loyalty/redeem') return await redeem(request, env, current);
    if (path === '/api/admin/gift/orders' && request.method === 'GET') return await listGiftOrders(request, env, current);
    if (path === '/api/admin/gift/approve' && request.method === 'POST') return await decideGift(request, env, current, 'approve');
    if (path === '/api/admin/gift/reject' && request.method === 'POST') return await decideGift(request, env, current, 'reject');
    if (path === '/api/admin/gift/redeem' && request.method === 'POST') return await redeemGift(request, env, current);
    if (path === '/api/admin/club/consume') return await consume(request, env, current);
    if (path === '/api/admin/subscription/set-pin') return await setPin(request, env, current);
    if (path === '/api/admin/subscription/approve-claim') return await approveClaim(request, env, current);
    if (path === '/api/admin/debug/root-size' && request.method === 'GET') return await debugRootSize(request, env, current);
    return fail(request, env, 'NOT_FOUND', 404);
  } catch (error) {
    if (url.pathname === '/api/loyalty/reveal-pin') console.error('[PIN_BACKEND_FAIL]', { code: String(error?.message || 'UNKNOWN').slice(0, 80) });
    if (url.pathname === '/api/admin/club/search') console.error('[CLUB_SEARCH_FAIL]', { code: String(error?.message || 'UNKNOWN').slice(0, 80) });
    const requestContextValue = url.pathname === '/api/loyalty/provision-google' ? provisionRequestId(request) : null;
    console.error('[LOYALTY_ROUTE_FAILED]', { path: url.pathname, requestId: requestContextValue?.requestId || null, code: String(error?.message || 'UNKNOWN').slice(0, 80), stage: error?.provisionStage || requestContextValue?.stage || null, firebaseStatus: Number.isInteger(error?.firebaseStatus) ? error.firebaseStatus : null, firebaseOp: error?.firebaseOp || null });
    const rawCode = String(error?.message || '');
    const code = ['AUTH_REQUIRED', 'AUTH_INVALID', 'INVALID_CONTENT_TYPE', 'PAYLOAD_TOO_LARGE', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_EXISTS', 'GIFT_NOT_FOUND', 'GIFT_ALREADY_REDEEMED', 'GIFT_EXPIRED', 'GIFT_NOT_AVAILABLE', 'GIFT_ALREADY_DECIDED', 'GIFT_NOT_PENDING', 'CONCURRENT_MODIFICATION', 'COUNTER_CONFLICT', 'INVALID_ARGUMENT', 'INVALID_FIELD', 'INVALID_INPUT', 'INVALID_MEMBERSHIP', 'INVALID_PENDING', 'INVALID_PIN', 'PIN_GENERATION_FAILED', 'CREDENTIAL_CREATE_FAILED', 'PIN_REVEAL_KEY_NOT_CONFIGURED', 'PROFILE_READBACK_FAILED', 'INSUFFICIENT_HEARTS', 'HEARTS_OUT_OF_RANGE', 'CLUB_UNAVAILABLE', 'CLUB_MEMBER_NOT_FOUND', 'CLUB_PHONE_AMBIGUOUS', 'CLAIM_INVALID', 'PIN_RESERVATION_FAILED', 'PIN_REVEAL_WRITE_UNVERIFIED', 'PIN_BACKUP_UNVERIFIED', 'PIN_RECOVERY_CONFIGURATION_MISSING', 'CONFIRMATION_REQUIRED', 'VERIFIED_EMAIL_REQUIRED', 'PROFILE_NOT_FOUND', 'PROFILE_LINK_CONFLICT', 'BACKEND_AUTH_ERROR', 'INTERNAL_ERROR', 'SUB_REQUEST_NOT_FOUND', 'SUB_REQUEST_NOT_PENDING', 'SUB_PLAN_NOT_FOUND', 'SUB_CUSTOMER_ALREADY_ACTIVE', 'SUB_CUSTOMER_DATA_INCOMPLETE'].includes(rawCode) ? rawCode : rawCode.startsWith('FIREBASE_') ? (rawCode.includes('401') || rawCode.includes('403') ? 'BACKEND_AUTH_ERROR' : 'INTERNAL_ERROR') : 'REQUEST_FAILED';
    const firebaseStatus = Number.isInteger(error?.firebaseStatus) ? error.firebaseStatus : null;
    const status = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : ['CLUB_MEMBER_NOT_FOUND', 'NOT_FOUND', 'PROFILE_NOT_FOUND', 'SUB_REQUEST_NOT_FOUND'].includes(code) ? 404 : firebaseStatus === 401 || firebaseStatus === 403 ? 502 : firebaseStatus >= 500 ? 503 : ['BACKEND_AUTH_ERROR', 'INTERNAL_ERROR', 'PIN_REVEAL_WRITE_UNVERIFIED', 'CREDENTIAL_CREATE_FAILED', 'PIN_REVEAL_KEY_NOT_CONFIGURED', 'PROFILE_READBACK_FAILED'].includes(code) ? 500 : ['GIFT_ALREADY_REDEEMED', 'SUB_REQUEST_NOT_PENDING', 'SUB_CUSTOMER_ALREADY_ACTIVE', 'CONCURRENT_MODIFICATION', 'COUNTER_CONFLICT'].includes(code) ? 409 : code === 'INVALID_CONTENT_TYPE' ? 415 : code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    if (url.pathname === '/api/admin/loyalty/reveal-pin-authorization') return pinRevealAuthorizationFailure(request, env, code, status, ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 'WORKER_AUTHENTICATION' : code === 'FORBIDDEN' ? 'WORKER_AUTHORIZATION' : 'WORKER_FAILURE');
    if (url.pathname === '/api/admin/loyalty/create' && code === 'INVALID_FIELD' && ['name', 'phone', 'hearts', 'memberType', 'requestId'].includes(error?.field)) return response(request, env, { ok: false, error: code, field: error.field }, status);
    return response(request, env, { ok: false, error: code, ...(error?.provisionStage ? { stage: error.provisionStage } : {}), ...(firebaseStatus ? { upstreamStatus: firebaseStatus } : {}) }, status);
  }
}
async function handleProductImageRoute(request, env, url) {
  if (url.pathname !== '/api/admin/products/upload-image') return null;
  if (request.method === 'OPTIONS') return cors(request, env) ? new Response(null, { status: 204, headers: cors(request, env) }) : fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  if (request.method !== 'POST') return fail(request, env, 'METHOD_NOT_ALLOWED', 405);
  if (!cors(request, env)) return fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  try { return await uploadProductImage(request, env, await auth(request)); }
  catch (error) {
    const code = ['AUTH_REQUIRED', 'AUTH_INVALID', 'FORBIDDEN', 'IMAGE_REQUIRED', 'IMAGE_TYPE_UNSUPPORTED', 'IMAGE_TOO_LARGE', 'IMAGE_RATE_LIMITED', 'IMAGE_STORAGE_NOT_CONFIGURED', 'IMAGE_UPLOAD_FAILED'].includes(error?.message) ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'IMAGE_TOO_LARGE' ? 413 : code === 'IMAGE_RATE_LIMITED' ? 429 : 400;
    return fail(request, env, code, status);
  }
}
async function handleWorkshopImageRoute(request, env, url) {
  if (url.pathname !== '/api/admin/events/upload-image') return null;
  if (request.method === 'OPTIONS') return cors(request, env) ? new Response(null, { status: 204, headers: cors(request, env) }) : fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  if (request.method !== 'POST') return fail(request, env, 'METHOD_NOT_ALLOWED', 405);
  if (!cors(request, env)) return fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  try { return await uploadWorkshopImage(request, env, await auth(request)); }
  catch (error) {
    const code = ['AUTH_REQUIRED', 'AUTH_INVALID', 'FORBIDDEN', 'IMAGE_REQUIRED', 'IMAGE_TYPE_UNSUPPORTED', 'IMAGE_TOO_LARGE', 'IMAGE_RATE_LIMITED', 'IMAGE_STORAGE_NOT_CONFIGURED', 'IMAGE_UPLOAD_FAILED'].includes(error?.message) ? error.message : 'IMAGE_UPLOAD_FAILED';
    const status = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'IMAGE_TOO_LARGE' ? 413 : code === 'IMAGE_RATE_LIMITED' ? 429 : 400;
    return fail(request, env, code, status);
  }
}
async function handleBackgroundVideoRoute(request, env, url) {
  if (url.pathname !== '/api/admin/background/upload-video') return null;
  if (request.method === 'OPTIONS') return cors(request, env) ? new Response(null, { status: 204, headers: cors(request, env) }) : fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  if (request.method !== 'POST') return fail(request, env, 'METHOD_NOT_ALLOWED', 405);
  if (!cors(request, env)) return fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  try { return await uploadBackgroundVideo(request, env, await auth(request)); }
  catch (error) {
    const code = ['AUTH_REQUIRED', 'AUTH_INVALID', 'FORBIDDEN', 'VIDEO_REQUIRED', 'VIDEO_TYPE_UNSUPPORTED', 'VIDEO_TOO_LARGE', 'VIDEO_STORAGE_NOT_CONFIGURED', 'VIDEO_UPLOAD_FAILED'].includes(error?.message) ? error.message : 'VIDEO_UPLOAD_FAILED';
    const status = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'VIDEO_TOO_LARGE' ? 413 : 400;
    return fail(request, env, code, status);
  }
}
async function handleBackgroundPosterRoute(request, env, url) {
  if (url.pathname !== '/api/admin/background/upload-poster') return null;
  if (request.method === 'OPTIONS') return cors(request, env) ? new Response(null, { status: 204, headers: cors(request, env) }) : fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  if (request.method !== 'POST') return fail(request, env, 'METHOD_NOT_ALLOWED', 405);
  if (!cors(request, env)) return fail(request, env, 'ORIGIN_NOT_ALLOWED', 403);
  try { return await uploadBackgroundPoster(request, env, await auth(request)); }
  catch (error) {
    const code = ['AUTH_REQUIRED', 'AUTH_INVALID', 'FORBIDDEN', 'POSTER_REQUIRED', 'POSTER_TYPE_UNSUPPORTED', 'POSTER_TOO_LARGE', 'POSTER_STORAGE_NOT_CONFIGURED', 'POSTER_UPLOAD_FAILED'].includes(error?.message) ? error.message : 'POSTER_UPLOAD_FAILED';
    const status = ['AUTH_REQUIRED', 'AUTH_INVALID'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'POSTER_TOO_LARGE' ? 413 : 400;
    return fail(request, env, code, status);
  }
}
async function handleLoyaltyRoutes(request, env, url) {
  try {
    return await handleBackgroundVideoRoute(request, env, url) || await handleBackgroundPosterRoute(request, env, url) || await handleProductImageRoute(request, env, url) || await handleWorkshopImageRoute(request, env, url) || route(request, env, url);
  } catch (error) {
    const path = url?.pathname || '';
    if (!path.startsWith('/api/loyalty/') && !path.startsWith('/api/subscription/') && !path.startsWith('/api/admin/')) throw error;
    console.error('[LOYALTY_UNHANDLED_EXCEPTION]', { path, code: String(error?.message || 'UNKNOWN').slice(0, 80), stage: error?.provisionStage || null, firebaseStatus: Number.isInteger(error?.firebaseStatus) ? error.firebaseStatus : null });
    const firebaseStatus = Number.isInteger(error?.firebaseStatus) ? error.firebaseStatus : null;
    return response(request, env, { ok: false, error: 'INTERNAL_ERROR', ...(error?.provisionStage ? { stage: error.provisionStage } : {}), ...(firebaseStatus ? { upstreamStatus: firebaseStatus } : {}) }, firebaseStatus >= 500 ? 503 : 500);
  }
}
export { handleLoyaltyRoutes, provision, clubSearchQuery, normalizeIraqiPhone, normalizeClubMembership, safeCustomer, safeClubCustomer, safeSubscriptionMe, backgroundVideoType, backgroundPosterType, videoExtension, subscriptionActivationFailure };
