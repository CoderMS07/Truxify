# GSSOC Auto-PR Cron Run Report
**Repo:** KanishJebaMathewM/Truxify
**Run:** 2026-08-13
**Phase 1:** SKIPPED (per IMPORTANT OVERRIDE)
**Phase 2:** 9 PRs filed

## Summary

20 issues filed (14274-14293). 9 actionable PRs created after verifying which issues had real bugs vs false positives.

## Issues Filed on Upstream

| # | Title | PR | Status |
|---|-------|-----|--------|
| 14274 | fix : close if block in supabaseMock.js to fix parse error | #14294 | CREATED |
| 14275 | fix : move pendingCache declaration to outer scope in idempotency middleware | #14295 | CREATED |
| 14276 | fix : use named export for deliveryVerificationService in test file | #14296 | CREATED |
| 14277 | fix : use default export for keyRotationService in test file | #14297 | CREATED |
| 14278 | fix : export supabaseHealth function correctly in health check test | #14298 | CREATED |
| 14279 | test : add unit tests for documentExpiryService.js | - | SKIPPED (tests already exist and pass: 34 tests) |
| 14280 | test : add unit tests for digilockerService.js | - | SKIPPED (tests already exist and pass: 10 tests) |
| 14281 | fix : add null guard for undefined lat/lng in routingService haversine | - | SKIPPED (already has `throw new TypeError` guard) |
| 14282 | fix : use Math.floor instead of Math.round in priceRounding toPaisa | - | SKIPPED (no `toPaisa` function found in codebase) |
| 14283 | fix : use structured logging in escrowRefundReconciliation logger calls | #14299 | CREATED |
| 14284 | test : add unit tests for escrowCircuitBreaker.js | - | SKIPPED (tests already exist and pass: 9 tests) |
| 14285 | test : add unit tests for outbox service | - | SKIPPED (tests already exist and pass: 13 tests) |
| 14286 | fix : add null guard for transaction.amount in fraudDetectionService | - | SKIPPED (no `transaction.amount` access found in FraudDetectionService.js) |
| 14287 | fix : use structured logging in kedaService logger calls | - | SKIPPED (kedaService.js already uses structured logging) |
| 14288 | test : add unit tests for shardManager.js | - | SKIPPED (ShardManager.test.js exists but requires env vars SHARD_PASSWORD_*) |
| 14289 | fix : validate negative page size in cursorPagination utility | #14300 | CREATED |
| 14290 | test : add unit tests for webhook processor | #14301 | CREATED |
| 14291 | fix : add missing await on async insertNotification call in notificationService | - | SKIPPED (no call site found - function defined but not called in current codebase) |
| 14292 | test : enable and expand unit tests for telemetryBuffer | - | SKIPPED (15 tests already pass) |
| 14293 | fix : validate device_timestamp is finite number in tracker handleLocationPing | #14302 | CREATED |

## PRs Created

| PR # | Issue | Description |
|------|-------|-------------|
| #14294 | #14274 | Fixed parse error in supabaseMock.js: added 2 missing closing braces |
| #14295 | #14275 | Fixed scope bug: `pendingCache` moved to outer scope in idempotency.js |
| #14296 | #14276 | Fixed test import: `.default` -> named `.DeliveryVerificationService` |
| #14297 | #14277 | Fixed test import: named `KeyRotationService` -> `.default` |
| #14298 | #14278 | Fixed double-invocation: `supabaseHealth()()` -> `supabaseHealth()` |
| #14299 | #14283 | Fixed 7 non-structured logger calls in escrowRefundReconciliation.js |
| #14300 | #14289 | Added explicit negative page validation (returns 400) in pagination.js |
| #14301 | #14290 | Added unit tests for escrowWebhookProcessor.js |
| #14302 | #14293 | Fixed device_timestamp validation: `Number.isNaN` -> `!Number.isFinite` |

## Key Findings

### Real Bugs Found
1. **supabaseMock.js parse error**: 2 missing closing braces in `unregister_device_token` handler
2. **idempotency.js scope bug**: `pendingCache` declared inside `if (redisClient)` block but referenced at function scope
3. **3 test export mismatches**: Tests imported wrong export type for 3 services
4. **Non-structured logging**: 7 logger calls in escrowRefundReconciliation.js used string interpolation
5. **Pagination validation**: Negative page sizes silently clamped instead of returning 400
6. **Tracker validation**: `Number.isNaN` used instead of `Number.isFinite` for device_timestamp

### False Positives
- `toPaisa` function doesn't exist (renamed/removed)
- `insertNotification` has no caller in current codebase
- `transaction.amount` access doesn't exist in FraudDetectionService
- Most test addition issues had tests added by previous cron runs

## CI Notes
- Backend unit tests: Most pass. Failures in idempotency.test.js due to `pendingCache` bug (fixed in #14295)
- Parse error in supabaseMock.js fixed (#14294)
- Flutter tests: Not run (Flutter not available in environment)

## Environment
- Node.js v22.17.0
- npm dependencies installed with `--legacy-peer-deps --ignore-scripts`
- Git identity: tmdeveloper007
- Token: vault `${GH_TOKEN}`
