# Dashboard data reconciliation - 2026-09-02

## Objective

Make every dashboard amount traceable to its authoritative source and expose discrepancies instead of hiding them inside aggregate KPIs.

Sendit cron reliability, API-call cost, locking, and retry behavior are documented in `docs/SENDIT_SYNC_RELIABILITY_2026-09-02.md`.

## Source ownership

| Fact | Authoritative source |
| --- | --- |
| Parcel status and delivery event | Sendit staging, using `lastActionAt` for delivered parcels |
| COD collected | Sendit staging `amount` |
| Courier fee | Sendit staging `fee` |
| Product revenue, products, and product costs | BOS orders and order items |
| Bank transfer cash | BOS `paidAmount`, only when `paymentStatus` is `PAID` or `PARTIAL` |
| Business-day boundary | `Africa/Casablanca` |

Rows marked `ignored` in Sendit staging belong to another activity sharing the account. They are excluded from every dashboard parcel, COD, fee, and packaging calculation.

## Formulas

### Cash after Sendit fees

```text
Sendit COD
+ verified bank transfers
- Sendit courier fees
= cash after fees
```

An unverified bank transfer is excluded from cash until its amount, date, and reference are validated. The delivered sale remains visible in product revenue and is flagged for review.

### Product revenue bridge

```text
BOS customer total
- delivery charged to customer
= delivered product revenue
```

This explains why Sendit's collected amount and the product revenue KPI are not expected to be identical.

### Calculation bases

- `Cash réalisé`: Sendit `lastActionAt` and BOS `deliveredAt` fall inside the selected period.
- `Cohorte`: Sendit `senditCreatedAt` and BOS `createdAt` fall inside the selected period.

All timestamp comparisons are converted to Casablanca local time before applying date boundaries.

The selected basis now applies to the complete analytical surface: headline revenue, profit and cash, P&L detail, chart and comparisons, order count, average basket, ROAS, products, channels, cities, reconciliation, and CSV export. Pipeline, expected revenue, delivery rate, and goals remain cohort metrics by definition and are explicitly labelled `cohorte création`.

For historical periods, goals are anchored to the selected period. Historical weekly and monthly targets are read-only; only the live week/month can be edited, so viewing July can no longer modify September's target.

## Bugs fixed

1. Ignored Sendit rows were still counted by the main ledger even though the reconciliation workflow hid them. This inflated parcels, fees, packaging, and reduced cash/profit.
2. Several order date comparisons depended on the database session timezone. Neon uses UTC, so activity around Casablanca midnight could land on the wrong business day.
3. The dashboard showed only the Sendit synchronization time. A sync several weeks old looked current because its date was hidden.
4. The dashboard had no explicit bridge between COD, verified transfers, fees, gross order value, delivery charged, and product revenue.
5. Switching to `Cohorte` changed revenue and reconciliation while profit net, cash net, P&L detail, chart rankings, and export silently remained on the delivery basis.
6. Historical month views still displayed and edited the current week/month goals.
7. Fast period navigation could let an older stats or goals response overwrite the latest selected period.
8. Chart comparison presets could overflow month ends; July's previous calendar period was requested as May 31-June 30 instead of June 1-30.

## Verified July 2026 example

For the delivered-date basis after excluding ignored rows:

| Control | Value |
| --- | ---: |
| Sendit parcels | 54 |
| Reliably linked parcels | 54 |
| Sendit COD | 22,130.50 MAD |
| Verified bank transfer | 365.00 MAD |
| Sendit fees | 1,644.00 MAD |
| Cash after fees | 20,851.50 MAD |
| BOS customer total | 22,859.50 MAD |
| Delivery charged | 1,329.00 MAD |
| Product revenue | 21,530.50 MAD |

One delivered bank transfer for 364 MAD is still unverified. It is shown as an action item and remains excluded from cash.

The ignored-row fix removed 2 unrelated parcels and 70 MAD of courier fees. It also removed 14 MAD of incorrectly accrued packaging (2 parcels x 7 MAD). July cash net therefore moved from 9,097 MAD to 9,181 MAD, while profit net moved from 8,102 MAD to 8,116 MAD.

The two valid July views now remain separate and traceable:

| Metric | Cash realised (delivery date) | Cohort (creation date) |
| --- | ---: | ---: |
| Delivered product revenue | 21,530.50 MAD | 21,531.50 MAD |
| Parcels / delivered orders | 54 | 53 |
| Average basket | 398.71 MAD | 406.25 MAD |
| Net profit after period costs | 8,116 MAD | 8,229 MAD |
| Net cash / attributed cash | 9,181 MAD | 9,209 MAD |

The 1 MAD and one-order differences are expected cohort attribution differences, not rounding or synchronization errors.

## Automatic controls

The report checks both calculation bases for:

- Sendit parcels without a reliable BOS order
- unverified bank transfers on delivered orders
- COD amount differences
- Sendit fee differences
- status differences
- date-attribution differences
- delivered BOS orders without tracking

The report opens automatically when a control fails or the Sendit sync is more than 24 hours old.

## Correction workflow

1. Run `Synchroniser Sendit` before validating current-period figures.
2. For an unverified transfer, open Orders and record the received amount, payment date, and bank reference; mark it paid only after verification.
3. For an unlinked Sendit parcel, open Sendit, assign the exact products, then link/promote the parcel. Do not match by phone alone.
4. For amount, fee, status, or date differences, keep the exact tracking link and run the matched-order synchronization. Escalate only if the live Sendit shipment still disagrees.
5. Keep parcels from another activity marked `ignored`; pulls preserve that state.

## Files changed

- `app/api/ops/dashboard/stats/route.ts`
- `app/api/ops/goals/route.ts`
- `app/GlowDashboard.tsx`
- `components/RevenueTrendChart.tsx`

## Verification

- Dashboard endpoint returned HTTP 200 for current and July 2026 ranges.
- Delivered-date and creation-date reports, P&L blocks, rankings, goals, and chart comparisons were checked against real data.
- Previous-period comparison for July was verified as June 1-30.
- Desktop and mobile layouts were visually inspected with no page-level overflow or off-screen actions.
- `npm run type-check` passed.
- Targeted ESLint passed with 0 errors.
- `npm run build` passed; 97 static pages were generated.
