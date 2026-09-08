"use strict";

const admin = require("firebase-admin");
const crypto = require("crypto");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const loyaltySecurity = require("./loyalty-security");

if (!admin.apps.length) admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const LOYALTY_PIN_PEPPER = defineSecret("LOYALTY_PIN_PEPPER");
const ALLOWED_ORIGINS = [
  "https://najf8.github.io",
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/
];
const MODEL_PATTERN = /^[a-z0-9._-]{1,80}$/i;
const SUPER_ADMIN_EMAIL = "mohameadalhaear100@gmail.com";

function cleanText(value, limit = 900) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

const AI_ERROR_REPLY = "المساعد غير متاح حالياً، حاول مرة أخرى.";

function clientIp(request) {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.rawRequest?.ip || "unknown").split(",")[0].trim().slice(0, 64);
}

function genericLoginError() {
  return new HttpsError("unauthenticated", "رقم العضوية أو رمز PIN غير صحيح.");
}

function normalizedVerifiedEmail(request) {
  const email = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (!request.auth?.uid || !request.auth?.token?.email_verified || !email) {
    throw new HttpsError("permission-denied", "A verified Google email is required.");
  }
  return email;
}

async function findGoogleOwnedCustomer(db, uid, email) {
  const byUid = await db.ref("loyalty_customers").orderByChild("uid").equalTo(uid).once("value");
  const uidMatches = [];
  byUid.forEach((child) => uidMatches.push({ membership: child.key, customer: child.val() || {} }));
  if (uidMatches.length > 1) throw new HttpsError("failed-precondition", "Multiple loyalty profiles are linked to this account.");
  if (uidMatches.length === 1) return uidMatches[0];

  // Email fallback is deliberately narrow: only a verified Google email may claim
  // one legacy record that has not already been linked to a different UID.
  const byEmail = await db.ref("loyalty_customers").orderByChild("email").equalTo(email).once("value");
  const emailMatches = [];
  byEmail.forEach((child) => {
    const customer = child.val() || {};
    if (!customer.uid || String(customer.uid) === uid) emailMatches.push({ membership: child.key, customer });
  });
  if (emailMatches.length > 1) throw new HttpsError("failed-precondition", "Multiple loyalty profiles match this email.");
  return emailMatches[0] || null;
}

exports.provisionGoogleSuperAdmin = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    const uid = String(request.auth?.uid || "");
    const email = normalizedVerifiedEmail(request);
    if (email !== SUPER_ADMIN_EMAIL) throw new HttpsError("permission-denied", "Super Admin access is restricted.");
    const db = admin.database();
    const now = Date.now();
    const customerRef = db.ref("loyalty_customers/101-1");
    const current = (await customerRef.once("value")).val() || {};
    const customer = {
      ...current,
      uid,
      email,
      name: String(current.name || request.auth.token.name || "Super Admin").slice(0, 120),
      memberType: "Super Admin",
      hearts: Number(current.hearts || 0),
      createdAt: Number(current.createdAt || now),
      updatedAt: now
    };
    if (!customer.pin) customer.pin = "0224";
    const addedAt = Number((await db.ref(`admins/${uid}/addedAt`).once("value")).val() || now);
    await db.ref().update({
      [`admins/${uid}`]: { email, displayName: String(request.auth.token.name || "Super Admin").slice(0, 120), role: "super_admin", status: "active", addedAt, addedBy: "server" },
      "loyalty_customers/101-1": customer,
      [`loyalty_links/${uid}`]: "101-1"
    });
    await db.ref("loyalty_counter").transaction((value) => Math.max(Number(value) || 0, 2));
    return { provisioned: true, membershipNumber: "101-1", role: "super_admin" };
  }
);

function assertActiveStaff(request, roles = ["super_admin", "admin", "manager"]) {
  const uid = String(request.auth?.uid || "");
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return admin.database().ref(`admins/${uid}`).once("value").then((snap) => {
    const record = snap.val() || {};
    if (record.status !== "active" || !roles.includes(String(record.role || ""))) throw new HttpsError("permission-denied", "Insufficient staff permissions.");
    return { uid, record };
  });
}

exports.activatePendingLoyalty = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    await assertActiveStaff(request);
    const uid = String(request.data?.uid || "").trim();
    if (!/^[A-Za-z0-9_-]{6,180}$/.test(uid)) throw new HttpsError("invalid-argument", "Invalid pending user.");
    const db = admin.database();
    const pendingRef = db.ref(`loyalty_pending/${uid}`);
    const pending = (await pendingRef.once("value")).val();
    if (!pending || pending.status !== "pending") throw new HttpsError("failed-precondition", "Pending request is unavailable.");
    const existingLink = (await db.ref(`loyalty_links/${uid}`).once("value")).val();
    if (existingLink) { await pendingRef.remove(); return { membershipNumber: String(existingLink), existing: true }; }
    const claim = await pendingRef.transaction((value) => value && value.status === "pending" ? { ...value, status: "activating", updatedAt: Date.now() } : value);
    if (!claim.committed || claim.snapshot.val()?.status !== "activating") throw new HttpsError("aborted", "Request is being processed.");
    const counter = await db.ref("loyalty_counter").transaction((value) => (Number(value) || 0) + 1);
    if (!counter.committed) throw new HttpsError("aborted", "Could not reserve membership number.");
    const membership = `101-${Number(counter.snapshot.val())}`;
    const customerRef = db.ref(`loyalty_customers/${membership}`);
    if ((await customerRef.once("value")).exists()) throw new HttpsError("aborted", "Membership number is already reserved.");
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    await db.ref().update({
      [`loyalty_customers/${membership}`]: { uid, name: String(pending.displayName || pending.email || "عضو 101").slice(0, 120), displayName: String(pending.displayName || "").slice(0, 120), email: String(pending.email || "").slice(0, 180), photoURL: String(pending.photoURL || "").slice(0, 500), memberType: "زبون", membershipStatus: "عضو مميز", hearts: 0, currentHearts: 0, totalEarned: 0, totalHeartsEarned: 0, totalSpent: 0, totalHeartsSpent: 0, totalHeartsRedeemed: 0, pin, createdAt: Date.now(), updatedAt: Date.now() },
      [`loyalty_links/${uid}`]: membership,
      [`loyalty_pending/${uid}`]: null
    });
    return { membershipNumber: membership, existing: false };
  }
);

exports.reserveClubPin = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    await assertActiveStaff(request);
    const customerId = String(request.data?.customerId || "").trim();
    if (!customerId || customerId.length > 180) throw new HttpsError("invalid-argument", "Invalid customer.");
    const db = admin.database();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const pin = String(crypto.randomInt(1000, 10000));
      const result = await db.ref(`subscription_pin_index/${pin}`).transaction((value) => value || customerId);
      if (result.committed && String(result.snapshot.val()) === customerId) return { pin };
    }
    throw new HttpsError("aborted", "Could not reserve a unique CLUB PIN.");
  }
);

exports.changeLoyaltyMembership = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    await assertActiveStaff(request);
    const oldId = loyaltySecurity.normalizeMembershipNumber(request.data?.oldId);
    const newId = loyaltySecurity.normalizeMembershipNumber(request.data?.newId);
    if (!oldId || !newId || oldId === newId) throw new HttpsError("invalid-argument", "Invalid membership numbers.");
    const db = admin.database();
    const oldSnap = await db.ref(`loyalty_customers/${oldId}`).once("value");
    const customer = oldSnap.val();
    if (!customer) throw new HttpsError("not-found", "Membership was not found.");
    if ((await db.ref(`loyalty_customers/${newId}`).once("value")).exists()) throw new HttpsError("already-exists", "Membership number is already in use.");
    const updates = { [`loyalty_customers/${newId}`]: customer, [`loyalty_customers/${oldId}`]: null };
    if (customer.uid) updates[`loyalty_links/${customer.uid}`] = newId;
    await db.ref().update(updates);
    return { membershipNumber: newId };
  }
);

exports.deleteLoyaltyCustomer = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    await assertActiveStaff(request);
    const membership = loyaltySecurity.normalizeMembershipNumber(request.data?.membership);
    if (!membership) throw new HttpsError("invalid-argument", "Invalid membership number.");
    const db = admin.database();
    const customer = (await db.ref(`loyalty_customers/${membership}`).once("value")).val();
    if (!customer) return { deleted: false };
    const updates = { [`loyalty_customers/${membership}`]: null };
    if (customer.uid) updates[`loyalty_links/${customer.uid}`] = null;
    await db.ref().update(updates);
    return { deleted: true };
  }
);

exports.provisionGoogleLoyalty = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    const uid = String(request.auth?.uid || "");
    const email = normalizedVerifiedEmail(request);
    const db = admin.database();
    const linkRef = db.ref(`loyalty_links/${uid}`);
    const existingLink = loyaltySecurity.normalizeMembershipNumber((await linkRef.once("value")).val());
    if (existingLink) {
      const customer = (await db.ref(`loyalty_customers/${existingLink}`).once("value")).val();
      if (!customer || String(customer.uid || "") !== uid) throw new HttpsError("permission-denied", "Loyalty link ownership conflict.");
      return { profile: loyaltySecurity.publicProfile(existingLink, customer), provisioned: false };
    }

    const matched = await findGoogleOwnedCustomer(db, uid, email);
    if (matched) {
      const membership = loyaltySecurity.normalizeMembershipNumber(matched.membership);
      if (!membership || (matched.customer.uid && String(matched.customer.uid) !== uid)) throw new HttpsError("permission-denied", "Loyalty ownership conflict.");
      const reserved = await linkRef.transaction((current) => current || membership);
      if (String(reserved.snapshot.val() || "") !== membership) throw new HttpsError("failed-precondition", "Loyalty link conflict.");
      if (!matched.customer.uid) await db.ref(`loyalty_customers/${membership}/uid`).set(uid);
      const customer = { ...matched.customer, uid };
      return { profile: loyaltySecurity.publicProfile(membership, customer), provisioned: false };
    }

    // Preserve the existing counter-based membership format. A PIN is not created
    // here: Google-authenticated customers never receive a plaintext PIN response.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const counter = await db.ref("loyalty_counter").transaction((value) => (Number(value) || 0) + 1);
      if (!counter.committed) throw new HttpsError("aborted", "Could not reserve a membership number.");
      const membership = `101-${Number(counter.snapshot.val())}`;
      const customerRef = db.ref(`loyalty_customers/${membership}`);
      if ((await customerRef.once("value")).exists()) continue;
      const reserved = await linkRef.transaction((current) => current || membership);
      const linkedMembership = loyaltySecurity.normalizeMembershipNumber(reserved.snapshot.val());
      if (linkedMembership !== membership) {
        const linkedCustomer = (await db.ref(`loyalty_customers/${linkedMembership}`).once("value")).val();
        if (!linkedCustomer || String(linkedCustomer.uid || "") !== uid) throw new HttpsError("permission-denied", "Loyalty link conflict.");
        return { profile: loyaltySecurity.publicProfile(linkedMembership, linkedCustomer), provisioned: false };
      }
      const now = Date.now();
      const created = await customerRef.transaction((current) => current || ({
        uid,
        name: String(request.auth.token.name || "عضو 101").slice(0, 120),
        displayName: String(request.auth.token.name || "").slice(0, 120),
        email,
        photoURL: String(request.auth.token.picture || "").slice(0, 500),
        memberType: "زبون",
        membershipStatus: "عضو مميز",
        hearts: 0,
        currentHearts: 0,
        totalEarned: 0,
        totalHeartsEarned: 0,
        totalSpent: 0,
        totalHeartsSpent: 0,
        totalHeartsRedeemed: 0,
        createdAt: now,
        updatedAt: now
      }));
      const customer = created.snapshot.val();
      if (!customer || String(customer.uid || "") !== uid) throw new HttpsError("failed-precondition", "Membership provisioning conflict.");
      return { profile: loyaltySecurity.publicProfile(membership, customer), provisioned: true };
    }
    throw new HttpsError("aborted", "Could not allocate a membership number.");
  }
);

async function recordFailedPinAttempt(db, membershipNumber, ip, pepper, now) {
  const key = loyaltySecurity.attemptKey(membershipNumber, ip, pepper);
  const ref = db.ref(`loyalty_login_attempts/${key}`);
  const result = await ref.transaction((current) => {
    const value = current || {};
    const firstFailureAt = Number(value.firstFailureAt || 0);
    const inWindow = firstFailureAt > 0 && now - firstFailureAt < loyaltySecurity.WINDOW_MS;
    const failedAttempts = inWindow ? Number(value.failedAttempts || 0) + 1 : 1;
    return { failedAttempts, firstFailureAt: inWindow ? firstFailureAt : now, lastFailureAt: now, lockedUntil: Number(value.lockedUntil || 0) };
  });
  return result.snapshot.val() || {};
}

async function assertNotRateLimited(db, membershipNumber, ip, pepper, now) {
  const key = loyaltySecurity.attemptKey(membershipNumber, ip, pepper);
  const ref = db.ref(`loyalty_login_attempts/${key}`);
  const result = await ref.transaction((current) => {
    const value = current || {};
    const firstFailureAt = Number(value.firstFailureAt || 0);
    const inWindow = firstFailureAt > 0 && now - firstFailureAt < loyaltySecurity.WINDOW_MS;
    const failedAttempts = inWindow ? Number(value.failedAttempts || 0) : 0;
    const lockedUntil = Number(value.lockedUntil || 0);
    if (lockedUntil > now) return value;
    if (failedAttempts >= loyaltySecurity.MAX_FAILURES) return { ...value, lockedUntil: now + loyaltySecurity.WINDOW_MS, lastFailureAt: now };
    return value;
  });
  const state = result.snapshot.val() || {};
  if (Number(state.lockedUntil || 0) > now) throw new HttpsError("resource-exhausted", "محاولات كثيرة. حاول لاحقاً.");
  return { key, ref };
}

async function markLoginSuccess(ref) {
  await ref.remove();
}

exports.loginWithMembership = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, secrets: [LOYALTY_PIN_PEPPER], enforceAppCheck: false },
  async (request) => {
    const membershipNumber = loyaltySecurity.normalizeMembershipNumber(request.data?.membershipNumber);
    const pin = String(request.data?.pin || "");
    if (!membershipNumber || !loyaltySecurity.validPin(pin)) throw genericLoginError();

    const db = admin.database();
    const pepper = LOYALTY_PIN_PEPPER.value();
    if (!pepper) { logger.error("LOYALTY_PIN_PEPPER_MISSING"); throw new HttpsError("failed-precondition", "Loyalty login is temporarily unavailable."); }
    const now = Date.now();
    const ip = clientIp(request);
    const throttle = await assertNotRateLimited(db, membershipNumber, ip, pepper, now);
    const [customerSnap, credentialSnap] = await Promise.all([
      db.ref(`loyalty_customers/${membershipNumber}`).once("value"),
      db.ref(`loyalty_credentials/${membershipNumber}`).once("value")
    ]);
    const customer = customerSnap.val();
    const credential = credentialSnap.val();
    let verified = credential ? loyaltySecurity.timingSafePinMatch(pin, credential, pepper) : false;

    // Transitional fallback: the plaintext value is read only by this trusted runtime,
    // immediately upgraded to a KDF credential, and never returned or logged.
    if (!verified && !credential && customer && loyaltySecurity.validPin(customer.pin)) {
      const legacy = Buffer.from(String(customer.pin));
      const submitted = Buffer.from(pin);
      verified = legacy.length === submitted.length && require("crypto").timingSafeEqual(legacy, submitted);
      if (verified) await db.ref(`loyalty_credentials/${membershipNumber}`).set(loyaltySecurity.createCredential(pin, pepper, now));
    }
    if (!customer || !verified) {
      await recordFailedPinAttempt(db, membershipNumber, ip, pepper, now);
      logger.warn("LOYALTY_PIN_LOGIN_REJECTED", { membershipNumber, reason: customer ? "invalid_credentials" : "invalid_credentials" });
      throw genericLoginError();
    }

    const uid = String(customer.uid || `loyalty-member:${membershipNumber}`);
    if (customer.uid && customer.uid !== uid) throw genericLoginError();
    const linkSnap = await db.ref(`loyalty_links/${uid}`).once("value");
    if (linkSnap.exists() && String(linkSnap.val()) !== membershipNumber) {
      logger.warn("LOYALTY_LINK_CONFLICT", { membershipNumber, uid });
      throw new HttpsError("failed-precondition", "لا يمكن ربط هذه العضوية حالياً.");
    }
    const updates = {};
    if (!customer.uid) updates[`loyalty_customers/${membershipNumber}/uid`] = uid;
    if (!linkSnap.exists()) updates[`loyalty_links/${uid}`] = membershipNumber;
    if (Object.keys(updates).length) await db.ref().update(updates);
    await markLoginSuccess(throttle.ref);
    const token = await admin.auth().createCustomToken(uid, { loyaltyMembership: membershipNumber });
    return { token, profile: loyaltySecurity.publicProfile(membershipNumber, customer) };
  }
);

exports.getMyLoyaltyProfile = onCall(
  { region: "us-central1", cors: ALLOWED_ORIGINS, enforceAppCheck: false },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    const db = admin.database();
    const membershipSnap = await db.ref(`loyalty_links/${request.auth.uid}`).once("value");
    const membershipNumber = loyaltySecurity.normalizeMembershipNumber(membershipSnap.val());
    if (!membershipNumber) throw new HttpsError("not-found", "No linked loyalty profile.");
    const customer = (await db.ref(`loyalty_customers/${membershipNumber}`).once("value")).val();
    if (!customer || String(customer.uid || "") !== request.auth.uid) throw new HttpsError("permission-denied", "Loyalty link conflict.");
    return { profile: loyaltySecurity.publicProfile(membershipNumber, customer) };
  }
);

exports.aiChat = onCall(
  {
    region: "us-central1",
    cors: ALLOWED_ORIGINS,
    secrets: [GEMINI_API_KEY],
    enforceAppCheck: false
  },
  async (request) => {
    const text = cleanText(request.data?.text);
    const language = request.data?.language === "en" ? "en" : "ar";
    if (!text) throw new HttpsError("invalid-argument", "A chat message is required.");

    try {
      const configSnap = await admin.database().ref("ai_config").once("value");
      const config = configSnap.val() || {};
      if (config.enabled === false) throw new HttpsError("failed-precondition", "The AI assistant is disabled.");

      const apiKey = GEMINI_API_KEY.value();
      if (!apiKey) {
        logger.error("AI_CHAT_SECRET_MISSING");
        throw new HttpsError("failed-precondition", "The Gemini API key is not configured.");
      }

      const model = MODEL_PATTERN.test(config.model || "") ? config.model : "gemini-1.5-flash";
      const systemPrompt = cleanText(config.systemPrompt, 1800) || "أنت باريستا ودود في 101 COFFEE. أجب باختصار وبلهجة عراقية لطيفة.";
      const shopInfo = cleanText(config.shopInfo, 1000);
      const prompt = `${systemPrompt}\n${shopInfo ? `معلومات المقهى: ${shopInfo}\n` : ""}رسالة العميل: ${text}`;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        logger.error("AI_CHAT_GEMINI_FAILED", { status: response.status, message: payload?.error?.message || "Unknown Gemini error" });
        throw new HttpsError("internal", "The AI service is temporarily unavailable.");
      }
      const reply = cleanText(payload?.candidates?.[0]?.content?.parts?.[0]?.text, 1400);
      return { reply: reply || AI_ERROR_REPLY };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("AI_CHAT_FAILED", error);
      throw new HttpsError("internal", "The AI service is temporarily unavailable.");
    }
  }
);
