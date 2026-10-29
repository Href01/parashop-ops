/**
 * D'OÙ VIENT UNE COMMANDE SAISIE À LA MAIN — la question que le site ne peut pas poser.
 *
 * Sur 30 jours, 6 commandes Instagram « DM » (3 270 MAD) sont le premier canal en
 * nombre de commandes, et rien ne dit si ces clientes sont venues d'une publicité,
 * d'une publication, ou d'une amie. Le tableau d'acquisition affichait donc
 * « Net après publicité : −3 276 MAD » en ignorant peut-être la moitié de ce que la
 * publicité rapporte : une pub Instagram qui envoie vers les messages n'ouvre aucune
 * session sur le site.
 *
 * On ne peut pas le deviner. On le DEMANDE, au moment de saisir la commande, avec
 * quatre réponses possibles et une option « non renseignée » : mieux vaut un « je ne
 * sais pas » honnête qu'une origine inventée.
 *
 * Stocké dans `Order."sourcePayload"->>'origine'` (colonne JSON existante) : pas de migration.
 * Fichier SANS import : le formulaire (client) et le SQL (serveur) le partagent.
 */

export const ORIGINES_COMMANDE = [
  { cle: 'pub', label: 'Une publicité (Instagram / Facebook)' },
  { cle: 'publication', label: 'Une publication ou une story' },
  { cle: 'recommandation', label: 'Recommandation / bouche à oreille' },
  { cle: 'cliente', label: 'Déjà cliente' },
  { cle: 'autre', label: 'Autre' },
] as const

export type OrigineCommande = (typeof ORIGINES_COMMANDE)[number]['cle']

/** Les clés, en tuple non vide : `z.enum` l'exige. */
export const CLES_ORIGINE = ORIGINES_COMMANDE.map((o) => o.cle) as [OrigineCommande, ...OrigineCommande[]]

/** Les canaux de vente pour lesquels la question a un sens (une commande saisie après une conversation). */
export const CANAUX_AVEC_ORIGINE = ['Instagram', 'WhatsApp', 'TikTok', 'Phone', 'Manual'] as const

export function demandeOrigine(canal: string): boolean {
  return (CANAUX_AVEC_ORIGINE as readonly string[]).includes(canal)
}

export function estOrigineCommande(v: unknown): v is OrigineCommande {
  return typeof v === 'string' && (CLES_ORIGINE as readonly string[]).includes(v)
}
