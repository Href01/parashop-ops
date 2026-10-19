# Database migrations (parashop-ops)

**Plain SQL, applied by hand, in numeric order.** There is no tracking table for
these files and no auto-apply on deploy. The shared storefront schema is managed
separately by Prisma in the `parashop` repo (`prisma/migrations/`).

> The full, reproducible procedure (both repos, verification queries, rollback
> and the exact commands Achraf runs) lives in
> [`docs/MIGRATIONS_RUNBOOK.md`](../docs/MIGRATIONS_RUNBOOK.md).

## Order

1. **Storefront first.** A fresh database is built by the storefront's Prisma
   migrations (`parashop/prisma/migrations/`, tracked in `_prisma_migrations`),
   then the loose SQL files in `parashop/migrations/`.
2. **Then this folder**, `001_*` → `055_*`, followed by the two legacy
   unnumbered files (`add_sendit_district_id.sql`, `add_order_audit_log.sql`).
   See the runbook for why they are last and why they are **not idempotent**.

Numbers `004` and `009` are intentional gaps (never used). Migration history
note: this folder and `prisma/migrations/` used to collide; they were
consolidated here on 2026-07-11 (former `004..006` became `027..029`).

## Add a new migration

1. Create `NNN_short_description.sql` using the next free number (currently
   `056`).
2. Make it idempotent (`IF NOT EXISTS`, guarded `DO $$ ... $$`) so a re-run is
   safe. The two legacy unnumbered files are the only exceptions.
3. Prepare it and let **Achraf** apply it — never apply a migration unattended:

   ```bash
   node scripts/run-migration.js NNN_short_description.sql
   ```

   `scripts/run-migration.js` reads `DATABASE_URL` from `.env` (via `dotenv`)
   and executes the whole file in one `pool.query`. It does **not** wrap the
   file in a transaction and does **not** record anything: if a statement
   fails midway, part of the file may already be applied. Run migrations one at
   a time, on a restored clone first.
