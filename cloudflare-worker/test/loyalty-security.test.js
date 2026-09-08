import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import * as security from '../src/loyalty-security.js';

globalThis.crypto ??= webcrypto;
const pepper = 'local-fixture-pepper';
const credential = await security.createCredential('1234', pepper, 123);
assert.equal(security.normalizeMembershipNumber(' 101-42 '), '101-42');
assert.equal(security.normalizeMembershipNumber('42'), null);
assert.equal(await security.timingSafePinMatch('1234', credential, pepper), true);
assert.equal(await security.timingSafePinMatch('9999', credential, pepper), false);
assert.notEqual(await security.attemptKey('101-42', '127.0.0.1', pepper), await security.attemptKey('101-42', '127.0.0.2', pepper));
const profile = security.publicProfile('101-42', { name: 'Fixture', pin: '1234', email: 'private@example.test', currentHearts: 2 });
assert.equal(Object.hasOwn(profile, 'pin'), false);
assert.equal(Object.hasOwn(profile, 'email'), false);
assert.equal(security.MAX_FAILURES, 5);
console.log('worker loyalty security fixtures: PASS');
