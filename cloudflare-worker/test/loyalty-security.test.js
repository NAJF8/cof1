import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import * as security from '../src/loyalty-security.js';

globalThis.crypto ??= webcrypto;
const pepper = 'local-fixture-pepper';
const credential = await security.createCredential('1234', pepper, 123);
const stages = [];
await security.createCredential('1234', pepper, 123, stage => stages.push(stage));
assert.deepEqual(stages, [
  'CRED_RANDOM_START', 'CRED_RANDOM_OK',
  'CRED_SALT_ENCODE_START', 'CRED_SALT_ENCODE_OK',
  'CRED_IMPORT_KEY_START', 'CRED_IMPORT_KEY_OK',
  'CRED_SALT_DECODE_START', 'CRED_SALT_DECODE_OK',
  'CRED_DERIVE_START', 'CRED_DERIVE_OK',
  'CRED_HASH_ENCODE_START', 'CRED_HASH_ENCODE_OK',
  'CRED_OBJECT_BUILD_START', 'CRED_OBJECT_BUILD_OK'
]);
const originalDeriveBits = crypto.subtle.deriveBits;
const failedStages = [];
crypto.subtle.deriveBits = async () => { throw Error('DERIVE_BITS_FIXTURE_FAILURE'); };
try {
  await assert.rejects(() => security.createCredential('1234', pepper, 123, stage => failedStages.push(stage)), /DERIVE_BITS_FIXTURE_FAILURE/);
  assert.equal(failedStages.at(-1), 'CRED_DERIVE_START');
} finally {
  crypto.subtle.deriveBits = originalDeriveBits;
}
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
