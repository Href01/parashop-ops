/**
 * UN POST BOOSTÉ N'ENVOIE PAS DE VISITES SUR LE SITE.
 *
 * Meta nomme automatiquement « Publication Instagram : … » (ou « Instagram post: … »)
 * la campagne créée par le bouton « Booster ». Ses « clics » sont des interactions avec
 * le post — et les ventes passent par les messages (DM), saisies à la main au canal
 * Instagram, pas par le site.
 *
 * Le 27-28/10/2026, seul un post booste diffusait (la campagne de ventes vers le site
 * etait arretee) : 258 « clics » pour 0 session Instagram. Lu comme clics → visites,
 * cela ressemblait à une perte de données ; ce n'en était pas une.
 */
const POST_BOOSTE = /^\s*(publication|post)\s+(instagram|facebook)\b|^\s*(instagram|facebook)\s+(post|publication)\b/i

export function estPostBooste(nomCampagne: string | null | undefined): boolean {
  return POST_BOOSTE.test(String(nomCampagne || ''))
}

/**
 * Le nom affiché dans un tableau : la nature de la campagne se lit sans ouvrir de légende.
 * L'étiquette est EN TÊTE : ces noms sont longs, la colonne les tronque par la fin.
 */
export function libelleCampagne(nom: string): string {
  return estPostBooste(nom) ? `Post boosté · ${nom}` : nom
}

export const NOTE_POST_BOOSTE =
  'Post boosté : ses « clics » sont d\'abord des interactions avec le post, pas des visites du site. ' +
  'Les ventes passent surtout par les messages (DM, commandes saisies au canal Instagram) : peu de visites, voire aucune, est normal.'
