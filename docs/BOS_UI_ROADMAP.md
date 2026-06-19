# Roadmap — Polish UI du BOS + Bugs

> Audit du 19/06/2026. Objectif : rendre tout le BOS cohérent et "joli", et
> corriger les incohérences. Le BOS a un design system soigné (palette oklch
> rosé, variables CSS, classes `card`/`btn-modern`/`badge-modern`/`st`/`cellstack`)
> — mais les nouvelles sections CRM utilisent du Tailwind générique qui jure.

---

## 🎨 Design system existant (à réutiliser partout)
Défini dans `app/globals.css` :
- **Couleurs** (variables) : `--tx-hi/mid/lo/faint` (texte), `--green/red/blue/violet`
  (+ `-bg` et `-line`), `--bg-0..3` (fonds rosé/blush)
- **Classes** : `card` (carte standard), `btn-modern` (+ `btn-primary/secondary/subtle/sm`),
  `badge-modern` (+ `badge-success/warning/danger/info/neutral` + `badge-sm`),
  `st` / `st-delivered` etc. (pastilles statut), `cellstack`, `comp-mini`, `num`
- **Référence** : `app/orders/page.tsx` (page la mieux finie)

➡️ **Règle** : aucune nouvelle page ne doit utiliser `bg-white border-gray-200 rounded-2xl`
en dur — utiliser `card`, les variables et les classes ci-dessus.

---

## 🐞 P0 — Bugs (à corriger en premier)

1. **Doublon fiche cliente** — `/clients/[id]` (ma fiche 360°) vs `/customers/[id]`
   (existant, 108 l.). L'inbox et les avis pointent vers `/clients`.
   → **Fusionner** : porter la timeline 360° dans `/customers/[id]`, supprimer
   `/clients/[id]`, rediriger les liens. Le menu "Clients" pointe déjà `/customers`.

2. **Lien menu "Campagnes" → `/ads`** alors qu'une page `/campaigns` existe.
   → Vérifier l'intention ; lier vers la bonne page (ou clarifier ads vs campaigns).

3. **Avertissement build `middleware` déprécié** (Next 16 : renommer en `proxy`).
   → Migrer `middleware.ts` → `proxy.ts` selon la doc Next.

4. **`/stats` timeline vide** (`TODO` dans `api/ops/stats`) — l'entonnoir marche mais
   pas de graphe d'évolution. → Soit l'implémenter, soit retirer l'espace réservé.

---

## 🎯 P1 — Cohérence des sections CRM (cause du "pas joli")
Refaire avec le design system : `card`, variables couleur, `btn-modern`, `badge-modern`.

- [ ] **`/messages`** (inbox) : cartes conversation en `card`, avatars/typo cohérents,
  pastilles statut via `badge-modern`
- [ ] **`/messages/[phone]`** (thread) : bulles aux couleurs du thème (`--green` / `--bg-2`),
  zone de réponse en `card`, en-tête aligné
- [ ] **`/avis`** : lignes en `card`, badges statut `badge-modern`, boutons `btn-modern`
- [ ] **`/stats`** : KPIs et entonnoir aux couleurs du thème (pas blue-100/green-100 Tailwind)
- [ ] **Fiche 360°** : carte d'en-tête et timeline aux tokens du thème

---

## ✨ P2 — Polish transversal (tout le BOS)
- [ ] **États vides** cohérents (icône + message + CTA) sur toutes les listes
- [ ] **États de chargement** : skeletons uniformes (comme `/orders`) au lieu de spinners
- [ ] **En-têtes de page** : un composant titre+sous-titre commun
- [ ] **Responsive** : vérifier tableaux/grilles sur mobile (orders, stats, fiche)
- [ ] **Toasts** : système unifié (actuellement ad hoc par page)
- [ ] **Focus/hover/disabled** : états cohérents sur boutons et liens

---

## 🚀 P3 — Améliorations
- [ ] Recherche globale (Ctrl+K) qui couvre commandes + clients + messages
- [ ] Badge "réponses non lues" dans le menu (à côté de Messages)
- [ ] Compteur "avis en attente" dans le menu (à côté de Avis)
- [ ] Mode sombre (si le design system le permet via les variables)
- [ ] Raccourcis clavier sur les listes (j/k, entrée)

---

## 📋 Ordre conseillé
1. **P0** (bugs) — surtout le doublon fiche cliente (incohérence visible)
2. **P1** (sections CRM au design system) — règle directement le "pas joli"
3. **P2** (polish transversal) — finitions
4. **P3** (bonus) — quand le reste est propre

> Estimation P0+P1 : ~2-3h. C'est le meilleur ratio impact/effort.
