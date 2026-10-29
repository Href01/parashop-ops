/**
 * LES REGLES DU TRAFIC AUTOMATISE — ecrites ici, importees partout.
 *
 * Ce fichier n'importe RIEN : `metrics.ts` (filtres des rapports) et
 * `automated.ts` (page Sessions) en dependent tous les deux, et l'un importe
 * deja l'autre. Sans ce point d'ancrage, la regle se serait dupliquee — et elle
 * l'etait : la page Sessions ecartait ~190 sessions de robots (relecture des
 * annonces Google, rendus Meta, hebergeurs) que l'Acquisition, l'Engagement et
 * la Conversion comptaient encore comme des visites (5 418 contre ~5 250 sur
 * 30 jours), parce que `AnalyticsSession."isBot"` n'est jamais vrai pour eux.
 */

export const VILLES_HEBERGEUR = [
  'Prineville', 'Forest City', 'Luleå', 'Clonee', 'Council Bluffs', 'Boardman', 'The Dalles',
  'Ashburn', 'Frankfurt am Main', 'Singapore', 'Fort Worth', 'Gallatin', 'Atlanta', 'Charneca',
  'Dublin', 'Santa Clara', 'Des Moines', 'Lenoir', 'Altoona', 'Henrico', 'Quincy', 'Moncks Corner',
  'Katy', 'New York City', 'London',
]

/**
 * Fragments d'agent utilisateur (regex POSIX, insensible a la casse).
 *
 * `\\y` = la limite de mot de PostgreSQL. Dans une chaine TypeScript, `'\y'`
 * s'ecrit « y » : l'ancienne entree `'\ybot\y'` valait donc « ybooty » et ne
 * correspondait a aucun robot.
 */
export const AGENTS_AUTOMATISES = [
  'google-adwords', 'adsbot', 'inspectiontool', 'mediapartners', 'facebookexternalhit',
  'meta-externalagent', 'facebot', 'lighthouse', 'headlesschrome', 'crawler', 'spider',
  'python-requests', '\\ybot\\y',
]

export const DUREE_MAX_VISITE_AUTOMATISEE_S = 120

const litteral = (v: string) => `'${v.replace(/'/g, "''")}'`

/**
 * Vrai pour une session qui ressemble a un robot, d'apres ses seules colonnes :
 * agent connu, OU hors Maroc depuis une ville d'hebergeur en 2 minutes ou moins.
 * Ne dit RIEN du panier ni de la commande : c'est l'appelant qui protege.
 */
export function robotSessionSql(s: string): string {
  const villes = VILLES_HEBERGEUR.map(litteral).join(', ')
  const agents = AGENTS_AUTOMATISES.join('|')
  return `(
    COALESCE(${s}."userAgent", '') ~* '${agents}'
    OR (COALESCE(${s}.country, '') <> 'MA'
        AND ${s}.city IN (${villes})
        AND COALESCE(EXTRACT(EPOCH FROM (${s}."lastSeenAt" - ${s}."firstSeenAt")), 0) <= ${DUREE_MAX_VISITE_AUTOMATISEE_S})
  )`
}

/** Une session qui a mis au panier ou commande n'est JAMAIS ecartee. */
export function sessionSansAchatSql(s: string): string {
  return `(
    NOT EXISTS (
      SELECT 1 FROM "AnalyticsEvent" ea
      WHERE ea."sessionId" = ${s}."sessionId"
        AND ea.name IN ('PURCHASE_SUCCESS', 'ORDER_CREATED', 'PRODUCT_ADD_TO_CART')
    )
    AND NOT EXISTS (SELECT 1 FROM "Order" oa WHERE oa."sessionId" = ${s}."sessionId")
  )`
}
