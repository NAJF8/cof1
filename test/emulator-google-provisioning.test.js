"use strict";

const assert = require("assert");
const admin = require("../functions/node_modules/firebase-admin");

const PROJECT_ID = "demo-101-coffee";
const AUTH_URL = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTION_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/provisionGoogleLoyalty`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.GCLOUD_PROJECT = PROJECT_ID;

function baseData() {
  return {
    loyalty_counter: 101,
    loyalty_customers: {
      "101-100": { uid: "customer-a-uid", email: "customer.a@example.test", name: "CUSTOMER_A", pin: "1234", hearts: 2 },
      "101-101": { uid: "customer-b-uid", email: "customer.b@example.test", name: "CUSTOMER_B", pin: "5678", hearts: 1 }
    },
    loyalty_links: { "customer-a-uid": "101-100", "customer-b-uid": "101-101" }
  };
}

async function createUser(uid, email, password = "TestPass123!") {
  const auth = admin.auth();
  try { await auth.deleteUser(uid); } catch (_) { /* fixture reset */ }
  await auth.createUser({ uid, email, password, emailVerified: true, displayName: uid });
  const response = await fetch(`${AUTH_URL}/accounts:signInWithPassword?key=${PROJECT_ID}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text).idToken;
}

async function call(token) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: {} })
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID, databaseURL: "http://127.0.0.1:9000?ns=demo-101-coffee" });
  const db = admin.database();
  await db.ref("/").set(baseData());

  const newToken = await createUser("google-new-uid", "new.user@example.test");
  const fresh = await call(newToken);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.payload.result.provisioned, true);
  process.stdout.write(`NEW_USER=${fresh.payload.result.profile.membershipNumber}\n`);

  const existingToken = await createUser("customer-a-uid", "customer.a@example.test");
  const existing = await call(existingToken);
  assert.equal(existing.status, 200);
  assert.equal(existing.payload.result.provisioned, false);
  assert.equal(existing.payload.result.profile.membershipNumber, "101-100");
  process.stdout.write("EXISTING_USER=101-100\n");

  const reopened = await call(newToken);
  assert.equal(reopened.status, 200);
  assert.equal(reopened.payload.result.profile.membershipNumber, fresh.payload.result.profile.membershipNumber);
  process.stdout.write("REFRESH_REOPEN=SAME_MEMBERSHIP\n");

  await db.ref("loyalty_customers/101-110").set({ email: "duplicate@example.test", name: "DUPLICATE_A" });
  await db.ref("loyalty_customers/101-111").set({ email: "duplicate@example.test", name: "DUPLICATE_B" });
  const duplicateToken = await createUser("google-duplicate-uid", "duplicate@example.test");
  const duplicate = await call(duplicateToken);
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.payload.error.status, "FAILED_PRECONDITION");
  process.stdout.write("DUPLICATE_EMAIL=DENY\n");

  const customers = (await db.ref("loyalty_customers").once("value")).val() || {};
  assert.equal(Object.keys(customers).filter((key) => customers[key]?.uid === "google-new-uid").length, 1);
  process.stdout.write("GOOGLE_PROVISIONING_EMULATOR=PASS\n");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
