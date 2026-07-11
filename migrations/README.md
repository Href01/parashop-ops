# Database migrations

**This is the single source of truth for schema changes.** Plain SQL, applied in
numeric order. There is no migrations tracking table and no auto-apply on deploy —
migrations are run manually against the database.

> History note: migrations used to live in **two** folders (`migrations/` and
> `prisma/migrations/`) with colliding numbers. They were consolidated here on
> 2026-07-11. The former `prisma/migrations/004..006` are now `027..029`. Numbers
> `004` and `009` are intentional gaps (never used).

## Add a new migration

1. Create `NNN_short_description.sql` using the next free number (currently `030`).
2. Make it idempotent (`IF NOT EXISTS`, guarded `DO $$ ... $$`) so a re-run is safe.
3. Apply it:

   ```bash
   node scripts/run-migration.js NNN_short_description.sql
   ```

Files are applied by hand; keep them ordered so a fresh database can be rebuilt by
running them 001 → latest.
