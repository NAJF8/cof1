"use strict";

const crypto = require("crypto");

const PIN_ITERATIONS = 310000;
const PIN_KEY_LENGTH = 64;
const PIN_DIGEST = "sha512";
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function normalizeMembershipNumber(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^101-[1-9]\d{0,11}$/.test(normalized)) return null;
  return normalized;
}

function validPin(value) {
  return /^\d{4,6}$/.test(String(value || ""));
}

function derivePin(pin, salt, pepper) {
  return crypto.pbkdf2Sync(`${String(pin)}:${String(pepper)}`, Buffer.from(String(salt), "base64"), PIN_ITERATIONS, PIN_KEY_LENGTH, PIN_DIGEST).toString("base64");
}

function createCredential(pin, pepper, now = Date.now()) {
  if (!validPin(pin)) throw new Error("INVALID_PIN_FORMAT");
  const salt = crypto.randomBytes(32).toString("base64");
  return {
    pinHash: derivePin(pin, salt, pepper),
    salt,
    version: 1,
    failedAttempts: 0,
    lockedUntil: 0,
    updatedAt: now
  };
}

function timingSafePinMatch(pin, credential, pepper) {
  if (!credential?.pinHash || !credential?.salt || !validPin(pin)) return false;
  const submitted = Buffer.from(derivePin(pin, credential.salt, pepper), "base64");
  const stored = Buffer.from(String(credential.pinHash), "base64");
  return submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);
}

function attemptKey(membershipNumber, ip, pepper) {
  return crypto.createHmac("sha256", String(pepper)).update(`${membershipNumber}\n${ip || "unknown"}`).digest("hex");
}

function publicProfile(membershipNumber, customer) {
  return {
    membershipNumber,
    name: String(customer?.name || customer?.displayName || "عضو 101").slice(0, 120),
    currentHearts: Number(customer?.currentHearts ?? customer?.hearts ?? 0),
    memberType: String(customer?.memberType || customer?.membershipStatus || "عضو مميز").slice(0, 80),
    clubNumber: customer?.clubNumber ? String(customer.clubNumber).slice(0, 80) : null,
    subscription: customer?.activeSubscriptionId ? { active: true } : null
  };
}

module.exports = {
  MAX_FAILURES,
  WINDOW_MS,
  normalizeMembershipNumber,
  validPin,
  createCredential,
  timingSafePinMatch,
  attemptKey,
  publicProfile
};
