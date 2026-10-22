import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const start=source.indexOf('function parseGeminiReply(text){');
const end=source.indexOf('async function auditGeminiKeyAction(',start);
assert.ok(start>=0 && end>start, 'AI parser source found');
const code=source.slice(start,end);
const sandbox={
  cleanText:(v,n)=>String(v??'').slice(0,n),
  isPlainObject:v=>v!==null&&typeof v==='object'&&!Array.isArray(v),
  CART_ACTION_TYPES:new Set(['cart_add','cart_remove','cart_decrease','cart_increase','cart_clear','cart_get','cart_total'])
};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const parse=sandbox.parseGeminiReply;

test('valid JSON preserves assistant reply',()=>{const r=parse('{"reply":"أهلاً بيك","actions":[]}');assert.equal(r.reply,'أهلاً بيك');assert.equal(r.actions.length,0)});
test('valid cart actions remain available',()=>{const r=parse('{"reply":"","actions":[{"type":"cart_add","productId":"p1","quantity":2}]}');assert.equal(r.actions[0].type,'cart_add');assert.equal(r.actions[0].productId,'p1')});
test('reject raw model directives',()=>assert.equal(parse('Output MUST be JSON: {"reply":"test","actions":[]} Refine Response'),null));
test('reject malformed JSON',()=>assert.equal(parse('Hello from model'),null));
test('reject instruction leakage inside JSON reply',()=>assert.equal(parse('{"reply":"Refine Response","actions":[]}'),null));
test('reject arrays, missing actions, and empty outputs',()=>{assert.equal(parse('[]'),null);assert.equal(parse('{"reply":"hi"}'),null);assert.equal(parse('{"reply":"","actions":[]}'),null)});
test('allow fenced JSON',()=>assert.equal(parse('```json\n{"reply":"تمام","actions":[]}\n```').reply,'تمام'));
test('ensure Worker rejects invalid output for both providers',()=>{assert.match(source,/code:"AI_INVALID_RESPONSE"/);assert.match(source,/code:"KIE_INVALID_RESPONSE"/)});
