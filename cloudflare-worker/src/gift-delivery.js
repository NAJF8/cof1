function giftMatches(value, lookup = {}) {
  const fields = ['giftCode', 'orderCode', 'recipientPhone'];
  return fields.some(field => {
    const expected = String(lookup[field] || '').trim().toLowerCase();
    return expected && String(value?.[field] || '').trim().toLowerCase() === expected;
  });
}

function findGift(root, lookup = {}) {
  const gifts = root?.gift_orders || {};
  const requestedId = String(lookup.giftId || '').trim();
  if (requestedId && gifts[requestedId]) return { id: requestedId, value: gifts[requestedId] };
  const match = Object.entries(gifts).find(([, value]) => giftMatches(value, lookup));
  return match ? { id: match[0], value: match[1] } : null;
}

function planGiftRedemption(root, lookup, actor, now = Date.now()) {
  const found = findGift(root, lookup);
  if (!found) throw Error('GIFT_NOT_FOUND');
  const gift = found.value || {};
  if (gift.redeemedAt || gift.giftStatus === 'redeemed') throw Error('GIFT_ALREADY_REDEEMED');
  if (gift.giftStatus === 'expired' || (gift.expiresAt && Number(gift.expiresAt) <= now)) throw Error('GIFT_EXPIRED');
  if (gift.giftStatus !== 'active') throw Error('GIFT_NOT_AVAILABLE');
  const updated = { ...gift, giftStatus: 'redeemed', redeemedAt: { '.sv': 'timestamp' }, redeemedBy: String(actor.uid), redeemedByName: String(actor.name || actor.email || 'موظف 101').slice(0, 120), redeemedByRole: String(actor.role).slice(0, 40) };
  return { updates: { [`gift_orders/${found.id}`]: updated, [`gift_logs/${found.id}_${String(actor.uid)}_${now}`]: { type: 'gift_redeemed', giftId: found.id, uid: String(actor.uid), role: String(actor.role), timestamp: { '.sv': 'timestamp' } } }, result: { ok: true, giftId: found.id, giftStatus: 'redeemed' } };
}

function giftDecisionOutcome(found, value) {
  const status = String(value?.giftStatus || ''), payment = String(value?.paymentStatus || '');
  if (payment === 'paid' && status === 'active') return { ok: true, idempotent: true, approvalStatus: 'approved', giftId: found.id };
  if (payment === 'rejected' || status === 'cancelled') throw Error('GIFT_ALREADY_DECIDED');
  if (status !== 'awaiting_payment' || payment !== 'pending') throw Error('GIFT_NOT_PENDING');
}

function planGiftDecision(root, giftId, decision, actor, now = Date.now()) {
  const id = String(giftId || '').trim(), value = root?.gift_orders?.[id];
  if (!value) throw Error('GIFT_NOT_FOUND');
  const found = { id, value }, existing = giftDecisionOutcome(found, value);
  if (existing) return { updates: {}, result: existing };
  const approved = decision === 'approve';
  const audit = approved ? { approvedBy: String(actor.uid), approvedByName: String(actor.name || actor.email || 'موظف 101').slice(0, 120), approvedByRole: String(actor.role).slice(0, 40), approvedAt: { '.sv': 'timestamp' } } : { rejectedBy: String(actor.uid), rejectedByName: String(actor.name || actor.email || 'موظف 101').slice(0, 120), rejectedByRole: String(actor.role).slice(0, 40), rejectedAt: { '.sv': 'timestamp' } };
  const updated = { ...value, ...audit, paymentStatus: approved ? 'paid' : 'rejected', giftStatus: approved ? 'active' : 'cancelled' };
  if (approved) updated.giftCode = String(value.giftCode || `101-GIFT-${id.slice(-4).toUpperCase()}`);
  const logId = `${id}_${String(actor.uid)}_${now}`;
  return { updates: { [`gift_orders/${id}`]: updated, [`gift_logs/${logId}`]: { type: approved ? 'gift_approved' : 'gift_rejected', giftId: id, uid: String(actor.uid), role: String(actor.role), timestamp: { '.sv': 'timestamp' } } }, result: { ok: true, giftId: id, approvalStatus: approved ? 'approved' : 'rejected', giftStatus: updated.giftStatus } };
}

export { findGift, planGiftRedemption, planGiftDecision };
