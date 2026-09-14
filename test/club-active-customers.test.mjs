import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
const start = source.indexOf('async function renderClubCustomers(){');
const end = source.indexOf('\nfunction renderClubAccountClaims', start);
assert.ok(start >= 0 && end > start, 'renderClubCustomers must remain present');

const rendered = { html: '', count: 0 };
const table = {
  get innerHTML() { return rendered.html; },
  set innerHTML(value) { rendered.html = value; rendered.count = (value.match(/data-club-active-row=/g) || []).length; },
  querySelectorAll(selector) { return { length: selector === 'tr[data-club-active-row]' ? rendered.count : 0 }; },
  querySelector(selector) { return rendered.html.includes(selector.replace(/^[^=]+="|"\]$/g, '')) ? {} : null; }
};
const globals = {
  document: { getElementById: id => id === 'clubCustomersTable' ? table : null },
  clubCustomers: [], clubSubscriptions: [], subscriptionPlans: {}, subscriptionRequests: [],
  clubRequestIndex: new Map(), currentRole: 'admin', CSS: { escape: value => String(value) },
  esc: value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])),
  console: { info() {} }, Date
};
const makeRenderer = Function(...Object.keys(globals), `${source.slice(start, end)}; return renderClubCustomers;`)(...Object.values(globals));
const future = new Date(Date.now() + 86400000).toISOString();
globals.clubCustomers.push(
  { id: 'customer-a', status: 'active', activeSubscriptionId: 'sub-a', name: 'A' },
  { id: 'customer-b', status: 'active', activeSubscriptionId: 'sub-b', name: 'B' },
  { id: 'customer-c', status: 'inactive', activeSubscriptionId: 'sub-c', name: 'C' },
  { id: 'customer-d', status: 'active', activeSubscriptionId: 'sub-d', name: 'D' },
  { id: 'customer-e', status: 'active', activeSubscriptionId: 'sub-e', name: 'E' },
  { id: 'customer-f', status: 'active', name: 'F' },
  { id: 'customer-g', status: 'active', activeSubscriptionId: 'sub-g', name: 'G' },
  { id: 'customer-h', status: 'active', name: 'H' }
);
globals.clubSubscriptions.push(
  { id: 'sub-a', customerId: 'customer-a', status: 'active', remainingUses: 26, totalUses: 26, expiresAt: future, planId: 'large' },
  { id: 'sub-b', customerId: 'customer-b', remainingUses: 10, expiresAt: future, planId: 'ten' },
  { id: 'sub-c', customerId: 'customer-c', status: 'active', remainingUses: 1, expiresAt: future },
  { id: 'sub-d', customerId: 'customer-d', status: 'active', remainingUses: 1, expiresAt: Date.now() - 1000 },
  { id: 'sub-e', customerId: 'customer-e', status: 'active', remainingUses: 0, expiresAt: future, totalUses: 26 },
  { id: 'sub-f', customerId: 'customer-f', status: 'active', remainingUses: 7, expiresAt: future, planId: 'fifteen' },
  { id: 'sub-g', customerId: 'customer-g', status: 'active', remainingUses: 3, expiresAt: future },
  { id: 'sub-h', customerId: 'customer-h', status: 'active', remainingUses: 2, expiresAt: future },
  { id: 'sub-h-duplicate', customerId: 'customer-h', status: 'active', remainingUses: 1, expiresAt: future }
);
Object.assign(globals.subscriptionPlans, { large: { totalUses: 26 }, ten: { totalUses: 10 }, fifteen: { totalUses: 15 } });
await makeRenderer();
assert.equal(rendered.count, 5, 'A, B, E, F, and G should render');
assert.match(rendered.html, /0 \/ 26/, 'zero remaining uses must remain visible');
assert.match(rendered.html, /7 \/ 15/, 'plan totalUses must be used when subscription totalUses is absent');
assert.doesNotMatch(rendered.html, /customer-c|customer-d|customer-h/, 'inactive, expired, and ambiguous records must not render');
assert.match(source, /dataset:'subscription_customers',rerender:true/);
assert.match(source, /dataset:'subscriptions',rerender:true/);
assert.match(source, /dataset:'subscription_plans',rerender:true/);
assert.doesNotMatch(source, /CLUB-101-15/);
console.log('club active customers fixture tests: PASS');
