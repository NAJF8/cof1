# Security migration Phase 2 — local verification

This checkout contains the Phase 2 server-side provisioning and protected-path
changes. No deployment, push, production credentials, or production data are
used by this preparation.

## Emulator fixtures

`test/emulator-fixtures.json` contains only `.test` identities for CUSTOMER_A,
CUSTOMER_B, CASHIER, MANAGER, ADMIN, and SUPER_ADMIN. It is a data manifest for
local emulator setup and is not a production import.

## Current verification

- JavaScript syntax checks: PASS.
- Local loyalty security unit tests: PASS.
- Static protected-path tests: PASS.
- Firebase Emulator start: NOT VERIFIED. The installed Firebase CLI refused to
  start because the machine has Java 18 and the CLI requires Java 21.
- Deploy/apply/push: NO.

After Java 21 is available, start only the local emulators with:

```text
firebase emulators:start --only database,functions --project demo-101-coffee
```

Then run the authenticated Rule Matrix, membership lockout, IDOR, dual-read,
and Google regression cases against the fixture set before any deployment.
