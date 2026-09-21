import assert from 'node:assert/strict';
import { planStaffRedemption, redemptionDescription } from '../src/loyalty-routes.js';

function applyUpdates(root, updates) {
  for (const [path, value] of Object.entries(updates)) {
    const parts = path.split('/'); let target = root;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    target[parts.at(-1)] = structuredClone(value);
  }
}

const base = () => ({
  loyalty_customers: { '101-77': { name: 'Fixture', hearts: 5, currentHearts: 5, totalRedemptions: 2 } },
  loyalty_redemption_logs: { old: { membership: '101-77', requestId: 'old-request', createdAt: 10 } },
  loyalty_logs: { legacy: { type: 'REWARD_REDEEMED', membership: '101-77', requestId: 'old-request', createdAt: 11 } },
  loyalty_operation_requests: {}
});

const first = planStaffRedemption(base(), '101-77', 'request-1', { uid: 'staff-1', name: 'Cashier', role: 'cashier' });
assert.equal(first.result.profile.currentHearts, 0);
assert.equal(first.result.redemption.totalRedemptions, 3);
assert.equal(first.updates['loyalty_customers/101-77/hearts'], 0);
assert.equal(first.updates['loyalty_logs/redeem_request-1'].requestId, 'request-1');

const described = planStaffRedemption(base(), '101-77', 'request-described', { uid: 'staff-1', name: 'Cashier', role: 'cashier' }, 'قهوة مجانية');
assert.equal(described.updates['loyalty_redemption_logs/redeem_request-described'].rewardDescription, 'قهوة مجانية');
const withoutDescription = planStaffRedemption(base(), '101-77', 'request-empty', { uid: 'staff-1', name: 'Cashier', role: 'cashier' });
assert.equal(Object.hasOwn(withoutDescription.updates['loyalty_redemption_logs/redeem_request-empty'], 'rewardDescription'), false);
assert.equal(redemptionDescription('  قهوة\nمجانية  '), 'قهوة مجانية');
assert.equal(redemptionDescription('   '), undefined);
assert.throws(() => redemptionDescription('<script>alert(1)</script>'.repeat(20)), /INVALID_ARGUMENT/);

const saved = base();
applyUpdates(saved, first.updates);
const replay = planStaffRedemption(saved, '101-77', 'request-1', { uid: 'staff-1', role: 'cashier' });
assert.equal(replay.replay, true);
assert.deepEqual(replay.result, first.result);
assert.throws(() => planStaffRedemption(saved, '101-77', 'request-2'), /INSUFFICIENT_HEARTS/);

const legacyOnly = {
  loyalty_customers: { '101-1': { name: 'Legacy', hearts: 5, totalRedemptions: 0 } },
  loyalty_logs: {
    first: { type: 'REWARD_REDEEMED', membership: '101-1', requestId: 'legacy-1' },
    second: { type: 'REDEEM_REWARD', cardId: '101-1', requestId: 'legacy-2' }
  },
  loyalty_operation_requests: {}
};
const legacyResult = planStaffRedemption(legacyOnly, '101-1', 'legacy-3');
assert.equal(legacyResult.result.redemption.totalRedemptions, 3);
assert.equal(legacyResult.result.profile.currentHearts, 0);
console.log('STAFF_REDEMPTION_TESTS=PASS');
