import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseAdminAtomicPatch } from '../src/firebase-admin.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function pathParts(path) { return path.split('/').filter(Boolean); }
function applyUpdates(root, updates) {
  for (const [path, value] of Object.entries(updates)) {
    const parts = pathParts(path); let target = root;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = clone(value);
  }
}
function memoryTransport(initial) {
  let root = clone(initial), revision = 0;
  return {
    read: async () => ({ data: clone(root), etag: `"${revision}"` }),
    write: async (_env, updates, etag) => {
      await new Promise(resolve => setImmediate(resolve));
      if (etag !== `"${revision}"`) throw Error('FIREBASE_ETAG_CONFLICT');
      applyUpdates(root, updates); revision += 1;
    },
    value: () => clone(root)
  };
}
async function atomic(transport, plan) {
  return firebaseAdminAtomicPatch({}, plan, { attempts: 50, read: transport.read, write: transport.write });
}

test('HEARTS: 10 concurrent adjustments never lose updates or exceed 5', async () => {
  const t = memoryTransport({ loyalty_customers: { member: { currentHearts: 0, hearts: 0 } } });
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => atomic(t, root => {
    const customer = root.loyalty_customers.member, next = customer.currentHearts + 1;
    if (next > 5) throw Error('HEARTS_OUT_OF_RANGE');
    return { updates: { 'loyalty_customers/member/currentHearts': next, 'loyalty_customers/member/hearts': next }, result: next };
  })));
  const final = t.value().loyalty_customers.member.currentHearts;
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  assert.equal(final, 5);
  assert.ok(final >= 0 && final <= 5);
});

test('REDEEM: two concurrent redemptions with one affordable balance only succeed once', async () => {
  const t = memoryTransport({ loyalty_customers: { member: { currentHearts: 3, hearts: 3, totalHeartsSpent: 0, totalHeartsRedeemed: 0 } } });
  const redeem = () => atomic(t, root => {
    const customer = root.loyalty_customers.member;
    if (customer.currentHearts < 3) throw Error('INSUFFICIENT_HEARTS');
    const next = customer.currentHearts - 3;
    return { updates: { 'loyalty_customers/member/currentHearts': next, 'loyalty_customers/member/hearts': next, 'loyalty_customers/member/totalHeartsSpent': customer.totalHeartsSpent + 3, 'loyalty_customers/member/totalHeartsRedeemed': customer.totalHeartsRedeemed + 3, 'loyalty_redemption_logs/one': { requiredHearts: 3 } }, result: true };
  });
  const results = await Promise.allSettled([redeem(), redeem()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(t.value().loyalty_customers.member.currentHearts, 0);
  assert.equal(Object.keys(t.value().loyalty_redemption_logs).length, 1);
});

test('CLUB: remainingUses=1 allows one of two concurrent consumes', async () => {
  const t = memoryTransport({ subscriptions: { sub: { status: 'active', expiresAt: Date.now() + 60000, remainingUses: 1 } } });
  const consume = () => atomic(t, root => {
    const sub = root.subscriptions.sub;
    if (sub.remainingUses <= 0) throw Error('CLUB_UNAVAILABLE');
    return { updates: { 'subscriptions/sub/remainingUses': sub.remainingUses - 1 }, result: true };
  });
  const results = await Promise.allSettled([consume(), consume()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(t.value().subscriptions.sub.remainingUses, 0);
});

test('PIN: 20 concurrent reservations never duplicate a PIN', async () => {
  const t = memoryTransport({ subscription_pin_index: {} }); let nextPin = 1000;
  const reserve = () => atomic(t, root => {
    let pin;
    do { pin = String(nextPin++); } while (root.subscription_pin_index[pin]);
    return { updates: { [`subscription_pin_index/${pin}`]: `customer-${pin}` }, result: pin };
  });
  const pins = await Promise.all(Array.from({ length: 20 }, reserve));
  assert.equal(new Set(pins).size, 20);
  assert.equal(Object.keys(t.value().subscription_pin_index).length, 20);
});

test('MEMBERSHIP CHANGE: two users cannot claim the same new membership', async () => {
  const t = memoryTransport({ loyalty_customers: { oldA: { uid: 'a' }, oldB: { uid: 'b' } }, loyalty_links: {} });
  const change = (oldId, uid) => atomic(t, root => {
    if (!root.loyalty_customers[oldId] || root.loyalty_customers.newId) throw Error('ALREADY_EXISTS');
    return { updates: { 'loyalty_customers/newId': root.loyalty_customers[oldId], [`loyalty_customers/${oldId}`]: null, [`loyalty_links/${uid}`]: 'newId' }, result: uid };
  });
  const results = await Promise.allSettled([change('oldA', 'a'), change('oldB', 'b')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(t.value().loyalty_customers).filter(key => key === 'newId').length, 1);
});

test('IDEMPOTENCY: the same request key replays without a second mutation', async () => {
  const t = memoryTransport({ loyalty_customers: { member: { currentHearts: 5 } }, loyalty_operation_requests: {} });
  const redeem = () => atomic(t, root => {
    const saved = root.loyalty_operation_requests.redeem?.request1;
    if (saved) return { replay: true, result: saved.result };
    const outcome = { ok: true, remaining: 3 };
    return { updates: { 'loyalty_customers/member/currentHearts': 3, 'loyalty_operation_requests/redeem/request1': { result: outcome } }, result: outcome };
  });
  const [first, second] = await Promise.all([redeem(), redeem()]);
  assert.deepEqual(first, second);
  assert.equal(t.value().loyalty_customers.member.currentHearts, 3);
  assert.deepEqual(t.value().loyalty_operation_requests.redeem.request1.result, { ok: true, remaining: 3 });
});

console.log('worker atomicity concurrency fixtures: PASS');
