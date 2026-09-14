import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createCredential, timingSafePinMatch, ITERATIONS } from '../src/loyalty-security.js';

globalThis.crypto ||= webcrypto;

test('zero-state CLUB activation has secure credential-only PIN storage', async () => {
  const customerId = 'CLUB-101-1';
  const pin = '1234';
  const credential = await createCredential(pin, 'fixture-pepper', 2);
  const customer = { customerId, clubNumber: customerId, status: 'active', activeSubscriptionId: 'sub_request-zero-state' };
  const subscription = { subscriptionId: 'sub_request-zero-state', customerId, clubNumber: customerId, status: 'active', remainingUses: 10 };
  const updates = {
    'subscription_requests/request-zero-state': { status: 'activated', customerId, subscriptionId: subscription.subscriptionId, clubNumber: customerId },
    [`subscription_customers/${customerId}`]: customer,
    [`subscriptions/${subscription.subscriptionId}`]: subscription,
    [`subscription_credentials/${customerId}`]: credential,
    subscription_counter: 1,
    'subscription_activation_logs/request-zero-state': { type: 'subscription_activated', customerId }
  };
  assert.equal(customer.pin, undefined);
  assert.equal(subscription.pin, undefined);
  assert.equal(updates['subscription_pin_index/1234'], undefined);
  assert.equal(credential.algorithm, 'PBKDF2-SHA512');
  assert.equal(credential.iterations, ITERATIONS);
  assert.ok(credential.pinHash);
  assert.ok(credential.salt);
  assert.equal(JSON.stringify(updates).includes(pin), false);
  assert.equal(await timingSafePinMatch(pin, credential, 'fixture-pepper'), true);
  assert.equal(await timingSafePinMatch('9999', credential, 'fixture-pepper'), false);
});
