-- Migration 042 : le depot-vente — un stock qui n'appartient pas a Shine
--
-- LE CAS
-- Un ami achete le stock (19 references de soins coreens, 17 325 DH). Shine le
-- vend : boutique, publicite, livraison, service client. La marge finale, apres
-- publicite et tous les frais, se partage a 50/50.
--
-- POURQUOI LE MODELE EXISTANT NE SUFFISAIT PAS
--  * Saisi comme un achat, ce stock sortait de la tresorerie de Shine (le
--    tableau de bord compte chaque 'Purchase' comme un decaissement) : 17 325 DH
--    que Shine n'a jamais depenses.
--  * Vendu, il remontait 100 % de sa marge dans le resultat de Shine, qui n'en
--    garde que la moitie.
--  * Rien ne permettait de dire a l'ami, chiffres a l'appui, ce qui lui revient.
--
-- LE PRINCIPE DU CALCUL (voir lib/partner-ledger.ts)
-- Le resultat d'une vente partenaire est celui que le tableau de bord calcule
-- deja pour la commande, repris au prorata de la part de ses produits dans la
-- commande — pour que les deux chiffres ne puissent pas diverger. S'y ajoutent
-- les frais propres au partenariat (douane, transport, cartons, publicite
-- hors campagnes liees), saisis ici, avec QUI les a payes : c'est ce qui
-- determine ce qu'on lui rembourse.

CREATE TABLE IF NOT EXISTS "Partner" (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  -- La part de Shine dans la marge nette. Le reste revient au partenaire.
  "shinePct"   numeric(5,2) NOT NULL DEFAULT 50 CHECK ("shinePct" >= 0 AND "shinePct" <= 100),
  -- Seules les commandes livrees a partir de cette date entrent dans le releve.
  "startDate"  date NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  active       boolean NOT NULL DEFAULT true,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- Le marqueur : un produit dont le stock appartient a un partenaire.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "partnerId" integer
  REFERENCES "Partner"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Product_partnerId_idx" ON "Product" ("partnerId") WHERE "partnerId" IS NOT NULL;

-- Les frais propres au partenariat, que les commandes ne portent pas.
-- `paidBy` n'est pas un detail : une depense payee par le partenaire lui est
-- remboursee en plus de sa part ; payee par Shine, elle reduit sa part.
CREATE TABLE IF NOT EXISTS "PartnerExpense" (
  id           serial PRIMARY KEY,
  "partnerId"  integer NOT NULL REFERENCES "Partner"(id) ON DELETE CASCADE,
  date         date NOT NULL,
  category     text NOT NULL,
  label        text,
  amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
  "paidBy"     text NOT NULL CHECK ("paidBy" IN ('shine', 'partner')),
  "createdBy"  text,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PartnerExpense_partner_date_idx" ON "PartnerExpense" ("partnerId", date);

-- Ce que Shine a deja reverse au partenaire.
CREATE TABLE IF NOT EXISTS "PartnerPayment" (
  id           serial PRIMARY KEY,
  "partnerId"  integer NOT NULL REFERENCES "Partner"(id) ON DELETE CASCADE,
  date         date NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  method       text,
  note         text,
  "createdBy"  text,
  "createdAt"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PartnerPayment_partner_date_idx" ON "PartnerPayment" ("partnerId", date);

-- Les campagnes publicitaires dediees au partenaire : leur depense (synchronisee
-- dans AdSpendDaily) entre automatiquement dans son releve. Une campagne qui
-- montre aussi les produits de Shine ne doit PAS etre liee — sa depense ne se
-- repartit pas honnetement ; on la saisit alors comme depense manuelle.
CREATE TABLE IF NOT EXISTS "PartnerAdCampaign" (
  "partnerId"  integer NOT NULL REFERENCES "Partner"(id) ON DELETE CASCADE,
  "externalId" text NOT NULL,
  PRIMARY KEY ("partnerId", "externalId")
);
