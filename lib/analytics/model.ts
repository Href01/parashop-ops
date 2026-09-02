/**
 * LE MODELE SEMANTIQUE — dimensions et mesures definies UNE fois.
 *
 * C'est l'idee que Looker apporte, et le defaut de structure principal du
 * tableau de bord : chaque carte reecrivait son propre SQL. Un fichier de
 * 1 489 lignes contenait TROIS cartographies de canal differentes, dont une
 * fausse — on divisait 2 287 MAD de depense Meta par un tableau ou Meta
 * n'apparaissait meme pas. Ici une definition corrigee l'est partout, et une
 * nouvelle vue est une ligne de configuration, pas une requete de plus.
 *
 * ── LA PORTEE : l'idee qu'on oubliait ──────────────────────────────────────
 *
 * Un meme fait donne trois nombres differents selon ce qu'on compte :
 *
 *   « ajouts panier »  = 408 evenements
 *                      = 210 sessions qui en ont fait au moins un
 *                      = N personnes distinctes
 *
 * Les trois sont justes. Les melanger ne l'est pas — et la page les melangeait.
 * Chaque mesure declare donc sa portee, et l'interface l'affiche.
 */

import {
  acquisitionChannelSql, sessionChannelSql, modeleAppareilSql, gammeAppareilSql,
  basisDateExpr, basisStatusFilter, BOT_FILTER_CLAUSE, SESSION_BOT_FILTER_CLAUSE,
  MIN_OBS, TZ,
  type MoneyBasis,
} from './metrics'

/* ─────────────────────────────────────────────────────────────────────────────
   PORTEES
   ───────────────────────────────────────────────────────────────────────────── */

export type Portee = 'evenement' | 'session' | 'personne'

export const PORTEE_LABEL: Record<Portee, string> = {
  evenement: 'événements',
  session: 'sessions',
  personne: 'personnes',
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA SOURCE : sur quelle table une mesure se calcule.

   On ne peut pas joindre naivement les evenements et les commandes : 61 % des
   commandes ne passent JAMAIS par le site (DM Instagram et WhatsApp saisis a la
   main). Une requete qui partirait des sessions perdrait donc les deux tiers du
   chiffre d'affaires. Chaque mesure dit d'ou elle vient, et le moteur groupe par
   source avant de recoller les resultats sur la dimension.
   ───────────────────────────────────────────────────────────────────────────── */

export type Source = 'evenements' | 'commandes' | 'pages' | 'sessions' | 'pub'

const langueSessionSql = (s = 's') => `CASE
  WHEN COALESCE(${s}."landingUrl", '') ~ '(^|/)ar(/|$)' THEN 'ar'
  ELSE 'fr'
END`

const idProduitEvenement = `COALESCE(NULLIF(e.props->>'productId', ''), NULLIF(e.props->>'id', ''))`

/* ─────────────────────────────────────────────────────────────────────────────
   DIMENSIONS
   ───────────────────────────────────────────────────────────────────────────── */

export type Dimension = {
  cle: string
  label: string
  /** Ce que la dimension veut dire, en francais simple. Affiche au survol. */
  definition: string
  /** Expression SQL, par source. Une dimension absente d'une source y est ignoree. */
  sql: Partial<Record<Source, string>>
  /** Ordre d'affichage impose (heures, jours) plutot que par valeur. */
  ordreSql?: string
}

export const DIMENSIONS: Record<string, Dimension> = {
  canal: {
    cle: 'canal',
    label: "Canal d'acquisition",
    definition:
      "D'où vient la commande. Les publicités sont lues dans les paramètres utm ; " +
      "les commandes saisies à la main portent leur origine (DM Instagram, WhatsApp).",
    /* `pages` ouvre le croisement canal x TRAFIC, qui n'existait pas : la
       dimension ne savait classer qu'une commande, donc Acquisition ne pouvait
       montrer que des commandes. Les deux expressions partagent leurs regles
       (voir `reglesUtm`) — c'est ce qui rend « sessions par canal » et
       « commandes par canal » divisibles l'une par l'autre. */
    sql: {
      commandes: acquisitionChannelSql('o', 's'),
      pages: sessionChannelSql('s'),
      sessions: sessionChannelSql('s'),
      evenements: sessionChannelSql('s'),
    },
  },
  appareil: {
    cle: 'appareil',
    label: 'Appareil',
    definition: 'Mobile ou ordinateur, tel que déclaré par le navigateur.',
    sql: {
      evenements: `COALESCE(NULLIF(e.props->>'_device', ''), NULLIF(s."device", ''), '—')`,
      pages: `COALESCE(s."device", '—')`,
      commandes: `COALESCE(s."device", '—')`,
      sessions: `COALESCE(s."device", '—')`,
    },
  },
  modeleAppareil: {
    cle: 'modeleAppareil',
    label: 'Modèle',
    definition:
      "Le modèle exact, quand l'appareil le déclare. Le navigateur intégré d'Instagram donne " +
      "l'identifiant matériel Apple (iPhone18,2) ; Android donne sa référence (SM-A155F). " +
      "Safari en direct ne le donne JAMAIS, et Chrome Android l'a supprimé de son côté : " +
      "c'est pourquoi une partie du trafic reste « non déclaré ». " +
      "Attention : l'identifiant Apple n'est PAS le nom commercial — il court en avance " +
      "d'environ deux générations (iPhone10,2 est un appareil de 2017).",
    sql: {
      pages: modeleAppareilSql('s'), commandes: modeleAppareilSql('s'),
      sessions: modeleAppareilSql('s'), evenements: modeleAppareilSql('s'),
    },
  },
  gammeAppareil: {
    cle: 'gammeAppareil',
    label: "Gamme d'appareil",
    definition:
      "Le niveau de l'appareil, déduit de sa génération et de la taille de son écran — " +
      "jamais d'un nom commercial, qu'on ne peut pas établir de façon sûre pour les modèles " +
      "récents. C'est un indice de pouvoir d'achat : croisée avec le panier moyen, cette " +
      "dimension dit à quel prix ton audience achète réellement.",
    sql: {
      pages: gammeAppareilSql('s'), commandes: gammeAppareilSql('s'),
      sessions: gammeAppareilSql('s'), evenements: gammeAppareilSql('s'),
    },
  },
  langue: {
    cle: 'langue',
    label: 'Langue',
    definition: "La langue d'affichage choisie : français ou arabe.",
    sql: {
      evenements: `COALESCE(NULLIF(split_part(e.props->>'_locale', '-', 1), ''), ${langueSessionSql('s')})`,
      pages: `CASE WHEN COALESCE("PageView".url, '') ~ '(^|/)ar(/|$)' THEN 'ar' ELSE ${langueSessionSql('s')} END`,
      commandes: langueSessionSql('s'),
      sessions: langueSessionSql('s'),
    },
  },
  ville: {
    cle: 'ville',
    label: 'Ville',
    definition: 'Ville de livraison pour les commandes, ville détectée pour les visites.',
    sql: {
      commandes: `COALESCE(NULLIF(TRIM(o."deliveryCity"), ''), '—')`,
      evenements: `COALESCE(NULLIF(e.props->>'_city', ''), NULLIF(s.city, ''), '—')`,
      pages: `COALESCE(NULLIF("PageView".city, ''), NULLIF(s.city, ''), '—')`,
      sessions: `COALESCE(NULLIF(s.city, ''), '—')`,
    },
  },
  page: {
    cle: 'page',
    label: 'Page',
    definition: "Le chemin de la page, sans les paramètres d'URL.",
    sql: {
      evenements: `COALESCE(NULLIF(split_part(e.path, '?', 1), ''), '—')`,
      pages: `COALESCE(NULLIF(split_part("PageView".url, '?', 1), ''), '—')`,
    },
  },
  produit: {
    cle: 'produit',
    label: 'Produit',
    definition: 'Le produit concerné par l\'événement ou la ligne de commande.',
    sql: { evenements: `COALESCE(NULLIF(TRIM(p.name), ''), NULLIF(TRIM(e.props->>'name'), ''), '—')` },
  },
  marque: {
    cle: 'marque',
    label: 'Marque',
    definition: 'La marque du produit.',
    sql: { evenements: `COALESCE(NULLIF(TRIM(p.brand), ''), NULLIF(TRIM(e.props->>'brand'), ''), '—')` },
  },
  categorie: {
    cle: 'categorie',
    label: 'Catégorie',
    definition: 'La catégorie du produit.',
    sql: { evenements: `COALESCE(NULLIF(TRIM(p.category), ''), NULLIF(TRIM(e.props->>'category'), ''), '—')` },
  },
  plateforme: {
    cle: 'plateforme',
    label: 'Plateforme publicitaire',
    definition: 'La régie qui facture : Meta, TikTok, Google.',
    sql: { pub: `INITCAP(a.platform)` },
  },
  statut: {
    cle: 'statut',
    label: 'Statut de commande',
    definition: 'Où en est la commande : confirmée, livrée, annulée.',
    sql: { commandes: `o.status` },
  },
  jour: {
    cle: 'jour',
    label: 'Jour',
    definition: 'Le jour, en heure du Maroc.',
    sql: {
      commandes: `to_char((o."createdAt" AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`,
      evenements: `to_char((e."createdAt" AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`,
      pages: `to_char(("PageView"."createdAt" AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`,
      sessions: `to_char((s."firstSeenAt" AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD')`,
    },
    ordreSql: '1 ASC',
  },
  heure: {
    cle: 'heure',
    label: 'Heure',
    definition: "L'heure de la journée, en heure du Maroc.",
    sql: {
      commandes: `lpad(EXTRACT(hour FROM (o."createdAt" AT TIME ZONE '${TZ}'))::text, 2, '0') || ' h'`,
      evenements: `lpad(EXTRACT(hour FROM (e."createdAt" AT TIME ZONE '${TZ}'))::text, 2, '0') || ' h'`,
      pages: `lpad(EXTRACT(hour FROM ("PageView"."createdAt" AT TIME ZONE '${TZ}'))::text, 2, '0') || ' h'`,
      sessions: `lpad(EXTRACT(hour FROM (s."firstSeenAt" AT TIME ZONE '${TZ}'))::text, 2, '0') || ' h'`,
    },
    ordreSql: '1 ASC',
  },
}

/* ─────────────────────────────────────────────────────────────────────────────
   MESURES
   ───────────────────────────────────────────────────────────────────────────── */

export type Format = 'entier' | 'mad' | 'pourcent' | 'decimal'

export type Mesure = {
  cle: string
  label: string
  definition: string
  source: Source
  portee: Portee
  format: Format
  /** true = plus haut vaut mieux. Sert a colorer une variation, jamais a decider. */
  hausseEstBonne: boolean
  /** Agregat SQL. `null` = mesure derivee, calculee apres coup (cf. DERIVEES). */
  sql: string | null
  /** Sous ce nombre d'observations, l'interface montre l'effectif, pas le taux. */
  seuil?: number
}

export const MESURES: Record<string, Mesure> = {
  /* ── Trafic ─────────────────────────────────────────────────────────────── */
  sessions: {
    cle: 'sessions', label: 'Sessions', source: 'sessions', portee: 'session',
    definition: 'Nombre de visites distinctes, robots écartés.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT s."sessionId")`,
  },
  pagesVues: {
    cle: 'pagesVues', label: 'Pages vues', source: 'pages', portee: 'evenement',
    definition: 'Nombre total de pages affichées.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*)`,
  },

  /* ── Comportement ───────────────────────────────────────────────────────── */
  vuesProduit: {
    cle: 'vuesProduit', label: 'Fiches produit vues', source: 'evenements', portee: 'evenement',
    definition: "Ouvertures d'une fiche produit.",
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE e.name = 'PRODUCT_VIEW_DETAIL')`,
  },
  sessionsAvecVue: {
    cle: 'sessionsAvecVue', label: 'Sessions avec fiche vue', source: 'evenements', portee: 'session',
    definition: 'Visites ayant ouvert au moins une fiche produit.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'PRODUCT_VIEW_DETAIL')`,
  },
  ajoutsPanier: {
    cle: 'ajoutsPanier', label: 'Ajouts au panier', source: 'evenements', portee: 'evenement',
    definition: 'Nombre de fois qu\'un produit a été mis au panier.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE e.name = 'PRODUCT_ADD_TO_CART')`,
  },
  sessionsAvecPanier: {
    cle: 'sessionsAvecPanier', label: 'Sessions avec ajout', source: 'evenements', portee: 'session',
    definition: 'Visites ayant mis au moins un produit au panier.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'PRODUCT_ADD_TO_CART')`,
  },
  impressions: {
    cle: 'impressions', label: 'Impressions en rayon', source: 'evenements', portee: 'evenement',
    definition: 'Nombre de fois qu\'un produit est apparu dans une étagère.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE e.name = 'PRODUCT_IMPRESSION')`,
  },
  clicsRayon: {
    cle: 'clicsRayon', label: 'Clics en rayon', source: 'evenements', portee: 'evenement',
    definition: 'Clics sur un produit depuis une étagère.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE e.name = 'PRODUCT_CLICK')`,
  },

  /* ── Commandes et argent ────────────────────────────────────────────────── */
  commandes: {
    cle: 'commandes', label: 'Commandes passées', source: 'commandes', portee: 'evenement',
    definition: 'Toutes les commandes de la période, quel que soit leur sort ensuite.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*)`,
  },
  livrees: {
    cle: 'livrees', label: 'Commandes livrées', source: 'commandes', portee: 'evenement',
    definition: "Commandes effectivement remises à la cliente. En paiement à la livraison, c'est la seule vente réelle.",
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE o.status = 'DELIVERED')`,
  },
  annulees: {
    cle: 'annulees', label: 'Refusées / annulées', source: 'commandes', portee: 'evenement',
    definition: "Commandes qui n'arriveront pas. Chacune coûte l'aller, le retour et l'emballage.",
    format: 'entier', hausseEstBonne: false,
    sql: `COUNT(*) FILTER (WHERE o.status = 'CANCELLED')`,
  },
  caLivre: {
    cle: 'caLivre', label: 'CA livré', source: 'commandes', portee: 'evenement',
    definition: "Produits vendus et livrés, hors frais de livraison — même définition que le back-office.",
    format: 'mad', hausseEstBonne: true,
    sql: `COALESCE(SUM(COALESCE(o.revenue, o."productsTotal", o.total)) FILTER (WHERE o.status = 'DELIVERED'), 0)`,
  },
  marge: {
    cle: 'marge', label: 'Marge', source: 'commandes', portee: 'evenement',
    definition: "Marge de contribution des commandes livrées, avant publicité. Nette du coût d'achat, de la livraison réelle et des retours.",
    format: 'mad', hausseEstBonne: true,
    sql: `COALESCE(SUM(COALESCE(o."finalProfit", o."estimatedProfit", 0)) FILTER (WHERE o.status = 'DELIVERED'), 0)`,
  },
  clientes: {
    cle: 'clientes', label: 'Clientes', source: 'commandes', portee: 'personne',
    definition: 'Personnes distinctes ayant été livrées, identifiées par leur numéro.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT NULLIF(RIGHT(REGEXP_REPLACE(TRIM(o."deliveryPhone"), '[^0-9]', '', 'g'), 9), '')) FILTER (WHERE o.status = 'DELIVERED')`,
  },

  /* ── Engagement ─────────────────────────────────────────────────────────── */
  clics: {
    cle: 'clics', label: 'Clics', source: 'evenements', portee: 'evenement',
    definition: 'Clics sur un élément interactif de la page.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(*) FILTER (WHERE e.name = 'CLICK_UI')`,
  },
  lectureDebut: {
    cle: 'lectureDebut', label: 'Ont commencé à lire', source: 'evenements', portee: 'session',
    definition: 'Sessions ayant fait défiler au moins un quart de la page.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'SCROLL_DEPTH' AND (e.props->>'pct')::int >= 25)`,
  },
  lectureFin: {
    cle: 'lectureFin', label: 'Ont lu jusqu\'au bout', source: 'evenements', portee: 'session',
    definition: 'Sessions ayant atteint le bas de la page.',
    format: 'entier', hausseEstBonne: true,
    sql: `COUNT(DISTINCT e."sessionId") FILTER (WHERE e.name = 'SCROLL_DEPTH' AND (e.props->>'pct')::int >= 100)`,
  },

  /* ── Qualite : ce qui casse, et ce que ca coute ─────────────────────────── */
  erreurs: {
    cle: 'erreurs', label: 'Frictions', source: 'evenements', portee: 'evenement',
    definition:
      "Tout ce qui empêche d'avancer : échec de commande, validation refusée, code promo rejeté, " +
      "recherche sans résultat, échec d'envoi du code SMS.",
    format: 'entier', hausseEstBonne: false,
    sql: `COUNT(*) FILTER (WHERE e.name IN ('PURCHASE_FAILED','CHECKOUT_VALIDATION_FAILED','PROMO_CODE_FAILED','SEARCH_ZERO_RESULTS','CHECKOUT_CART_EMPTY','OTP_SEND_FAILED','OTP_DELIVERY_FAILED','OTP_INVALID','RAGE_CLICK','DEAD_CLICK','CHECKOUT_FIELD_ERROR','JS_ERROR'))`,
  },
  clicsRage: {
    cle: 'clicsRage', label: 'Clics de rage', source: 'evenements', portee: 'evenement',
    definition:
      'Trois clics ou plus sur le même élément en moins d\'une seconde — la signature ' +
      'd\'un bouton qui ne répond pas.',
    format: 'entier', hausseEstBonne: false,
    sql: `COUNT(*) FILTER (WHERE e.name = 'RAGE_CLICK')`,
  },
  clicsMorts: {
    cle: 'clicsMorts', label: 'Clics morts', source: 'evenements', portee: 'evenement',
    definition: "Un clic sur un bouton qui n'a rien changé dans la seconde qui a suivi.",
    format: 'entier', hausseEstBonne: false,
    sql: `COUNT(*) FILTER (WHERE e.name = 'DEAD_CLICK')`,
  },
  commandesRefusees: {
    cle: 'commandesRefusees', label: 'Commandes rejetées', source: 'evenements', portee: 'evenement',
    definition:
      "Commandes refusées par le site au dernier pas : prix qui a changé, stock insuffisant, " +
      "erreur serveur. La cliente avait tout rempli — c'est la perte la plus chère du parcours.",
    format: 'entier', hausseEstBonne: false,
    sql: `COUNT(*) FILTER (WHERE e.name = 'PURCHASE_FAILED')`,
  },

  /* ── Publicite ──────────────────────────────────────────────────────────── */
  depensePub: {
    cle: 'depensePub', label: 'Dépense publicitaire', source: 'pub', portee: 'evenement',
    definition:
      "Ce qui a été dépensé en publicité sur la période, toutes plateformes. " +
      "Attention : la dépense n'est PAS ventilable par canal d'acquisition — les régies " +
      "facturent par plateforme, pas par utm. Ne la lisez donc jamais ligne par ligne.",
    format: 'mad', hausseEstBonne: false,
    sql: `COALESCE(SUM(a.spend), 0)`,
  },
  clicsPub: {
    cle: 'clicsPub', label: 'Clics publicitaires', source: 'pub', portee: 'evenement',
    definition: 'Clics facturés par les régies publicitaires.',
    format: 'entier', hausseEstBonne: true,
    sql: `COALESCE(SUM(a.clicks), 0)`,
  },
  impressionsPub: {
    cle: 'impressionsPub', label: 'Impressions publicitaires', source: 'pub', portee: 'evenement',
    definition: 'Affichages facturés par les régies.',
    format: 'entier', hausseEstBonne: true,
    sql: `COALESCE(SUM(a.impressions), 0)`,
  },

  /* ── Derivees : calculees a partir des precedentes, jamais en SQL ───────── */
  tauxLivraison: {
    cle: 'tauxLivraison', label: 'Taux de livraison', source: 'commandes', portee: 'evenement',
    definition: 'Part des commandes passées qui arrivent réellement.',
    format: 'pourcent', hausseEstBonne: true, sql: null, seuil: MIN_OBS,
  },
  panierMoyen: {
    cle: 'panierMoyen', label: 'Panier moyen', source: 'commandes', portee: 'evenement',
    definition: 'CA livré divisé par le nombre de commandes livrées.',
    format: 'mad', hausseEstBonne: true, sql: null,
  },
  margeParCommande: {
    cle: 'margeParCommande', label: 'Marge par commande', source: 'commandes', portee: 'evenement',
    definition: 'Marge divisée par le nombre de commandes livrées.',
    format: 'mad', hausseEstBonne: true, sql: null,
  },
  tauxMarge: {
    cle: 'tauxMarge', label: 'Taux de marge', source: 'commandes', portee: 'evenement',
    definition: 'Part du CA livré qui reste en marge.',
    format: 'pourcent', hausseEstBonne: true, sql: null,
  },
  tauxLecture: {
    cle: 'tauxLecture', label: 'Lu jusqu\'au bout', source: 'evenements', portee: 'session',
    definition: "Part des sessions qui ont commencé à lire et sont allées jusqu'en bas.",
    format: 'pourcent', hausseEstBonne: true, sql: null, seuil: MIN_OBS,
  },
  ctrRayon: {
    cle: 'ctrRayon', label: 'Clics / impressions', source: 'evenements', portee: 'evenement',
    definition: "Part des affichages en rayon qui déclenchent un clic. Mesure l'attrait du visuel et du prix.",
    format: 'pourcent', hausseEstBonne: true, sql: null, seuil: 100,
  },
  tauxAjout: {
    cle: 'tauxAjout', label: 'Fiche → panier', source: 'evenements', portee: 'session',
    definition: "Part des sessions ayant vu une fiche qui ont ajouté un produit au panier.",
    format: 'pourcent', hausseEstBonne: true, sql: null, seuil: MIN_OBS,
  },
}

/** Comment chaque mesure derivee se calcule, une fois les agregats obtenus. */
export const DERIVEES: Record<string, { depend: string[]; calc: (r: Record<string, number>) => number | null }> = {
  tauxLivraison: {
    depend: ['livrees', 'commandes'],
    calc: (r) => (r.commandes > 0 ? (r.livrees / r.commandes) * 100 : null),
  },
  panierMoyen: {
    depend: ['caLivre', 'livrees'],
    calc: (r) => (r.livrees > 0 ? r.caLivre / r.livrees : null),
  },
  margeParCommande: {
    depend: ['marge', 'livrees'],
    calc: (r) => (r.livrees > 0 ? r.marge / r.livrees : null),
  },
  tauxMarge: {
    depend: ['marge', 'caLivre'],
    calc: (r) => (r.caLivre > 0 ? (r.marge / r.caLivre) * 100 : null),
  },
  tauxLecture: {
    depend: ['lectureFin', 'lectureDebut'],
    calc: (r) => (r.lectureDebut > 0 ? (r.lectureFin / r.lectureDebut) * 100 : null),
  },
  ctrRayon: {
    depend: ['clicsRayon', 'impressions'],
    calc: (r) => (r.impressions > 0 ? (r.clicsRayon / r.impressions) * 100 : null),
  },
  tauxAjout: {
    depend: ['sessionsAvecPanier', 'sessionsAvecVue'],
    calc: (r) => (r.sessionsAvecVue > 0 ? (r.sessionsAvecPanier / r.sessionsAvecVue) * 100 : null),
  },
}

/** Le denominateur qui porte la fiabilite d'un taux — pas son numerateur. */
export const DENOMINATEUR: Record<string, string> = {
  tauxLivraison: 'commandes',
  tauxLecture: 'lectureDebut',
  ctrRayon: 'impressions',
  tauxAjout: 'sessionsAvecVue',
}

/* ─────────────────────────────────────────────────────────────────────────────
   LE MOTEUR
   ───────────────────────────────────────────────────────────────────────────── */

export type Filtre = { dimension: string; valeurs: string[] }

export type Requete = {
  /** Dimension de groupement. Absente = une seule ligne (le total). */
  dimension?: string
  mesures: string[]
  periode: { debut: string; fin: string }
  /** Periode de comparaison. Chaque ligne portera alors ses valeurs precedentes. */
  comparaison?: { debut: string; fin: string }
  filtres?: Filtre[]
  basis?: MoneyBasis
  limite?: number
}

export type Cellule = {
  valeur: number | null
  /** Valeur sur la periode de comparaison, si demandee. */
  precedent?: number | null
  /** Effectif du denominateur, pour les taux. */
  n?: number
  /** false quand l'effectif ne permet pas de conclure. */
  fiable?: boolean
}

export type Ligne = { cle: string; mesures: Record<string, Cellule> }

/** Nettoie une valeur venue de l'URL avant interpolation dans du SQL. */
function echappe(v: string): string {
  return v.replace(/'/g, "''").slice(0, 120)
}

/** Les mesures a agreger reellement (les derivees se calculent apres). */
export function mesuresBrutes(cles: string[]): string[] {
  const out = new Set<string>()
  for (const c of cles) {
    const m = MESURES[c]
    if (!m) continue
    if (m.sql) out.add(c)
    else for (const d of DERIVEES[c]?.depend ?? []) out.add(d)
    const den = DENOMINATEUR[c]
    if (den) out.add(den)
  }
  return [...out]
}

/** Les sources a interroger pour un jeu de mesures. */
export function sourcesRequises(cles: string[]): Source[] {
  const s = new Set<Source>()
  for (const c of mesuresBrutes(cles)) {
    const m = MESURES[c]
    if (m) s.add(m.source)
  }
  return [...s]
}

/** Refuse explicitement les croisements qui n'ont pas de sens. */
export function problemeCompatibilite(req: Pick<Requete, 'dimension' | 'mesures' | 'filtres'>): string | null {
  const sources = sourcesRequises(req.mesures)
  if (req.dimension) {
    const d = DIMENSIONS[req.dimension]
    const absentes = sources.filter((source) => !d?.sql[source])
    if (absentes.length) {
      return `${d?.label ?? req.dimension} ne peut pas ventiler : ${absentes.join(', ')}`
    }
  }
  for (const filtre of req.filtres ?? []) {
    const d = DIMENSIONS[filtre.dimension]
    const absentes = sources.filter((source) => !d?.sql[source])
    if (absentes.length) {
      return `Le filtre ${d?.label ?? filtre.dimension} ne s'applique pas à : ${absentes.join(', ')}`
    }
  }
  return null
}

/**
 * Construit la requete SQL d'UNE source. Le moteur en execute une par source
 * puis recolle les lignes sur la valeur de dimension — c'est ce qui permet de
 * melanger, dans un meme tableau, des mesures de trafic et des mesures de
 * commande sans jointure abusive.
 */
export function construireSql(
  source: Source,
  req: Requete,
  periode: { debut: string; fin: string },
): { texte: string; params: unknown[] } | null {
  const cles = mesuresBrutes(req.mesures).filter((c) => MESURES[c]?.source === source)
  if (cles.length === 0) return null

  const basis: MoneyBasis = req.basis ?? 'cohorte'
  const dim = req.dimension ? DIMENSIONS[req.dimension] : undefined
  let dimSql = dim?.sql[source]
  if (source === 'commandes' && req.dimension === 'jour') {
    dimSql = `to_char(${basisDateExpr(basis, 'o')}, 'YYYY-MM-DD')`
  }
  if (source === 'commandes' && req.dimension === 'heure') {
    const col = basis === 'cash' ? 'deliveredAt' : 'createdAt'
    dimSql = `lpad(EXTRACT(hour FROM (o."${col}" AT TIME ZONE '${TZ}'))::text, 2, '0') || ' h'`
  }
  if (req.dimension && !dimSql) {
    throw new Error(`Dimension ${req.dimension} incompatible avec la source ${source}`)
  }
  const groupe = dimSql ?? `'(tous)'`

  const select = cles.map((c) => `${MESURES[c].sql} AS "${c}"`).join(',\n           ')
  const filtres = (req.filtres ?? [])
    .map((f) => {
      const d = DIMENSIONS[f.dimension]?.sql[source]
      if (!d || f.valeurs.length === 0) return null
      return `${d} IN (${f.valeurs.map((v) => `'${echappe(v)}'`).join(', ')})`
    })
    .filter(Boolean)
    .join(' AND ')
  const clauseFiltres = filtres ? ` AND ${filtres}` : ''

  let texte: string
  if (source === 'commandes') {
    texte = `
      SELECT ${groupe} AS cle,
             ${select}
      FROM "Order" o
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = o."sessionId"
      WHERE ${basisDateExpr(basis, 'o')} BETWEEN $1::date AND $2::date
        ${basisStatusFilter(basis, 'o')}${clauseFiltres}
      GROUP BY 1`
  } else if (source === 'evenements') {
    texte = `
      SELECT ${groupe} AS cle,
             ${select}
      FROM "AnalyticsEvent" e
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = e."sessionId"
      LEFT JOIN "Product" p ON p.id = CASE
        WHEN ${idProduitEvenement} ~ '^[0-9]+$' THEN ${idProduitEvenement}::int
        ELSE NULL
      END
      WHERE (e."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        ${SESSION_BOT_FILTER_CLAUSE}${clauseFiltres}
      GROUP BY 1`
  } else if (source === 'pub') {
    texte = `
      SELECT ${groupe} AS cle,
             ${select}
      FROM "AdSpendDaily" a
      WHERE a.date BETWEEN $1::date AND $2::date
      GROUP BY 1`
  } else if (source === 'pages') {
    texte = `
      SELECT ${groupe} AS cle,
             ${select}
      FROM "PageView"
      LEFT JOIN "AnalyticsSession" s ON s."sessionId" = "PageView"."sessionId"
      WHERE ("PageView"."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        ${BOT_FILTER_CLAUSE}${clauseFiltres}
      GROUP BY 1`
  } else {
    texte = `
      SELECT ${groupe} AS cle,
             ${select}
      FROM "AnalyticsSession" s
      WHERE (s."firstSeenAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
        ${SESSION_BOT_FILTER_CLAUSE}${clauseFiltres}
      GROUP BY 1`
  }

  const ordre = dim?.ordreSql ?? `2 DESC NULLS LAST`
  texte += `\n      ORDER BY ${dim?.ordreSql ? ordre : `"${cles[0]}"` + ' DESC NULLS LAST'}`
  // Une limite par source peut supprimer une cle qui serait forte dans une
  // autre source avant leur fusion. On ne limite en SQL que les rapports mono-source.
  if (req.limite && sourcesRequises(req.mesures).length === 1) {
    texte += `\n      LIMIT ${Math.min(Math.max(1, req.limite), 500)}`
  }

  return { texte, params: [periode.debut, periode.fin] }
}

/**
 * Assemble les resultats bruts (une entree par source) en lignes finales :
 * calcule les mesures derivees, applique le garde-fou d'effectif, et attache la
 * valeur de comparaison quand elle a ete demandee.
 */
export function assembler(
  req: Requete,
  brutCourant: Record<string, Record<string, number>>,
  brutPrecedent?: Record<string, Record<string, number>>,
): Ligne[] {
  const cles = [...new Set([
    ...Object.keys(brutCourant),
    ...Object.keys(brutPrecedent ?? {}),
  ])]
  const lignes: Ligne[] = []

  for (const cle of cles) {
    const src = brutCourant[cle] ?? {}
    const prev = brutPrecedent?.[cle]
    const mesures: Record<string, Cellule> = {}

    for (const c of req.mesures) {
      const m = MESURES[c]
      if (!m) continue

      const valeurDe = (r: Record<string, number> | undefined): number | null => {
        if (!r) return null
        if (m.sql) return Number(r[c] ?? 0)
        return DERIVEES[c]?.calc(r) ?? null
      }

      const den = DENOMINATEUR[c]
      const n = den ? Number(src[den] ?? 0) : undefined
      // Un taux sur trop peu d'observations n'est pas un constat : on renvoie
      // l'effectif et l'interface montre le rapport brut a la place.
      const fiable = m.seuil == null || n == null ? true : n >= m.seuil
      const brute = valeurDe(src)
      const nPrecedent = den && prev ? Number(prev[den] ?? 0) : undefined
      const precedentFiable = m.seuil == null || nPrecedent == null ? true : nPrecedent >= m.seuil

      mesures[c] = {
        valeur: fiable ? brute : null,
        ...(n != null ? { n, fiable } : {}),
        ...(brutPrecedent ? { precedent: precedentFiable ? valeurDe(prev) : null } : {}),
      }
    }
    lignes.push({ cle, mesures })
  }

  // Tri par la premiere mesure demandee, decroissant — sauf dimension ordonnee.
  const dimOrdonnee = req.dimension ? DIMENSIONS[req.dimension]?.ordreSql : undefined
  if (dimOrdonnee) lignes.sort((a, b) => a.cle.localeCompare(b.cle))
  else {
    const p = req.mesures[0]
    lignes.sort((a, b) => (b.mesures[p]?.valeur ?? -Infinity) - (a.mesures[p]?.valeur ?? -Infinity))
  }
  return req.limite ? lignes.slice(0, req.limite) : lignes
}

/** Mise en forme d'une valeur selon le format declare par sa mesure. */
export function formater(v: number | null, f: Format): string {
  if (v == null) return '—'
  switch (f) {
    case 'mad': return `${Math.round(v).toLocaleString('fr-FR')} MAD`
    case 'pourcent': return `${v.toFixed(1).replace('.', ',')} %`
    case 'decimal': return v.toFixed(2).replace('.', ',')
    default: return Math.round(v).toLocaleString('fr-FR')
  }
}
