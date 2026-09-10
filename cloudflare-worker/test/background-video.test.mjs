import assert from 'node:assert/strict';
import { backgroundVideoType, videoExtension, handleLoyaltyRoutes } from '../src/loyalty-routes.js';

const mp4 = new Uint8Array([...Buffer.from([0, 0, 0, 0]), ...Buffer.from('ftyp'), ...Buffer.from('isom'), 0, 0, 0, 0]);
const webm = new Uint8Array([...Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), ...Buffer.from('webm')]);
assert.equal(backgroundVideoType(mp4), 'video/mp4');
assert.equal(backgroundVideoType(webm), 'video/webm');
assert.equal(backgroundVideoType(new TextEncoder().encode('<script>alert(1)</script>')), '');
assert.equal(videoExtension('anything.MP4'), 'mp4');
assert.equal(videoExtension('../unsafe.js'), 'js');
const unauthenticated = await handleLoyaltyRoutes(new Request('https://coffee-101-ai-chat.coffee101.workers.dev/api/admin/background/upload-video', { method: 'POST', headers: { Origin: 'https://101coffees.com' } }), { ALLOWED_ORIGINS: 'https://101coffees.com' }, new URL('https://coffee-101-ai-chat.coffee101.workers.dev/api/admin/background/upload-video'));
assert.equal(unauthenticated.status, 401);
assert.equal((await unauthenticated.json()).error, 'AUTH_REQUIRED');
console.log('background video signatures/extensions: PASS');
