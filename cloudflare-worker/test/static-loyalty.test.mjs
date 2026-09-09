import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [index, loyalty, admin, rules] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'loyalty.html'), 'utf8'),
  readFile(join(root, 'admin.html'), 'utf8'),
  readFile(join(root, 'database.rules.json'), 'utf8')
]);
assert.match(index, /\/api\/loyalty\/login/);
assert.match(index, /\/api\/loyalty\/profile/);
assert.match(index, /\/api\/loyalty\/provision-google/);
assert.match(index, /PROFILE_LINK_CONFLICT/);
assert.match(index, /functions\/PROFILE_LINK_CONFLICT/);
assert.match(loyalty, /\/api\/admin\/provision-super-admin/);
assert.match(admin, /\/api\/admin\/provision-super-admin/);
assert.equal(JSON.parse(rules).rules.loyalty_links.$uid['.read'], false);
assert.equal(JSON.parse(rules).rules.loyalty_links.$uid['.write'], false);
assert.doesNotMatch(index, /httpsCallable\(['"](?:loginWithMembership|getMyLoyaltyProfile|provisionGoogleLoyalty|provisionGoogleSuperAdmin)['"]\)/);
const worker = await readFile(join(root, 'cloudflare-worker', 'src', 'loyalty-routes.js'), 'utf8');
assert.match(worker, /PROFILE_LINK_CONFLICT/);
assert.match(worker, /const result = await atomicPlan\(env, root =>/);
assert.match(worker, /ownsLinkedProfile/);
console.log('worker loyalty static checks: PASS');
