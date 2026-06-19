# Roadmap CRM / Messages — Shine Cosmetics

> État au 19/06/2026. Module de relation client dans le BOS : messages WhatsApp,
> avis, fiche cliente 360°, analytics. Stack : 2 apps (storefront + BOS) sur 1 DB
> Neon partagée, WhatsApp Cloud API (1 numéro), webhook côté storefront.

---

## ✅ FAIT — Phases 1 à 4 (en production)

### Phase 1 — Socle de données ✅
- Table `MessageLog` (migration `scripts/migrate-message-log.js`)
- Helper `lib/message-log.ts` (logMessage, updateMessageStatus)
- Tous les envois tracés : OTP (`authentication`), demandes d'avis (`marketing`)
- Webhook enrichi (`app/api/whatsapp/webhook`) : capte statuts (sent/delivered/read/
  failed) + réponses entrantes, lie le `userId` par téléphone

### Phase 2 — Visibilité (lecture) ✅
- **Inbox** `/messages` : conversations groupées par téléphone, filtres, statut
- **Thread** `/messages/[phone]` : historique chat, liens cliquables, statut **Vu/Livré/Envoyé**
- **Fiche cliente 360°** `/clients/[id]` : stats + timeline (commandes + messages + avis + points)

### Phase 3 — Avis dans le BOS ✅
- **Modération** `/avis` : approuver/rejeter, photos, badge statut
- Endpoints storefront `/api/admin/reviews/[id]/approve|reject` (INTERNAL_API_SECRET)
- Bonus 50 DH déclenché à l'approbation (`maybeGrantReviewReward`)

### Phase 4 — Action ✅ (partiel)
- **Répondre depuis l'inbox** dans la **fenêtre 24h** (gratuit) :
  - `sendTextMessage()` + `/api/whatsapp/send-message` (storefront)
  - `/api/ops/messages/send` (BOS) : vérifie la fenêtre 24h, délègue au storefront
  - Zone de réponse dans le thread, désactivée + expliquée hors fenêtre
- **Analytics** `/stats` : KPIs (envois/clics/avis/conversion), entonnoir, top produits
- **Tracking clics** : loggé à l'ouverture de `/avis/[token]` (pas besoin d'éditer le template Meta)

### Correctifs notables ✅
- Points livraison : backfill (`scripts/backfill-points.js`) — toutes commandes livrées
  créditées (manuelles incluses). Idempotent.
- Aperçu message : le vrai texte + lien sont loggés (plus de placeholder générique)
- Statut **Vu / Livré / Envoyé** explicite dans inbox + thread

---

## ⚙️ Config requise (à vérifier sur Vercel)
| Variable | App | Pour |
|---|---|---|
| `INTERNAL_API_SECRET` | storefront + BOS | proxys avis/messages |
| `WHATSAPP_*` (token, phone id, version) | storefront | envois (déjà en place) |
| `WHATSAPP_VERIFY_TOKEN` | storefront | webhook (déjà en place) |
| `NEXT_PUBLIC_STOREFRONT_URL` | BOS | proxys (défaut: www.shinecosmetics.ma) |

⚠️ Webhook Meta abonné au champ **`messages`** (fait) → statuts + réponses arrivent.
⚠️ « Vu » ne s'affiche que si la cliente a les **accusés de lecture activés** côté WhatsApp.

---

## 🔜 À FAIRE — suite

### Phase 5 — Campagnes marketing (payant/message)
- [ ] Page `/campagnes` : composer (template marketing + segment)
- [ ] Segments : « livrées sans avis », « points > 50 DH non utilisés », « inactives 60j »
- [ ] Envoi groupé + suivi par destinataire (table `MessageCampaign`)
- [ ] **Opt-out** : gérer les désinscriptions (obligation légale) + ne plus cibler
- [ ] Estimation du coût avant envoi (nb destinataires × tarif marketing)

### Phase 6 — Polish & qualité
- [ ] Harmoniser le design des sections CRM avec le reste du BOS (cartes, espacements, typo)
- [ ] Notifications : badge « réponses non lues » dans le menu
- [ ] Marquer une conversation comme « lue » (statut côté équipe)
- [ ] Recherche dans l'inbox (par nom / téléphone / contenu)
- [ ] Dashboard `/stats` : graphique d'évolution 30 jours (timeline)

### Phase 7 — Idées avancées
- [ ] Réponses rapides / modèles de réponse pré-écrits
- [ ] Relance auto « avis non laissé après 7 jours » (template utility)
- [ ] Tags clients (VIP, à risque, fidèle) sur la fiche 360°
- [ ] Export CSV des messages / avis / segments

---

## 💰 Rappel coûts Meta
| Action | Coût |
|---|---|
| Recevoir, statuts (livré/vu), répondre < 24h | **Gratuit** |
| OTP (authentication), demandes d'avis (marketing) | Payant/msg — déjà en place |
| Répondre hors 24h, campagnes marketing | Payant/msg — Phase 5 |

**Ordre conseillé : Phase 6 (polish, gratuit) → Phase 5 (campagnes, quand prêt à investir).**
