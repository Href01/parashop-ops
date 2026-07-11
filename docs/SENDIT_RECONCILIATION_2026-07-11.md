# Sendit and payment reconciliation - 2026-07-11

## Scope

This pass fixes the ownership of Sendit shipments, separates COD from prepaid
payments, and makes dashboard cash metrics depend on verified payment facts.

## Before and after

| Area | Before | After |
| --- | --- | --- |
| Shipment matching | A phone number could attach a shipment to the wrong order. | Orders are linked only by an existing tracking code, a promoted owner, or one unique exact reference. Phone matching is never used for orders. |
| Products shown in Sendit | A wrong order link could send unrelated internal product names. | Unmatched shipments stay in the Sendit staging inbox until products are explicitly assigned and promoted. |
| City and district | District lookup was not scoped to the configured pickup district. | The Sendit district request includes `pickup-district`; a destination mismatch is surfaced and logged. |
| Delivery fee | The customer delivery charge and Sendit courier fee could overwrite each other. | `deliveryFeeCharged` is customer revenue; `actualDeliveryCost` is the Sendit fee. |
| COD | Delivered totals were assumed to be cash. | Delivered COD records `paidAmount`, `paidAt`, and `paymentStatus=PAID` from Sendit. |
| Bank transfer | A delivered transfer could be counted like COD. | A transfer needs amount, date, and reference. Until verified, it contributes zero received cash. |
| Dashboard | Cohort cash used order totals, including unverified transfers. | Cash is verified COD plus verified/partial bank payments, minus the courier fee. COD and bank are displayed separately. |
| Lifecycle side effects | Sync paths did not consistently run loyalty and Meta CAPI, and inventory could decrement twice. | Delivery paths run idempotent loyalty/CAPI handling; stock checks for an existing sale movement. |

## Financial definitions

- `CA livre`: product revenue for orders delivered in the selected basis.
- `Encaisse COD`: COD amount received for delivered orders.
- `Virements recus`: only `PAID` or `PARTIAL` bank/card amounts.
- `Cash recu`: `COD + virements verifies - frais Sendit`.
- `Profit livre`: delivered product revenue minus COGS and delivery cost.
- `Cash net genere`: cash received minus supplier purchases, advertising, and recorded operating expenses.
- `Cash realise (livraison)`: attributed by `deliveredAt` in `Africa/Casablanca`.
- `Cohorte (creation)`: the same facts grouped by the order creation date.

The weekly/monthly objective remains a sales objective based on confirmed plus
delivered CA. The UI now labels it as CA rather than cash collected.

## Manual reconciliation workflow

1. Open `/sendit` and filter rows with state `sendit_only` or `mismatch`.
2. Verify the Sendit code, destination, amount, payment method, and source order reference.
3. Assign the exact products and quantities. Do not infer products from a phone number.
4. For `VIREMENT`, enter the received amount, bank date, and reference from the bank proof.
5. Promote the staging row. Promotion becomes the authoritative one-to-one owner of the shipment.
6. If the bank proof is missing, leave the payment `UNVERIFIED`; it will not enter cash metrics.

## Production repair executed

- Restored the official tracking and financial facts for 10 corrupted order links.
- Restored one order from delivered to its official cancelled state.
- Kept one delivered bank-transfer order (`Order 185`) as `UNVERIFIED` pending bank proof.
- Detached the 10 unrelated shipments as `sendit_only` instead of guessing their products.
- Post-repair dry run: zero pending link repairs.
- Integrity audit: zero duplicate order tracking codes, zero duplicate promoted owners,
  zero promoted-owner mismatches, zero invalid payment statuses, and zero negative paid amounts.
- There are 16 unpromoted `sendit_only` rows requiring business review, including the 10 detached rows.

## Database protection

- `004_payment_reconciliation.sql` adds payment amount, date, reference, and status facts.
- `005_sendit_invariants.sql` enforces unique tracking ownership, unique promoted ownership,
  consistent promoted links, valid payment statuses, and non-negative paid amounts.

Both migrations were applied to production on 2026-07-11.

## Verification

- `npm run type-check`: passed.
- `npm run build`: passed.
- Repair script apply: 10/10 committed in one database transaction.
- Repair script post-check: 0 remaining repairs.
