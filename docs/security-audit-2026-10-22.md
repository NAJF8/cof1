# 101 COFFEE — Security review (2026-10-22)

Scope: static source review of `NAJF8/cof1` (main and this branch). Not a penetration test; no access to production Firebase settings, deployment status, traffic, secret stores, or customer records. Findings require Staging verification before any Production changes.

## High-priority findings
1. **Unauthorized/stale staff privileges:** Several `database.rules.json` write grants checked role without checking `admins/{uid}/status === 'active'`. This branch adds active-state checks to products, categories, settings, background, ai_config, ai_public, roomSettings. Audit remaining rules and verify with Firebase Emulator Suite against disabled roles.
2. **Anonymous creation of orders and reservations:** `orders/$orderId`, `bookings/$bookingId`, and `eventBookings/$bookingId` allow unauthenticated creation by design. Abuse/spam and forged client-supplied data are risks. Move sensitive creation to server-side validated, rate-limited endpoints with App Check/bot mitigation, immutable price calculation, server timestamps and bounded field validation. Do not disable production orders before replacement is tested.
3. **Public deployment root:** `firebase.json` serves root `.`, previously with insufficient ignore exclusions for internal files. This branch excludes internal scripts, tests, worker source, admin roster JSON, documentation and backup metadata from Firebase Hosting. Note GitHub Pages can serve tracked repo files separately: inspect GH Pages publication settings and remove internal artifacts from its publish surface.
4. **Storage rules:** `storage.rules` allows authorized claim holders to write arbitrary paths without content type/size/path constraints. Introduce directory-specific allowlists with file size and MIME checks after inventory of legitimate uploads.
5. **Rate limiting:** `cloudflare-worker/src/index.js` uses in-memory Map buckets; isolates do not share state, so this is not global protection. Use Cloudflare rate limiting/WAF, Turnstile or a durable limiter for public mutations and PIN attempts.
6. **LLM response leakage:** `parseGeminiReply` returned raw provider output on invalid JSON. Corrected in PR #7. Add formal regression tests for malformed JSON, prompt text, valid JSON and cart actions before release.
7. **Rule version drift:** Both `database.rules.json` (deployed via firebase.json) and `firebase-rules.json` exist and differ. Retire archival copies or mark non-deployable; add emulator tests + hash assertions in CI.

## Additional review targets
- `admin.html`, `loyalty.html`, `index.html`: review every HTML interpolation for encoding and DOM XSS; verify against stored hostile product/customer fields.
- `loyalty-routes.js`: test every endpoint for unauthenticated access, RBAC, owner scoping, failed-login throttling, replay, concurrency and PIN disclosure.
- `subscription_* / gift_* / orders`: verify server-side price and status invariants against arbitrary client requests.
- Review Firebase Storage object listing, public asset CORS, browser CSP and headers; `apiKey` in Firebase client config is normally public and is **not** an admin secret by itself.
- Review actual deployed rules, functions, Cloudflare route configuration and secrets/rotation in consoles. Repository code alone cannot establish live security.

## Validation / release gate
- Run `npm test` under `cloudflare-worker` and firebase emulator tests.
- Test anonymous customer flows; disabled and revoked staff access; PIN authorization; invalid AI output; stored XSS; upload restrictions.
- Verify the exact Staging deployed commit and live headers with browser/HTTP tests.
- Do not merge or deploy to Production until validation passes and a rollback plan exists.
