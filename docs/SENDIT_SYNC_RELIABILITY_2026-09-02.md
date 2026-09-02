# Sendit sync reliability and cost - 2026-09-02

## Scope

Restore the production cron path, make Sendit synchronization deterministic, and reduce API, database, and Vercel function cost without adding a paid service.

## Root causes fixed

1. The global middleware required both the shared gate cookie and a founder session before API routes could run. Vercel Cron has neither, so all five scheduled jobs were rejected before reaching their route.
2. The old Sendit path could request individual tracking data for up to 100 orders and then download the full delivery ledger, duplicating API work.
3. Staging pulled hundreds of rows with one Neon round trip per parcel. A no-change reconciliation then opened a transaction for every linked order.
4. A session advisory lock is unsafe with Neon/PgBouncer transaction pooling because unlock can reach a different backend. A test reproduced the leaked lock.
5. A successful HTTP response could hide row-level failures and there was no durable run history.
6. `PENDING` and unknown Sendit states were treated as order decisions in staging, creating false mismatches and risking reversal of a human cancellation.
7. Generic retries included delivery-creation `POST` requests. If Sendit accepted a request but the response timed out, an automatic replay could create a duplicate parcel.
8. Dashboard payment aliases differed from the order sync aliases. Historical `BANK`, `BANK_TRANSFER`, `PREPAID`, or `CARTE` values could be classified as COD.

## Implementation

- A valid `Authorization: Bearer $CRON_SECRET` now passes the middleware before browser-only authentication. Destination routes still validate the same secret and fail closed when it is absent.
- One full paginated Sendit snapshot is the source for status, COD amount, courier fee, and delivery time. The sync no longer calls tracking once per order.
- The full snapshot is stored with one atomic JSONB upsert. Only orders with an actual status, payment, tracking, date, or fee difference enter a transaction.
- A transaction-scoped PostgreSQL advisory lock prevents concurrent runs and releases automatically on commit or connection loss.
- Cron duplicates within six hours are skipped. Manual founder sync remains forceable.
- GET/login requests have bounded timeout and retry behavior. Delivery-creation POST requests are never automatically replayed.
- Actual HTTP attempts, retries, page count, duration, changed orders, warnings, and failures are recorded in `IntegrationSyncRun`.
- Run history has a 90-day retention policy. No Redis, queue, worker, or additional hosted service was introduced.
- A Sendit health panel reports freshness, unresolved parcels, discrepancies, last duration, calls, and failures without calling Sendit again.

## Cost before and after

| Measure | Before | After |
| --- | ---: | ---: |
| Steady-state duration, measured | 79.116 s | 5.394 s |
| Steady-state linked order writes | 219 | 0 |
| Snapshot database writes | 225 round trips | 1 bulk upsert |
| Sendit calls on a cold five-page run | Full ledger + up to 100 tracking calls + login | 5 pages + 1 login |
| Additional service | None | None |
| Sync history retention | None | About 90 small rows |

The measured steady-state function duration fell by 93.2%, or about 14.7 times. At the current five-page ledger size, the daily production cron normally uses six Sendit HTTP calls, roughly 180 calls in a 30-day month before exceptional safe retries.

## Payment and cost rules verified

- COD orders use Sendit's collected amount.
- Virement/card/prepaid orders send a zero COD amount to Sendit.
- Bank cash enters the dashboard only when `paymentStatus` is `PAID` or `PARTIAL`.
- Courier cost uses Sendit `fee` and is copied to `actualDeliveryCost` for reliably linked orders.
- Product profit is recalculated by the existing order trigger when actual delivery cost changes.
- Current linked data has zero COD mismatch and zero courier-fee mismatch.
- Seven linked bank-transfer shipments were checked; all seven have Sendit COD equal to zero.

## Live verification

| Check | Result |
| --- | --- |
| Sendit snapshot | 225 parcels across 5 pages |
| Current staging | 219 matched, 3 unresolved, 5 explicitly ignored |
| Optimized no-change reconciliation | 0 orders written, 0 failures |
| Lock after success | 0 advisory locks |
| Concurrent second run | Skipped in 3 s, no API call and no run row |
| July delivered cash bridge | 22,130.50 COD + 365 bank - 1,644 fees = 20,851.50 MAD |
| Unverified July transfer | 364 MAD excluded from cash and surfaced for review |

## Operational behavior

1. Use `Synchroniser Sendit` for a fresh remote snapshot and local reconciliation.
2. Use `Réconcilier localement` only after manual corrections; it makes zero Sendit API calls.
3. Resolve the three `Sendit seul` rows manually by exact tracking/reference and products. Phone-only automatic matching remains disabled because it can attach the wrong order or product.
4. Check `Santé technique` when the last pull is older than 26 hours or a run reports failures.

## Files

- `middleware.ts`
- `lib/sendit.ts`
- `lib/sendit-staging-sync.ts`
- `lib/sendit-orchestrator.ts`
- `app/api/cron/sync-sendit/route.ts`
- `app/api/cron/compute-metrics/route.ts`
- `app/api/ops/sendit/staging/route.ts`
- `app/api/ops/orders/sync-sendit/route.ts`
- `app/api/ops/health/route.ts`
- `app/health/page.tsx`
- `app/sendit/page.tsx`
- `app/GlowDashboard.tsx`
- `migrations/037_integration_sync_runs.sql`

