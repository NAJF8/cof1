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
