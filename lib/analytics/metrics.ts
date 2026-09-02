/**
 * COUCHE DE MESURE — une seule definition par grandeur.
 *
 * Le tableau de bord contenait TROIS cartographies de canal differentes et DEUX
 * definitions du chiffre d'affaires, dans un meme fichier. Deux cartes voisines
 * pouvaient donc afficher deux verites sur la meme periode, sans que rien ne le
 * signale. Ce module est la source unique : toute requete qui parle d'un canal,
 * d'une date de reference ou d'un taux passe par ici.
 *
 * Rien de tout cela n'est cosmetique — c'est ce qui separe un tableau de bord
 * d'une collection de requetes.
 */

export const TZ = 'Africa/Casablanca'

/**
 * FILTRE ANTI-BRUIT, partage par tout ce qui compte des visites.
 *
 * Il vivait dans la route `store`, donc toute nouvelle requete repartait sans
 * lui — et comptait les robots. Deux regles, apprises d'une erreur :
 *  1. le bruit machine se detecte sur les SESSION_START repetes (une session en
 *     boucle en avait 314, une vraie visite en emet 1 ou 2), jamais sur le
 *     volume d'evenements — celui-ci punit l'engagement, ce qui est l'inverse
 *     du but ;
 *  2. une session qui a achete ou mis au panier n'est JAMAIS ecartee. L'ancienne
 *     version en jetait 46 sur 30 jours, dont 6 QUI AVAIENT ACHETE.
 *
 * S'utilise dans un WHERE portant sur "PageView".
 */
export const BOT_FILTER_CLAUSE = `
  AND NOT EXISTS (
    SELECT 1 FROM "AnalyticsSession" s2
    WHERE s2."sessionId" = "PageView"."sessionId"
      AND s2."isBot"
      AND NOT EXISTS (
        SELECT 1 FROM "AnalyticsEvent" e4
        WHERE e4."sessionId" = s2."sessionId"
          AND e4.name IN ('PURCHASE_SUCCESS', 'ORDER_CREATED', 'PRODUCT_ADD_TO_CART')
      )
  )
`

/** Same business rule as BOT_FILTER_CLAUSE, for queries joined to session alias `s`. */
export const SESSION_BOT_FILTER_CLAUSE = `
  AND NOT (
    COALESCE(s."isBot", false)
    AND NOT EXISTS (
      SELECT 1 FROM "AnalyticsEvent" e4
      WHERE e4."sessionId" = s."sessionId"
        AND e4.name IN ('PURCHASE_SUCCESS', 'ORDER_CREATED', 'PRODUCT_ADD_TO_CART')
    )
  )
`
/* CE FILTRE LIT DESORMAIS LA COLONNE, IL NE LA RECALCULE PLUS.
 *
 * Il portait sa propre expression regexp, en DOUBLE de la colonne generee
 * "isBot" (`is_bot_user_agent`) — deux definitions du meme mot, qui ne
 * s'accordaient pas : la colonne marquait 1 414 sessions, la regexp ZERO.
 *
 * Et il comptait les SESSION_START de chaque session dans une sous-requete
 * correlee AVEC AGREGAT IMBRIQUE. Mesure sur 30 jours : 6 261 boucles, 69 ms
 * -> 262 ms, et 23,4 MILLIONS de lectures d'index sur une table de 91 000
 * lignes. Ce que ce calcul retirait : 5 sessions sur 2 957.
 *
 * Ce critere des « plus de 10 SESSION_START » n'est pas un signal de robot,
 * c'est le symptome d'un defaut client : 433 sessions emettent plusieurs
 * SESSION_START. C'est CE defaut qu'il faut corriger, pas le contourner a
 * chaque lecture du tableau de bord.
 *
 * Ce qui est CONSERVE, parce que c'est ce qui compte : une session qui a
 * achete ou mis au panier n'est jamais ecartee. L'ancienne version en jetait
 * 46 sur 30 jours, dont 6 QUI AVAIENT ACHETE.
 *
 * S'utilise dans un WHERE portant sur "PageView".
 */

/* ─────────────────────────────────────────────────────────────────────────────
   1. LA BASE DE DATE — deux questions, deux reponses, jamais melangees

   Sur 30 jours, la meme periode vaut 19 337 MAD datee a la commande et
   21 431 MAD datee a la livraison : 11 % d'ecart. Les deux sont justes, elles ne
   repondent simplement pas a la meme question.

     cohorte  : date de COMMANDE. « La publicite de cette periode a-t-elle
                produit ? » On compare une depense a ce qu'elle a genere, quel
                que soit le sort ulterieur des colis. C'est la vue marketing.
     cash     : date de LIVRAISON. « Qu'est-ce qui a ete effectivement livre ? »
                C'est une base de ventes realisees, pas une date d'encaissement.

   Melanger les deux, c'est comparer le budget de juillet aux encaissements
   d'aout. Le selecteur est donc explicite en tete de page, jamais implicite.
   ───────────────────────────────────────────────────────────────────────────── */

export type MoneyBasis = 'cohorte' | 'cash'

/** Colonne de date a utiliser pour filtrer les commandes. */
export function basisDateExpr(basis: MoneyBasis, alias = ''): string {
  const p = alias ? `${alias}.` : ''
  const col = basis === 'cash' ? 'deliveredAt' : 'createdAt'
  return `((${p}"${col}") AT TIME ZONE '${TZ}')::date`
}

/**
 * En base cash, seule une commande LIVREE a une date de livraison : le filtre de
 * statut n'est pas une option, c'est la definition. En base cohorte on garde
 * toutes les commandes et on lit leur sort dans le taux de livraison.
 */
export function basisStatusFilter(basis: MoneyBasis, alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return basis === 'cash' ? `AND ${p}status = 'DELIVERED' AND ${p}"deliveredAt" IS NOT NULL` : ''
}

export const BASIS_LABEL: Record<MoneyBasis, { titre: string; explication: string }> = {
  cohorte: {
    titre: 'Base commande',
    explication: 'daté au jour de la commande — pour juger ce que la publicité a produit',
  },
  cash: {
    titre: 'Base livraison',
    explication: 'daté au jour de la livraison — ventes réalisées, distinctes de la date d’encaissement',
  },
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. LE CANAL D'ACQUISITION — une seule expression, partout

   La carte ROAS groupait sur `sourceChannel`, dont les valeurs reelles sont
   `website` (33), `instagram` (22), `whatsapp` (9). C'est un melange de deux
   choses incomparables : le TYPE de commande (passee sur le site) et l'ORIGINE
   d'une commande saisie a la main. Consequence : les 15 commandes venues des
   publicites (utm ig/fb) etaient noyees dans `website`, et on divisait la
   depense Meta par un tableau ou Meta n'existait pas.

   Deux dimensions distinctes, donc :

     TYPE       = `sessionId IS NOT NULL`. C'est le seul signal fiable : on
                  trouve 2 commandes marquees `website` sans session.
     ACQUISITION = les utm pour le site, `sourceChannel` pour le manuel.

   Verifie sur 90 j : Instagram Ads 14 · Facebook Ads 1 · Instagram organique 12 ·
   Recherche 10 · Facebook organique 1 · Direct 13 (= 51 site), Instagram DM 52 ·
   WhatsApp 14 · TikTok 2 · non renseignee 12 (= 80 manuel). Total 131. ✔
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * LES REGLES DE CLASSEMENT PAR UTM — ECRITES UNE SEULE FOIS.
 *
 * Elles servent a la fois aux SESSIONS (d'ou vient la visite) et aux COMMANDES
 * du site (d'ou vient l'achat). Les dupliquer serait la pire des economies :
 * le taux de conversion par canal se calcule en divisant les secondes par les
 * premieres, et deux classements qui derivent d'un cheveu donnent un taux faux
 * sans que rien ne le signale.
 *
 * `utmMedium = 'paid'` est le discriminant, et il correspond exactement a la
 * convention en place : `ig` arrive en `paid` avec un identifiant de campagne
 * et un `fbclid` (c'est la publicite), `Instagram` arrive en `referral` sans
 * campagne (c'est l'organique). Verifie sur 30 j : ig/paid 1 214 sessions
 * reparties sur 4 campagnes, Instagram/referral 315.
 *
 * @param prefixe condition ajoutee devant chaque regle (les commandes ne
 *   classent par utm que si elles viennent du site), '' pour les sessions.
 */
function reglesUtm(src: string, med: string, prefixe = ''): string {
  const p = prefixe ? `${prefixe} AND ` : ''
  return `
    WHEN ${p}${med} = 'paid' AND (${src} LIKE '%insta%' OR ${src} = 'ig') THEN 'Instagram Ads'
    WHEN ${p}${med} = 'paid' AND (${src} LIKE '%face%' OR ${src} = 'fb') THEN 'Facebook Ads'
    WHEN ${p}${med} = 'paid' AND (${src} LIKE '%tiktok%' OR ${src} = 'tt') THEN 'TikTok Ads'
    WHEN ${p}${med} = 'paid' AND ${src} = 'an' THEN 'Audience Network'
    WHEN ${p}${med} = 'paid' AND ${src} = 'th' THEN 'Threads Ads'
    WHEN ${p}${med} = 'paid' AND ${src} IS NOT NULL THEN 'Pub ' || INITCAP(${src})
    WHEN ${p}(${src} LIKE '%insta%' OR ${src} = 'ig') THEN 'Instagram (organique)'
    WHEN ${p}(${src} LIKE '%face%' OR ${src} = 'fb') THEN 'Facebook (organique)'
    WHEN ${p}(${src} LIKE '%tiktok%' OR ${src} = 'tt') THEN 'TikTok (organique)'
    WHEN ${p}(${src} LIKE '%search%' OR ${src} LIKE '%google%' OR ${src} = 'bing') THEN 'Recherche'
    /* Les assistants deviennent une source d'acquisition reelle : 84 visites en
       30 jours viennent de chatgpt.com. Sans cette regle elles tombaient dans
       le repli generique et s'affichaient « Chatgpt.Com » — lisible, mais
       eparpille des qu'un autre assistant s'y met. */
    WHEN ${p}(${src} LIKE '%chatgpt%' OR ${src} LIKE '%openai%') THEN 'ChatGPT'
    WHEN ${p}(${src} LIKE '%perplexity%' OR ${src} LIKE '%claude%' OR ${src} LIKE '%gemini%' OR ${src} LIKE '%copilot%') THEN 'Assistants IA'
    WHEN ${p}${src} IS NOT NULL THEN INITCAP(${src})`
}

/**
 * D'ou vient une SESSION. Meme classement que les commandes du site, applique
 * aux colonnes de "AnalyticsSession" — c'est ce qui permet de diviser les unes
 * par les autres.
 *
 * @param s alias de la table "AnalyticsSession"
 */
export function sessionChannelSql(s = 's'): string {
  const src = `LOWER(NULLIF(TRIM(${s}."utmSource"),''))`
  const med = `LOWER(NULLIF(TRIM(${s}."utmMedium"),''))`
  /* Un referent connu vaut mieux que « Direct » : une visite arrivee depuis
     chatgpt.com sans utm est tout sauf directe, et c'est un canal qu'on ne
     saurait pas avoir autrement. */
  const ref = `LOWER(NULLIF(TRIM(${s}."landingReferrer"),''))`
  return `CASE ${reglesUtm(src, med)}
    WHEN ${ref} LIKE '%chatgpt%' OR ${ref} LIKE '%openai%' THEN 'ChatGPT'
    WHEN ${ref} LIKE '%perplexity%' OR ${ref} LIKE '%claude%' OR ${ref} LIKE '%gemini%' THEN 'Assistants IA'
    WHEN ${ref} LIKE '%google%' OR ${ref} LIKE '%bing%' THEN 'Recherche'
    WHEN ${ref} LIKE '%insta%' THEN 'Instagram (organique)'
    WHEN ${ref} LIKE '%face%' THEN 'Facebook (organique)'
    ELSE 'Direct'
  END`
}

/**
 * @param o alias de la table "Order"
 * @param s alias de la table "AnalyticsSession" jointe sur sessionId (LEFT JOIN)
 */
export function acquisitionChannelSql(o = 'o', s = 's'): string {
  const src = `LOWER(COALESCE(NULLIF(TRIM(${o}."utmSource"),''), NULLIF(TRIM(${s}."utmSource"),'')))`
  const med = `LOWER(COALESCE(NULLIF(TRIM(${o}."utmMedium"),''), NULLIF(TRIM(${s}."utmMedium"),'')))`
  const ch = `LOWER(NULLIF(TRIM(${o}."sourceChannel"),''))`
  const site = `${o}."sessionId" IS NOT NULL`
  return `CASE
    -- Commandes passees sur le site : l'acquisition vient des utm.
    ${reglesUtm(src, med, site)}
    WHEN ${site} THEN 'Direct'
    -- Commandes saisies a la main : l'origine est ce que l'equipe a renseigne.
    WHEN ${ch} LIKE '%insta%' THEN 'Instagram (DM)'
    WHEN ${ch} LIKE '%whats%' THEN 'WhatsApp (DM)'
    WHEN ${ch} LIKE '%tiktok%' THEN 'TikTok (DM)'
    WHEN ${ch} LIKE '%famille%' THEN 'Famille / Proches'
    /* Places de marche : notre stock, leur prix, leur commission. Elles doivent
       apparaitre a part — leur marge n'est pas comparable a celle du site. */
    WHEN ${ch} LIKE '%jumia%' THEN 'Jumia'
    WHEN ${ch} LIKE '%marjane%' THEN 'Marjane Mall'
    -- 'sendit' = commande creee depuis un colis, 'website' sans session = saisie
    -- manuelle mal etiquetee : dans les deux cas l'origine n'a jamais ete saisie.
    ELSE 'Origine non renseignée'
  END`
}

/* ─────────────────────────────────────────────────────────────────────────────
   L'APPAREIL — ce que la donnee prouve, et rien de plus

   Le navigateur integre d'Instagram publie l'identifiant materiel complet, la
   version d'iOS, l'echelle et la resolution :

     Instagram 439.0.0.35.60 (iPhone18,2; iOS 26_5_2; fr_FR; scale=3.00; 1320x2868)

   Safari en direct ne le donne JAMAIS, et Chrome Android l'a retire de son
   cote (« Android 10; K »). Couverture mesuree : 1 711 iPhone sur 2 578 (66 %)
   et 829 Android sur 2 027 (41 %). Ces trous ne sont pas comblables — ce sont
   des decisions d'Apple et de Google, pas un defaut de notre code.

   ON NE TRADUIT PAS EN NOM COMMERCIAL. L'identifiant Apple court en avance sur
   le nom vendu : `iPhone10,2` plafonne a iOS 16.7, c'est donc du materiel de
   2017. Ecrire « iPhone 18 » a cote de `iPhone18,2` serait faux et se verrait
   immediatement. On expose l'identifiant brut, exact, et on en tire ce qui sert
   VRAIMENT a decider : depuis quand, et de quelle taille.
   ───────────────────────────────────────────────────────────────────────────── */

/** Le modele declare : identifiant Apple, reference Android, ou l'aveu qu'on ne sait pas. */
export function modeleAppareilSql(s = 's'): string {
  const ua = `${s}."userAgent"`
  return `CASE
    WHEN ${ua} ~ 'iPhone[0-9]+,[0-9]+' THEN (regexp_match(${ua}, '(iPhone[0-9]+,[0-9]+)'))[1]
    WHEN ${ua} ~ 'SM-[A-Z0-9]+'        THEN (regexp_match(${ua}, '(SM-[A-Z0-9]+)'))[1]
    WHEN ${ua} ~* 'Pixel [0-9]+'       THEN (regexp_match(${ua}, '(Pixel [0-9]+)'))[1]
    WHEN ${ua} ILIKE '%iPhone%'        THEN 'iPhone (modèle non déclaré)'
    WHEN ${ua} ILIKE '%iPad%'          THEN 'iPad'
    WHEN ${ua} ILIKE '%Android%'       THEN 'Android (modèle non déclaré)'
    WHEN ${ua} IS NULL OR ${ua} = ''   THEN '—'
    ELSE 'Ordinateur'
  END`
}

/**
 * La gamme, deduite de DEUX signaux mesurables et d'aucun nom :
 *
 *  · la GENERATION materielle — `iPhoneN,M` : N ordonne le materiel de facon
 *    fiable, meme sans savoir comment Apple l'a baptise ;
 *  · la RESOLUTION que l'appareil declare lui-meme — un grand ecran est un
 *    modele Max/Pro, un petit ecran un modele d'entree ou ancien.
 *
 * C'est ce couple qui approche le pouvoir d'achat, et c'est lui qui sert a
 * decider — bien plus qu'un numero de modele.
 */
export function gammeAppareilSql(s = 's'): string {
  const ua = `${s}."userAgent"`
  const gen = `NULLIF((regexp_match(${ua}, 'iPhone([0-9]+),'))[1], '')::int`
  const larg = `NULLIF((regexp_match(${ua}, 'scale=[0-9.]+; ([0-9]+)x'))[1], '')::int`
  return `CASE
    WHEN ${ua} IS NULL OR ${ua} = '' THEN '—'
    -- iPhone : la generation situe dans le temps, la largeur situe dans la gamme.
    WHEN ${gen} IS NOT NULL AND ${gen} >= 17 AND COALESCE(${larg}, 0) >= 1280 THEN 'iPhone récent · grand écran'
    WHEN ${gen} IS NOT NULL AND ${gen} >= 17                                  THEN 'iPhone récent'
    WHEN ${gen} IS NOT NULL AND ${gen} >= 14                                  THEN 'iPhone intermédiaire'
    WHEN ${gen} IS NOT NULL                                                   THEN 'iPhone ancien'
    -- Samsung : la serie EST la gamme. S = haut, A = milieu/entree, J/M = entree.
    WHEN ${ua} ~ 'SM-S[0-9]' THEN 'Samsung haut de gamme (S)'
    WHEN ${ua} ~ 'SM-N[0-9]' THEN 'Samsung haut de gamme (Note)'
    WHEN ${ua} ~ 'SM-A[0-9]' THEN 'Samsung milieu de gamme (A)'
    -- Guillemets SIMPLES : en SQL les doubles designent une COLONNE. Ecrit
    -- avec des doubles, Postgres cherchait une colonne « Samsung entrée de
    -- gamme » et toute la route rendait 500 — invisible au typage, invisible
    -- au build, visible seulement en appelant.
    WHEN ${ua} ~ 'SM-[JM][0-9]' THEN 'Samsung entrée de gamme'
    WHEN ${ua} ~* 'Pixel [0-9]+' THEN 'Google Pixel'
    WHEN ${ua} ILIKE '%iPhone%'  THEN 'iPhone (gamme non déclarée)'
    WHEN ${ua} ILIKE '%Android%' THEN 'Android (gamme non déclarée)'
    ELSE 'Ordinateur'
  END`
}

/** Les canaux qui consomment du budget publicitaire — pour rapprocher ROAS et depense. */
export const PAID_CHANNELS = ['Instagram Ads', 'Facebook Ads', 'TikTok Ads'] as const
export function isPaidChannel(c: string): boolean {
  return c.startsWith('Pub ') || (PAID_CHANNELS as readonly string[]).includes(c)
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. LES TAUX — un pourcentage sans effectif est une opinion

   64 commandes sur 30 jours, decoupees par ville, canal, appareil et heure. Un
   « 67 % de refus » calcule sur 3 commandes n'est pas un constat, c'est du
   hasard mis en forme. On ne masque rien : sous le seuil, on affiche l'effectif
   brut et on dit pourquoi on ne conclut pas.

   Seuil a 30 : en-dessous, l'intervalle de confiance d'une proportion depasse
   ±18 points, ce qui rend toute comparaison entre deux lignes sans objet.
   ───────────────────────────────────────────────────────────────────────────── */

export const MIN_OBS = 30

export type Taux = {
  /** null quand l'effectif ne permet pas de conclure — l'UI doit alors montrer `n`. */
  pct: number | null
  /** Numerateur (ex. commandes livrees). */
  n: number
  /** Denominateur (ex. commandes passees) — c'est LUI qui porte la fiabilite. */
  d: number
  fiable: boolean
}

export function taux(n: number, d: number, min = MIN_OBS): Taux {
  const fiable = d >= min
  return { pct: d > 0 && fiable ? (n / d) * 100 : null, n, d, fiable }
}

/** Demi-intervalle de confiance a 95 % d'une proportion, en points de %. */
export function margeErreur(n: number, d: number): number | null {
  if (d <= 0) return null
  const p = n / d
  return 1.96 * Math.sqrt((p * (1 - p)) / d) * 100
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. LA MATURITE — un taux de livraison recent n'est pas definitif

   Le delai median entre commande et livraison est de 1,4 jour (moyenne 2,0,
   maximum 10). Les commandes des derniers jours d'une periode sont donc encore
   en vol : leur taux de livraison ne peut que monter. Afficher « 77 % » sans le
   dire fait passer un chiffre provisoire pour un resultat.
   ───────────────────────────────────────────────────────────────────────────── */

export type Maturite = {
  enVol: number
  total: number
  /** Part des commandes de la periode dont le sort est connu. */
  pctResolu: number
  /** true des qu'une commande de la periode n'est ni livree ni annulee. */
  provisoire: boolean
}

export function maturite(total: number, enVol: number): Maturite {
  return {
    enVol,
    total,
    pctResolu: total > 0 ? ((total - enVol) / total) * 100 : 100,
    provisoire: enVol > 0,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. LA DECOMPOSITION DE L'ECART — nommer le responsable

   C'est la piece qui manquait, et celle qu'un analyste livre en premier. La
   marge nette d'une boutique en paiement a la livraison est un produit :

       marge nette = commandes x taux de livraison x marge par commande − pub

   Savoir que la marge a baisse de 900 MAD ne dit rien. Savoir que le volume a
   apporte +1 940, que la livraison a coute −620, la marge unitaire +390 et la
   publicite −397 designe l'endroit ou agir.

   Methode : decomposition sequentielle. On fait varier un facteur a la fois, en
   figeant les precedents a leur valeur nouvelle et les suivants a l'ancienne.
   La somme des effets reconstitue EXACTEMENT l'ecart — c'est verifiable, et
   c'est verifie (test 3 du plan) :

       (C₁−C₀)·L₀·M₀ + C₁·(L₁−L₀)·M₀ + C₁·L₁·(M₁−M₀) = C₁L₁M₁ − C₀L₀M₀

   L'ordre choisi (volume, puis livraison, puis marge unitaire) n'est pas neutre
   — c'est une propriete connue de ce type de decomposition. On commence par le
   volume parce que c'est le levier le plus direct : on l'achete avec le budget
   publicitaire.
   ───────────────────────────────────────────────────────────────────────────── */

export type EtatMarge = {
  /** Commandes PASSEES sur la periode. */
  commandes: number
  /** Commandes livrees. */
  livrees: number
  /** Marge de contribution totale des commandes livrees (avant publicite). */
  marge: number
  /** Depense publicitaire, toutes plateformes. */
  pub: number
}

export type Facteur = {
  cle: 'volume' | 'livraison' | 'margeUnitaire' | 'pub'
  label: string
  /** Effet sur la marge nette, en dirhams. Signe. */
  effet: number
  /** De quoi a quoi, deja mis en forme pour l'affichage. */
  de: string
  a: string
}

export type Decomposition = {
  depart: number
  arrivee: number
  ecart: number
  facteurs: Facteur[]
  /** Doit rester nul au centime pres — sinon la decomposition est fausse. */
  residu: number
  /** false quand la periode precedente est vide : aucun ecart n'a de sens. */
  exploitable: boolean
}

const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
const pctf = (n: number) => `${n.toFixed(1).replace('.', ',')} %`

export function decomposeMargin(cur: EtatMarge, prev: EtatMarge): Decomposition {
  const tauxLiv = (e: EtatMarge) => (e.commandes > 0 ? e.livrees / e.commandes : 0)
  const margeUnit = (e: EtatMarge) => (e.livrees > 0 ? e.marge / e.livrees : 0)

  const C0 = prev.commandes, C1 = cur.commandes
  const L0 = tauxLiv(prev), L1 = tauxLiv(cur)
  const M0 = margeUnit(prev), M1 = margeUnit(cur)
  const P0 = prev.pub, P1 = cur.pub

  const depart = C0 * L0 * M0 - P0
  const arrivee = C1 * L1 * M1 - P1

  const facteurs: Facteur[] = [
    {
      cle: 'volume', label: 'Volume de commandes',
      effet: (C1 - C0) * L0 * M0,
      de: `${nf(C0)} cmd`, a: `${nf(C1)} cmd`,
    },
    {
      cle: 'livraison', label: 'Taux de livraison',
      effet: C1 * (L1 - L0) * M0,
      de: pctf(L0 * 100), a: pctf(L1 * 100),
    },
    {
      cle: 'margeUnitaire', label: 'Marge par commande',
      effet: C1 * L1 * (M1 - M0),
      de: `${nf(M0)} MAD`, a: `${nf(M1)} MAD`,
    },
    {
      cle: 'pub', label: 'Dépense publicitaire',
      effet: -(P1 - P0),
      de: `${nf(P0)} MAD`, a: `${nf(P1)} MAD`,
    },
  ]

  const somme = facteurs.reduce((s, f) => s + f.effet, 0)
  return {
    depart, arrivee,
    ecart: arrivee - depart,
    facteurs,
    residu: arrivee - depart - somme,
    // Sans periode precedente exploitable, tout l'ecart s'ecrase sur le volume
    // et la figure raconterait n'importe quoi.
    exploitable: C0 > 0 && prev.livrees > 0,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. LES SEGMENTS — 100 % de couverture, 0 % d'exploitation

   `_device`, `_locale`, `_source` et `_city` sont presents sur 100 % des 42 134
   evenements des 30 derniers jours. Aucune carte ne les utilisait. Le premier
   constat qu'ils font apparaitre : l'arabe fait 90 sessions et ZERO commande,
   contre 1,36 % de conversion en francais. Un segment entier a l'arret, jamais
   visible.
   ───────────────────────────────────────────────────────────────────────────── */

export type SegmentKey = 'device' | 'locale' | 'source'

export type Segment = {
  device?: string
  locale?: string
  source?: string
}

/** Clause SQL sur "AnalyticsEvent".props — chaine vide quand aucun filtre. */
export function segmentEventFilter(seg: Segment, alias = 'e'): string {
  const parts: string[] = []
  // Valeurs bornees a une liste blanche : elles viennent de l'URL et sont
  // interpolees dans le SQL (pas de parametre possible dans un fragment reutilise).
  const ok = (v: string) => /^[a-z0-9_-]{1,20}$/i.test(v)
  if (seg.device && ok(seg.device)) parts.push(`${alias}.props->>'_device' = '${seg.device}'`)
  if (seg.locale && ok(seg.locale)) parts.push(`${alias}.props->>'_locale' = '${seg.locale}'`)
  if (seg.source && ok(seg.source)) parts.push(`${alias}.props->>'_source' = '${seg.source}'`)
  return parts.length ? ` AND ${parts.join(' AND ')}` : ''
}

/** Le meme filtre, exprime sur "AnalyticsSession" (device et source y sont des colonnes). */
export function segmentSessionFilter(seg: Segment, alias = 's'): string {
  const parts: string[] = []
  const ok = (v: string) => /^[a-z0-9_-]{1,20}$/i.test(v)
  if (seg.device && ok(seg.device)) parts.push(`LOWER(COALESCE(${alias}."device",'')) = '${seg.device}'`)
  if (seg.source && ok(seg.source)) parts.push(`LOWER(COALESCE(${alias}."utmSource",'')) = '${seg.source}'`)
  return parts.length ? ` AND ${parts.join(' AND ')}` : ''
}

export function parseSegment(sp: URLSearchParams): Segment {
  const pick = (k: string) => {
    const v = sp.get(k)
    return v && /^[a-z0-9_-]{1,20}$/i.test(v) ? v.toLowerCase() : undefined
  }
  return { device: pick('device'), locale: pick('locale'), source: pick('source') }
}

export function segmentIsEmpty(seg: Segment): boolean {
  return !seg.device && !seg.locale && !seg.source
}
