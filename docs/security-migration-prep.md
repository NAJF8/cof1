# Security migration preparation (not deployed)

## Scope boundary

This preparation changes only the local checkout. It does not deploy Functions or
RTDB rules, push Git, use test or production Firebase accounts, read production
records, write production data, or remove legacy PIN fields.

## Target architecture

`index.html` calls `loginWithMembership` with `membershipNumber` and `pin`.
The callable normalizes the membership number, checks a persistent RTDB throttle
keyed by HMAC(membership number + client IP), reads the customer record only in
trusted code, verifies a KDF credential with a per-record salt and the
`LOYALTY_PIN_PEPPER` Functions secret, and returns a custom-auth token plus a
sanitized profile. It does not return PIN material, customer email, or the raw
customer record. `getMyLoyaltyProfile` resolves only the authenticated user's
server-side link and returns the same sanitized profile.

Credential records live at `loyalty_credentials/{membershipNumber}` and contain
only `pinHash`, `salt`, `version`, failed-attempt state, and timestamps. The
pepper must be created as a Firebase Functions secret during an explicitly
authorized deployment; it must never be supplied by the browser, source control,
Firebase RTDB, or command-line arguments.

During transition, an absent credential permits a trusted Function-only legacy
PIN comparison. A successful comparison writes the KDF credential; the legacy
PIN is neither returned, logged, nor deleted in this phase.

## Rules preparation

The proposed RTDB rules deny client reads and writes to credentials, throttles,
and `subscription_pin_index`. They deny customer writes to `loyalty_links` and
customer reads of the legacy `loyalty_customers` record, because RTDB cannot
safely hide a `pin` child when a parent record is readable. Customer profile
access must therefore use the callable until plaintext PIN fields are removed
or the profile is split to a PIN-free path.

These rules have not been deployed. Existing Google provisioning and legacy
Admin code still contain browser-side customer/link writes and must be migrated
to equivalent privileged Functions before the proposed rules can safely go live.

## Migration procedure

`scripts/migrate-loyalty-pins.mjs` defaults to dry-run. With `--input`, it reads
only a local fixture. Without `--input`, it requires Firebase Admin credentials
and `FIREBASE_DATABASE_URL`; that mode is read-only unless both `--apply` and
`--confirm-apply` are provided. Apply also requires `LOYALTY_PIN_PEPPER` from a
secret environment. Each candidate write creates a credential, reads it back,
and preserves the legacy plaintext PIN.

Production execution order, requiring separate approval:

1. Back up the affected RTDB paths and validate restore access.
2. Deploy Functions with the pepper secret and test only dedicated test accounts.
3. Run dry-run counts against production with a least-privilege service account.
4. Apply credentials in controlled batches, recording only migration status.
5. Verify 100% active eligible records, correct and incorrect login behavior,
   locks, cross-customer denial, and Google regression.
6. Move all profile reads and provisioning/link writes server-side.
7. Deploy restrictive rules only after emulator and test-account verification.
8. In a separately approved final-removal change, back up and remove legacy PIN
   fields only after all active records are migrated and rollback is proven.

## Test matrix

Local unit tests cover membership normalization, KDF verification, timing-safe
comparison usage, IP-specific throttle key derivation, and profile sanitization.
Static rule tests verify denial of credential/throttle/PIN-index client access,
customer link writes, and legacy customer reads. Emulator tests with Customer A,
Customer B, Cashier, Admin, and Super Admin fixtures remain required before any
deploy because no emulator or authenticated test environment was exercised.
