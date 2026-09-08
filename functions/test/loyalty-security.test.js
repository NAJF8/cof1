"use strict";

const assert = require("assert");
const security = require("../loyalty-security");

const pepper = "test-only-pepper";
const credential = security.createCredential("1234", pepper, 123);
assert.equal(security.normalizeMembershipNumber(" 101-42 "), "101-42");
assert.equal(security.normalizeMembershipNumber("42"), null);
assert.equal(security.timingSafePinMatch("1234", credential, pepper), true);
assert.equal(security.timingSafePinMatch("9999", credential, pepper), false);
assert.notEqual(security.attemptKey("101-42", "127.0.0.1", pepper), security.attemptKey("101-42", "127.0.0.2", pepper));
const profile = security.publicProfile("101-42", { name: "Test A", pin: "1234", email: "private@example.test", currentHearts: 2 });
assert.deepEqual(profile, { membershipNumber: "101-42", name: "Test A", currentHearts: 2, memberType: "عضو مميز", clubNumber: null, subscription: null });
assert.equal(Object.hasOwn(profile, "pin"), false);
console.log("loyalty-security unit tests: PASS");
