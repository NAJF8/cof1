import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
const start = source.indexOf('function showClubActivationDiagnostics(data){');
const end = source.indexOf('\nwindow.confirmClubPayment=', start);
assert.ok(start >= 0 && end > start, 'activation diagnostics renderer must remain present');
const renderer = source.slice(start, end);

assert.match(renderer, /currentRole!=='super_admin'/);
assert.match(renderer, /debugEl\.textContent=/);
assert.doesNotMatch(renderer, /innerHTML/);
for (const field of ['status', 'error', 'stage', 'code', 'firebaseOp', 'firebaseStatus']) {
  assert.match(renderer, new RegExp(`data\\?\\.${field}`));
}
for (const forbidden of ['token', 'pin', 'hash', 'salt', 'pepper', 'uid', 'phone', 'body', 'stack']) {
  assert.doesNotMatch(renderer, new RegExp(forbidden, 'i'));
}
const makeRenderer = role => {
  const debugEl = { hidden: true, textContent: '' };
  const render = Function('document', 'currentRole', `${renderer}; return showClubActivationDiagnostics;`)(
    { getElementById: id => id === 'clubActivationDebug' ? debugEl : null },
    role
  );
  return { debugEl, render };
};
const diagnostics = { status: 500, error: 'INTERNAL_SERVER_ERROR', stage: 'ATOMIC_PUT_START', code: 'ATOMIC_PUT_FAILED', firebaseOp: 'PUT', firebaseStatus: 500 };
const superAdmin = makeRenderer('super_admin');
superAdmin.render(diagnostics);
assert.equal(superAdmin.debugEl.hidden, false);
assert.equal(superAdmin.debugEl.textContent, 'CLUB Activation Debug\nHTTP: 500\nERROR: INTERNAL_SERVER_ERROR\nSTAGE: ATOMIC_PUT_START\nSAFE CODE: ATOMIC_PUT_FAILED\nFIREBASE OP: PUT\nFIREBASE STATUS: 500');
const manager = makeRenderer('manager');
manager.render(diagnostics);
assert.equal(manager.debugEl.hidden, true);
assert.equal(manager.debugEl.textContent, '');
assert.match(source, /error:\s*data\.error \|\| null/);
assert.match(source, /status:\s*response\.status/);
assert.match(source, /showClubActivationDiagnostics\(error\?\.safeDiagnostics\)/);
console.log('club activation diagnostics UI static test: PASS');
