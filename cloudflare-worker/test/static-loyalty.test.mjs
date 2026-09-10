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
assert.match(index, /mobileAuthTrace\('AUTH_START'/);
assert.match(index, /mobileAuthTrace\('REDIRECT_RETURN'/);
assert.match(index, /mobileAuthTrace\('REDIRECT_RESULT'/);
assert.match(index, /mobileAuthTrace\('AUTH_STATE'/);
assert.match(index, /mobileAuthTrace\('ID_TOKEN'/);
assert.match(index, /mobileAuthTrace\('PROVISION_HTTP'/);
assert.match(index, /mobileAuthTrace\('PROVISION_RESULT'/);
assert.match(index, /mobileAuthTrace\('MEMBERSHIP_LINK'/);
assert.match(index, /mobileAuthTrace\('UI_RENDER'/);
assert.match(index, /MOBILE_AUTH_ERROR/);
assert.match(index, /PROFILE_LINK_CONFLICT/);
assert.match(index, /functions\/PROFILE_LINK_CONFLICT/);
assert.match(loyalty, /\/api\/admin\/provision-super-admin/);
assert.match(admin, /\/api\/admin\/provision-super-admin/);
assert.equal(JSON.parse(rules).rules.loyalty_links.$uid['.read'], false);
assert.equal(JSON.parse(rules).rules.loyalty_links.$uid['.write'], false);
assert.doesNotMatch(index, /httpsCallable\(['"](?:loginWithMembership|getMyLoyaltyProfile|provisionGoogleLoyalty|provisionGoogleSuperAdmin)['"]\)/);
const worker = await readFile(join(root, 'cloudflare-worker', 'src', 'loyalty-routes.js'), 'utf8');
assert.match(worker, /PROFILE_LINK_CONFLICT/);
assert.match(worker, /ownsLinkedProfile/);
assert.match(worker, /LEGACY_PIN_BACKFILL_MEMBERSHIP/);
assert.match(worker, /PIN_BACKFILL_MISSING/);
assert.match(worker, /firebaseAdminConditionalPut/);
const giftRedeem = worker.match(/async function redeemGift[\s\S]*?async function listGiftOrders/)[0];
assert.match(giftRedeem, /firebaseAdminReadWithEtag\(env, `gift_orders\/\$\{id\}`\)/);
assert.match(giftRedeem, /firebaseAdminConditionalPut\(env, `gift_orders\/\$\{id\}`/);
assert.doesNotMatch(giftRedeem, /atomicPlan/);
assert.match(giftRedeem, /GIFT_REDEEM_WRITE_START/);
assert.match(giftRedeem, /CONCURRENT_MODIFICATION/);
assert.match(loyalty, /giftId:gift\.id,giftCode:gift\.giftCode,orderCode:gift\.orderCode,recipientPhone:gift\.recipientPhone/);
assert.match(loyalty, /CONCURRENT_MODIFICATION:'تم تحديث الهدية، أعد البحث\.'/);
console.log('worker loyalty static checks: PASS');
