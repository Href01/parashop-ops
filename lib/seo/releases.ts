/** Only confirmed production changes, never local drafts or scheduled deploys. */
export const SEO_RELEASES = [
  { day: '2026-09-26', title: 'Catégories marchandes et recherche corrigée', changes: [
    'Huit destinations catégories FR/AR reliées aux bannières de l’accueil.',
    'Pagination, liens internes, métadonnées et sitemap alignés sur le catalogue.',
    'Recherche dirigée vers les résultats, avec correspondance multi-mots et N°/N.',
    'Cinq titres Milk Shake et conseils courts de catégories précisés.',
    'Identité de page, filtres et recherche intégrés au suivi interne des catégories.',
  ], commits: ['126a5bd'] },
  { day: '2026-09-25', title: 'Corrections SEO et parcours Shine', changes: [
    'Anciennes URLs produits redirigées vers les fiches actuelles.',
    'Pagination des marques et de la K-beauty accessible aux moteurs.',
    'Conseils N°3PLUS et comparatifs Olaplex / Milk Shake actualisés.',
    'Visuels, offre d’accueil et navigation K-beauty harmonisés.',
  ], commits: ['48a395e', 'ce85bd8', '1dbdb11', 'f5ce7fa'] },
] as const

/** Exclude deployment day: it mixes old and new versions. This is elapsed
 * finalized time, not a claim that every query received impressions each day. */
export function releaseObservationDays(released: string, latest: string | null | undefined): number {
  if (!latest || !/^\d{4}-\d{2}-\d{2}$/.test(released) || !/^\d{4}-\d{2}-\d{2}$/.test(latest)) return 0
  const elapsed = (Date.parse(latest + 'T00:00:00Z') - Date.parse(released + 'T00:00:00Z')) / 86400000
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed)) : 0
}
