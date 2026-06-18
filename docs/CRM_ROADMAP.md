# Roadmap CRM / Messages — Shine Cosmetics (BOS)

> Module de relation client centralisé dans le BOS (`parashop-ops`) : voir et gérer
> tous les messages WhatsApp (OTP, avis, marketing, réponses), les avis, et une
> fiche cliente 360°.

## 1. Contexte & architecture (existant)

- **2 apps, 1 DB** : storefront `parashop` (shinecosmetics.ma) + BOS `parashop-ops`
  (ops.shinecosmetics.ma) partagent la **même base Neon PostgreSQL** (`pg` brut, pas Prisma).
- **WhatsApp Cloud API** : un seul numéro. Envois actuels :
  - OTP — `parashop/app/api/otp/send-whatsapp`
  - Demande d'avis — `parashop/lib/whatsapp.ts` (`sendReviewRequest`) appelé par
    `parashop/app/api/reviews/send-request` (proxy interne, secret `INTERNAL_API_SECRET`)
    et par le cron `parashop/app/api/cron/review-requests`.
- **Webhook** : `parashop/app/api/whatsapp/webhook` — répond au handshake mais
  **jette** les événements entrants (`TODO: store them`).
- **Avis** : table `Review` (approved, pointsAwarded, images, orderId) ; modération
  actuelle sur le **storefront** `parashop/app/admin/reviews` + bonus 50 DH via
  `parashop/lib/reviews.ts` (`maybeGrantReviewReward`).
- **Bouton "Demander un avis"** : déjà sur la fiche commande ET la table commandes
  du BOS → `parashop-ops/app/api/ops/orders/[id]/review-request` (proxy storefront).

### Décisions d'architecture
1. **Webhook reste sur le storefront**, mais **écrit dans la DB partagée** (`MessageLog`).
   Le BOS **lit** depuis la même DB. → 1 seule URL webhook chez Meta, pas de duplication.
2. **Envoi sortant** : 2 options
   - **(A) BOS proxie le storefront** (comme le bouton avis) — zéro secret WhatsApp dans le BOS.
   - **(B) BOS envoie direct** — copier `WHATSAPP_*` sur le projet BOS Vercel.
   → **Reco : (A) pour les templates** (réutilise l'existant), **(B) seulement si**
     on veut une inbox temps réel performante. Décision à figer en Phase 4.
3. **Le logging est centralisé** dans un helper partagé appelé à chaque envoi.

## 2. Modèle de données

```sql
CREATE TABLE "MessageLog" (
  id            SERIAL PRIMARY KEY,
  "userId"      INTEGER REFERENCES "User"(id) ON DELETE SET NULL,
  phone         TEXT NOT NULL,                  -- +212…
  direction     TEXT NOT NULL,                  -- 'out' | 'in'
  type          TEXT NOT NULL,                  -- 'otp' | 'review' | 'marketing' | 'reply' | 'utility'
  category      TEXT,                           -- 'authentication' | 'utility' | 'marketing' | 'service'
  "templateName" TEXT,
  body          TEXT,
  status        TEXT,                           -- 'queued'|'sent'|'delivered'|'read'|'failed'
  "waMessageId" TEXT,                           -- id Meta (corrélation statuts)
  "errorCode"   TEXT,
  "orderId"     INTEGER REFERENCES "Order"(id) ON DELETE SET NULL,
  "campaignId"  INTEGER,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX "MessageLog_phone_idx"  ON "MessageLog"(phone);
CREATE INDEX "MessageLog_userId_idx" ON "MessageLog"("userId");
CREATE UNIQUE INDEX "MessageLog_wamid_idx" ON "MessageLog"("waMessageId") WHERE "waMessageId" IS NOT NULL;

-- Optionnel (Phase 4)
CREATE TABLE "MessageCampaign" (
  id SERIAL PRIMARY KEY, name TEXT, segment TEXT, "templateName" TEXT,
  "sentCount" INTEGER DEFAULT 0, "createdBy" TEXT, "createdAt" TIMESTAMP DEFAULT NOW()
);
```
Migration via script idempotent (modèle : `parashop/scripts/migrate-reviews.js`).

## 3. Phases

### Phase 1 — Socle de visibilité (zéro coût Meta) ⭐ priorité
**But :** tout envoi/réception tracé. Rien n'est encore visible côté UI, mais la donnée existe.
- [ ] Migration `MessageLog`.
- [ ] `lib/message-log.ts` (partagé) : `logMessage()`.
- [ ] Instrumenter les envois existants : OTP, `sendReviewRequest` → écrire `MessageLog`
      + stocker le `waMessageId` renvoyé par Meta.
- [ ] Webhook storefront : parser les événements `messages` →
  - `statuses[]` → `UPDATE MessageLog SET status WHERE "waMessageId" = …`
  - `messages[]` (entrants) → `INSERT MessageLog (direction='in', type='reply')`
- **Prérequis user :** vérifier dans Meta que le webhook est abonné au champ **`messages`**.

### Phase 2 — Lecture seule dans le BOS
- [ ] **Fiche cliente 360°** `parashop-ops/app/clients/[id]` : commandes + messages +
      avis + points + cagnotte en timeline (la section "Clients" existe déjà dans le menu).
- [ ] **Historique messages** par commande (sur la fiche commande) + colonne/indicateur
      "message envoyé/livré/lu" dans la table.
- [ ] **Inbox lecture seule** : liste des conversations (regroupées par téléphone),
      derniers messages, statut.

### Phase 3 — Avis dans le BOS
- [ ] Page `parashop-ops/app/avis` : modération (approuver/rejeter, voir photos,
      badge "Achat vérifié"), réutilise les API avis + `maybeGrantReviewReward`.
- [ ] Compteur d'avis en attente dans le menu.

### Phase 4 — Action & marketing (coût Meta par message)
- [ ] **Répondre depuis l'inbox** — ⚠️ **fenêtre de service 24h** : message libre seulement
      si la cliente a écrit dans les dernières 24h ; sinon **template obligatoire**.
      → nécessite l'option **(B)** (WhatsApp env sur le BOS) ou un endpoint storefront d'envoi libre.
- [ ] **Campagnes ciblées** : segments (ex. "livrées sans avis", "points > 50 DH non utilisés",
      "inactives 60j") + envoi template marketing + suivi par destinataire (`MessageCampaign`).
- [ ] **Opt-out** : gérer les désinscriptions (obligation légale marketing).

## 4. Contraintes WhatsApp / coûts (à garder en tête)
- **Recevoir** + **répondre dans 24h** (service) = **gratuit**.
- **Templates** = payant par message, par catégorie :
  `authentication` (OTP) · `utility` (avis/suivi) · `marketing` (le plus cher).
- ⚠️ Vérifier la catégorie réelle du template `review_request` (le "50 DH" peut le
  faire passer en **marketing**). Une version utility (bonus visible sur la page `/avis`
  plutôt que dans le message) réduit le coût.
- Le **journal `MessageLog`** permettra de **suivre la dépense** (nb utility vs marketing).

## 5. Config / env
| Variable | Où | Quand |
|---|---|---|
| `INTERNAL_API_SECRET` | parashop + parashop-ops | déjà requis (bouton avis) |
| `WHATSAPP_*` (token, phone id, version) | parashop-ops | Phase 4 si envoi direct (option B) |
| `WHATSAPP_VERIFY_TOKEN` | parashop (webhook) | déjà en place |

## 6. Décisions ouvertes (à figer avant Phase 4)
1. Inbox : option (A) proxy storefront vs (B) BOS direct ?
2. `review_request` : garder marketing (hook fort) ou créer une version utility (moins chère) ?
3. Segments marketing prioritaires + politique d'opt-out.

---
**Ordre conseillé : Phase 1 → 2 → 3 (aucun coût Meta), puis 4 quand prêt pour le marketing.**
