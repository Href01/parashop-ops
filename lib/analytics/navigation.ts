const isSeo = (path: string) =>
  path === '/analytics/seo' || path.startsWith('/analytics/seo/')

/**
 * Les paramètres qui portent un DÉTAIL propre à une page (la campagne dont on regarde les sessions) ne voyagent
 * pas d'un onglet à l'autre : changer de module doit revenir à la vue d'ensemble de ce module, pas la filtrer
 * par une campagne que ses chiffres ne savent pas appliquer.
 */
const PARAMS_LOCAUX = ['campagne', 'vue'] as const

export function analyticsModuleHref(from: string, to: string, search: string) {
  // Google and first-party analytics use different device/country values and
  // date semantics. Never carry their segments across that boundary.
  if (isSeo(from) !== isSeo(to) || !search) return to
  const params = new URLSearchParams(search.replace(/^\?/, ''))
  for (const cle of PARAMS_LOCAUX) params.delete(cle)
  const reste = params.toString()
  return reste ? `${to}?${reste}` : to
}
