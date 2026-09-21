import assert from 'node:assert/strict';
import { planStaffRedemption } from '../src/loyalty-routes.js';

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
  loyalty_operation_requests: {}
});

const first = planStaffRedemption(base(), '101-77', 'request-1', { uid: 'staff-1', name: 'Cashier', role: 'cashier' });
assert.equal(first.result.profile.currentHearts, 0);
assert.equal(first.result.redemption.totalRedemptions, 3);
assert.equal(first.updates['loyalty_customers/101-77/hearts'], 0);
assert.equal(first.updates['loyalty_logs/redeem_request-1'].requestId, 'request-1');

const saved = base();
applyUpdates(saved, first.updates);
const replay = planStaffRedemption(saved, '101-77', 'request-1', { uid: 'staff-1', role: 'cashier' });
assert.equal(replay.replay, true);
assert.deepEqual(replay.result, first.result);
assert.throws(() => planStaffRedemption(saved, '101-77', 'request-2'), /INSUFFICIENT_HEARTS/);
console.log('STAFF_REDEMPTION_TESTS=PASS');
