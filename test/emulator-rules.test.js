"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { ref, get, set } = require("firebase/database");

const PROJECT_ID = "demo-101-coffee";
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "emulator-fixtures.json"), "utf8"));
const rules = fs.readFileSync(path.join(__dirname, "..", "database.rules.json"), "utf8");

function seedData() {
  return {
    admins: fixture.admins,
    loyalty_customers: fixture.loyalty_customers,
    loyalty_links: fixture.loyalty_links,
    loyalty_counter: 101,
    loyalty_pending: {},
    subscription_plans: { basic: { nameAr: "Test", price: 1, totalUses: 5, durationDays: 30, enabled: true } },
    subscriptions: { clubA: { uid: "customer-a-uid", planId: "basic", status: "active", totalUses: 5, remainingUses: 5, startedAt: 1, expiresAt: 4102444800000, price: 1, paymentStatus: "paid" } }
  };
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: "127.0.0.1", port: 9000, rules }
  });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => set(ref(ctx.database(), "/"), seedData()));
    const anonymous = env.unauthenticatedContext().database();
    const customerA = env.authenticatedContext("customer-a-uid", { email: "customer.a@example.test", email_verified: true }).database();
    const customerB = env.authenticatedContext("customer-b-uid", { email: "customer.b@example.test", email_verified: true }).database();
    const cashier = env.authenticatedContext("cashier-uid", { email: "cashier@example.test", email_verified: true }).database();
    const manager = env.authenticatedContext("manager-uid", { email: "manager@example.test", email_verified: true }).database();
    const admin = env.authenticatedContext("admin-uid", { email: "admin@example.test", email_verified: true }).database();
    const superAdmin = env.authenticatedContext("super-admin-uid", { email: "super-admin@example.test", email_verified: true }).database();

    const denied = [
      ["ANONYMOUS_READ_CUSTOMER", () => get(ref(anonymous, "loyalty_customers/101-100"))],
      ["CUSTOMER_A_READ_OWN_LEGACY", () => get(ref(customerA, "loyalty_customers/101-100"))],
      ["CROSS_CUSTOMER_READ", () => get(ref(customerA, "loyalty_customers/101-101"))],
      ["LOYALTY_LINK_SELF_WRITE", () => set(ref(customerA, "loyalty_links/customer-a-uid"), "101-101")],
      ["CREDENTIAL_READ", () => get(ref(customerA, "loyalty_credentials/101-100"))],
      ["CREDENTIAL_WRITE", () => set(ref(customerA, "loyalty_credentials/101-100"), { pinHash: "x" })],
      ["CUSTOMER_TOTAL_WRITE", () => set(ref(customerA, "loyalty_customers/101-100/totalEarned"), 99)],
      ["CUSTOMER_REMAINING_USES_WRITE", () => set(ref(customerA, "subscriptions/clubA/remainingUses"), 4)],
      ["ROLE_ESCALATION", () => set(ref(customerA, "admins/customer-a-uid/role"), "admin")],
      ["CASHIER_CREDENTIAL_READ", () => get(ref(cashier, "loyalty_credentials/101-100"))],
      ["CASHIER_CUSTOMER_DELETE", () => set(ref(cashier, "loyalty_customers/101-100"), null)]
    ];
    for (const [name, operation] of denied) await assertFails(operation()).then(() => process.stdout.write(`${name}=DENY\n`));

    await assertSucceeds(get(ref(manager, "loyalty_customers/101-100")));
    await assertSucceeds(get(ref(admin, "loyalty_customers/101-100")));
    await assertSucceeds(get(ref(superAdmin, "loyalty_customers/101-100")));
    process.stdout.write("MANAGER_CUSTOMER_READ=ALLOW\nADMIN_CUSTOMER_READ=ALLOW\nSUPER_ADMIN_CUSTOMER_READ=ALLOW\n");
    process.stdout.write("EMULATOR_RULE_MATRIX=PASS\n");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
