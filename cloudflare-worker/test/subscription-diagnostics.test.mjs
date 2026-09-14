import assert from 'node:assert/strict';
import test from 'node:test';
import { subscriptionActivationFailure } from '../src/loyalty-routes.js';

test('subscription activation diagnostics are safe and classified', async () => {
  const request = new Request('https://worker.test/api/admin/subscription/activate', { headers: { Origin: 'https://najf8.github.io' } });
  const error = Object.assign(new Error('PIN=1234 pinHash=hash salt=salt token=secret uid=full-user-id'), { firebaseOp: 'PUT', firebaseStatus: 500 });
  const response = subscriptionActivationFailure(request, { ALLOWED_ORIGINS: 'https://najf8.github.io' }, 'CRED_DERIVE_START', error);
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'INTERNAL_SERVER_ERROR');
  assert.equal(body.stage, 'CRED_DERIVE_START');
  assert.equal(body.code, 'PIN_HASH_FAILED');
  assert.equal(body.firebaseOp, 'PUT');
  assert.equal(body.firebaseStatus, 500);
  for (const secret of ['1234', 'hash', 'salt', 'secret', 'full-user-id', 'stack']) assert.equal(serialized.includes(secret), false);
});

test('deriveBits OperationError is propagated as a safe diagnostic name', async () => {
  const request = new Request('https://worker.test/api/admin/subscription/activate', { headers: { Origin: 'https://najf8.github.io' } });
  const error = Object.assign(new Error('secret text'), { name: 'OperationError', cryptoErrorName: 'OperationError' });
  const body = await (await subscriptionActivationFailure(request, { ALLOWED_ORIGINS: 'https://najf8.github.io' }, 'CRED_DERIVE_START', error)).json();
  assert.equal(body.stage, 'CRED_DERIVE_START');
  assert.equal(body.code, 'PIN_HASH_FAILED');
  assert.equal(body.cryptoErrorName, 'OperationError');
});

test('arbitrary deriveBits error never exposes raw error details', async () => {
  const request = new Request('https://worker.test/api/admin/subscription/activate', { headers: { Origin: 'https://najf8.github.io' } });
  const error = Error('secret text');
  const body = await (await subscriptionActivationFailure(request, { ALLOWED_ORIGINS: 'https://najf8.github.io' }, 'CRED_DERIVE_START', error)).json();
  const serialized = JSON.stringify(body);
  assert.equal(body.cryptoErrorName, 'UnknownError');
  for (const field of ['message', 'stack', 'PIN', 'pepper', 'salt', 'pinHash', 'token']) assert.equal(Object.hasOwn(body, field), false);
  for (const secret of ['1234', 'secret text', 'stack', 'pepper', 'salt', 'pinHash', 'token']) assert.equal(serialized.includes(secret), false);
});
