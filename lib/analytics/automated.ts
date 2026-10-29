import { TZ } from '@/lib/analytics/metrics'

/**
 * LE TRAFIC AUTOMATISE — des sessions que ce n'est pas une cliente qui a ouvertes.
 *
 * `AnalyticsSession.isBot` ne fait que reflechir la liste de robots connus, qui
 * sont deja ecartes a l'ecriture : sur 15 941 sessions, ZERO est marquee. Restent
 * ceux qu'aucune liste ne nomme — le robot de relecture des annonces Google
 * (« Google-AdWords-Express », Council Bluffs / Atlanta), les rendus de Meta
 * (Prineville, Forest City, Lulea, Clonee) et les hebergeurs (Francfort,
 * Singapour…). Mesure sur 30 jours : ~11 % des sessions, 9 evenements et 23 s en
 * moyenne, contre 26 evenements et 8 minutes pour une visite depuis le Maroc.
 *
 * REGLE (une seule, ecrite ici et nulle part ailleurs) :
 *   automatisee = PAS de panier NI de commande
 *                 ET (agent robot connu
 *                     OU (hors Maroc, ville d'hebergeur, visite de 2 min ou moins))
 *
 * La premiere clause reprend la regle de la couche de mesure : une session qui a
 * mis au panier ou commande n'est JAMAIS ecartee. La duree protege la diaspora
 * (Francfort, Londres, New York sont aussi de vraies villes) : une vraie visite
 * depuis l'etranger dure plus de 2 minutes ou finit au panier.
 *
 * On MARQUE, on ne supprime pas : la page offre « inclure le trafic automatise ».
 */

export const VILLES_HEBERGEUR = [
  'Prineville', 'Forest City', 'Luleå', 'Clonee', 'Council Bluffs', 'Boardman', 'The Dalles',
  'Ashburn', 'Frankfurt am Main', 'Singapore', 'Fort Worth', 'Gallatin', 'Atlanta', 'Charneca',
  'Dublin', 'Santa Clara', 'Des Moines', 'Lenoir', 'Altoona', 'Henrico', 'Quincy', 'Moncks Corner',
  'Katy', 'New York City', 'London',
]

/** Fragments d'agent utilisateur (regex POSIX, insensible a la casse). */
export const AGENTS_AUTOMATISES = [
  'google-adwords', 'adsbot', 'inspectiontool', 'mediapartners', 'facebookexternalhit',
  'meta-externalagent', 'facebot', 'lighthouse', 'headlesschrome', 'crawler', 'spider',
  'python-requests', '\ybot\y',
]

export const DUREE_MAX_VISITE_AUTOMATISEE_S = 120

type Alias = {
  /** Alias de "AnalyticsSession" dans la requete. */
  session: string
  /** Expression SQL : nombre d'ajouts au panier de la session. */
  paniers: string
  /** Expression SQL : duree de la session en secondes. */
  duree: string
  /** Expression SQL : l'id de la commande liee (NULL si aucune). */
  commande: string
}

export function traficAutomatiseSql(a: Alias): string {
  const villes = VILLES_HEBERGEUR.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')
  const agents = AGENTS_AUTOMATISES.join('|')
  return `(
    NOT (COALESCE(${a.paniers}, 0) > 0 OR ${a.commande} IS NOT NULL)
    AND (
      COALESCE(${a.session}."userAgent", '') ~* '${agents}'
      OR (COALESCE(${a.session}.country, '') <> 'MA'
          AND ${a.session}.city IN (${villes})
          AND COALESCE(${a.duree}, 0) <= ${DUREE_MAX_VISITE_AUTOMATISEE_S})
    )
  )`
}

/**
 * FENETRE DE DATES UTILISABLE PAR L'INDEX.
 *
 * `(col AT TIME ZONE tz)::date BETWEEN a AND b` appliquait une fonction a la
 * colonne : la base lisait toute la table (534 ms sur 30 jours, 11 s sur un an).
 * Cette version donne EXACTEMENT les memes lignes avec deux bornes sur la colonne.
 *
 * NOTE — les colonnes « timestamp sans fuseau » sont ecrites en UTC ; l'ancienne
 * expression les relit comme de l'heure du Maroc, d'ou des « jours » de 02 h a 02 h
 * (heure locale). On GARDE ce decoupage a l'identique pour que cette page
 * continue de concorder avec les autres modules ; le corriger est un chantier a
 * part, qui deplacerait des chiffres partout.
 *
 * `p1` et `p2` sont des marqueurs de parametres ($1, $2…), jamais des valeurs.
 */
export function fenetreSql(col: string, p1: string, p2: string): string {
  return `${col} >= (((${p1})::date)::timestamp AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'
      AND ${col} < ((((${p2})::date + 1))::timestamp AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`
}
