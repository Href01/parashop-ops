-- Migration 026: operating expenses + packaging rate, for the period P&L / cash view
--
-- The dashboard needs a clean "Résultat de la période" showing both:
--   Rentabilité (accrual): CA livré − COGS − livraison − emballage(taux×colis) − pub
--   Trésorerie (cash):     encaissé − achats fournisseur − pub − dépenses opérationnelles
--
-- Purchases (InventoryMovement) and ads (AdCampaign/AdSpendDaily) already exist. What's
-- missing is a place to log OTHER real cash costs (packaging bought, cartons, external
-- ads, misc) for the trésorerie side, plus a packaging-per-parcel rate for the accrual
-- emballage line in the margin. Those are the two things this migration adds.

CREATE TABLE IF NOT EXISTS "OperatingExpense" (
  id          SERIAL PRIMARY KEY,
  "date"      date        NOT NULL DEFAULT CURRENT_DATE,
  category    text        NOT NULL DEFAULT 'Divers',   -- Emballage | Pub | Livraison | Salaire | Divers …
  label       text,
  amount      numeric     NOT NULL,
  "performedBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "OperatingExpense_date_idx" ON "OperatingExpense" ("date");

-- Packaging cost per delivered parcel (MAD), used for the accrual "emballage" line in
-- the Rentabilité view. 0 until the user sets it.
INSERT INTO "AppSetting" (key, value)
VALUES ('packaging_cost_per_parcel', '0')
ON CONFLICT (key) DO NOTHING;
