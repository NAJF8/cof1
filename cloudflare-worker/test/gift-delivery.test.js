import test from 'node:test';
import assert from 'node:assert/strict';
import { planGiftDecision, planGiftRedemption } from '../src/gift-delivery.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fixture(overrides = {}) { return { gift_orders: { gift1: { giftId: 'gift1', giftCode: 'GIFT-TKLX-101', orderCode: 'GIFT-101-LYTKLX', giftStatus: 'active', paymentStatus: 'paid', expiresAt: Date.now() + 60000, ...overrides } } }; }
const actor = { uid: 'staff-1', name: 'Fixture Staff', role: 'manager' };
const lookup = { giftCode: 'GIFT-TKLX-101', orderCode: 'GIFT-101-LYTKLX' };

test('REDEEM: active gift gets server actor fields', () => {
  const plan = planGiftRedemption(fixture(), lookup, actor, Date.now());
  assert.equal(plan.result.giftStatus, 'redeemed'); assert.equal(plan.updates['gift_orders/gift1'].redeemedBy, actor.uid);
});
test('REDEEM: already used, expired, and unavailable gifts deny', () => {
  assert.throws(() => planGiftRedemption(fixture({ redeemedAt: 123 }), lookup, actor), { message: 'GIFT_ALREADY_REDEEMED' });
  assert.throws(() => planGiftRedemption(fixture({ expiresAt: Date.now() - 1 }), lookup, actor), { message: 'GIFT_EXPIRED' });
  assert.throws(() => planGiftRedemption(fixture({ giftStatus: 'cancelled', paymentStatus: 'rejected' }), lookup, actor), { message: 'GIFT_NOT_AVAILABLE' });
});
test('APPROVE: pending gift gets server audit and becomes active', () => {
  const root = fixture({ paymentStatus: 'pending', giftStatus: 'awaiting_payment' });
  const plan = planGiftDecision(root, 'gift1', 'approve', actor, 123), saved = plan.updates['gift_orders/gift1'];
  assert.equal(plan.result.approvalStatus, 'approved'); assert.equal(saved.paymentStatus, 'paid'); assert.equal(saved.giftStatus, 'active');
  assert.equal(saved.approvedBy, actor.uid); assert.equal(saved.approvedByRole, actor.role);
});
test('REJECT: pending gift gets server audit and blocks a second decision', () => {
  const root = fixture({ paymentStatus: 'pending', giftStatus: 'awaiting_payment' });
  const plan = planGiftDecision(root, 'gift1', 'reject', actor, 123), saved = plan.updates['gift_orders/gift1'];
  assert.equal(plan.result.approvalStatus, 'rejected'); assert.equal(saved.paymentStatus, 'rejected'); assert.equal(saved.giftStatus, 'cancelled');
  assert.equal(saved.rejectedBy, actor.uid); assert.throws(() => planGiftDecision({ gift_orders: { gift1: saved } }, 'gift1', 'approve', actor), { message: 'GIFT_ALREADY_DECIDED' });
});
test('APPROVE: already approved request is idempotent', () => {
  const plan = planGiftDecision(fixture(), 'gift1', 'approve', actor); assert.equal(plan.result.idempotent, true); assert.deepEqual(plan.updates, {});
});

console.log(`gift request fixtures: PASS ${clone({ ok: true }).ok}`);
