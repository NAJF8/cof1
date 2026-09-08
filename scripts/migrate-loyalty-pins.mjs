#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const inputIndex = process.argv.indexOf("--input");
const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : null;
const apply = args.has("--apply");
const confirmApply = args.has("--confirm-apply");
const dryRun = !apply;
const ITERATIONS = 310000;

if (apply && !confirmApply) throw new Error("Refusing APPLY without --confirm-apply.");
if (apply && !process.env.LOYALTY_PIN_PEPPER) throw new Error("LOYALTY_PIN_PEPPER is required for APPLY and must be supplied from a secret environment, never a CLI argument.");
if (!inputPath && !process.env.FIREBASE_DATABASE_URL) throw new Error("Provide --input for local dry-run, or FIREBASE_DATABASE_URL with Firebase Admin credentials. This script never deploys rules or functions.");

function normalizeMembership(value) { const v = String(value || "").trim().toUpperCase().replace(/\s+/g, ""); return /^101-[1-9]\d{0,11}$/.test(v) ? v : null; }
function validPin(value) { return /^\d{4,6}$/.test(String(value || "")); }
function hashPin(pin, salt, pepper) { return crypto.pbkdf2Sync(`${pin}:${pepper}`, Buffer.from(salt, "base64"), ITERATIONS, 64, "sha512").toString("base64"); }

let customers;
let db = null;
if (inputPath) {
  customers = JSON.parse(await fs.readFile(inputPath, "utf8"));
} else {
  const admin = (await import("firebase-admin")).default;
  if (!admin.apps.length) admin.initializeApp({ databaseURL: process.env.FIREBASE_DATABASE_URL });
  db = admin.database();
  customers = (await db.ref("loyalty_customers").once("value")).val() || {};
}

const summary = { mode: dryRun ? "DRY_RUN" : "APPLY", recordsScanned: 0, plaintextPinCount: 0, customersWithoutPin: 0, migratable: 0, invalidRecords: 0, conflicts: 0 };
const normalized = new Map();
const planned = [];
for (const [rawMembership, customer] of Object.entries(customers || {})) {
  summary.recordsScanned += 1;
  const membership = normalizeMembership(rawMembership);
  if (!membership) { summary.invalidRecords += 1; continue; }
  if (normalized.has(membership)) { summary.conflicts += 1; continue; }
  normalized.set(membership, rawMembership);
  if (customer?.pin === undefined || customer?.pin === null || customer.pin === "") { summary.customersWithoutPin += 1; continue; }
  summary.plaintextPinCount += 1;
  if (!validPin(customer.pin)) { summary.invalidRecords += 1; continue; }
  summary.migratable += 1;
  planned.push({ membership, pin: String(customer.pin) });
}

if (apply) {
  for (const record of planned) {
    const salt = crypto.randomBytes(32).toString("base64");
    const credential = { pinHash: hashPin(record.pin, salt, process.env.LOYALTY_PIN_PEPPER), salt, version: 1, failedAttempts: 0, lockedUntil: 0, updatedAt: Date.now(), migrationStatus: "migrated" };
    await db.ref(`loyalty_credentials/${record.membership}`).set(credential);
    const saved = (await db.ref(`loyalty_credentials/${record.membership}`).once("value")).val();
    if (!saved?.pinHash || saved.pinHash !== credential.pinHash) throw new Error(`Read-back failed for ${record.membership}`);
  }
}
console.log(JSON.stringify(summary));
