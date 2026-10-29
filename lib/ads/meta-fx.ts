/**
 * Constantes et conversion de devise partagees par tout ce qui parle a l'API
 * Marketing de Meta (synchro des campagnes, rentabilite par emplacement).
 * Le compte publicitaire facture dans sa devise ; toute la BOS est en dirhams.
 */

const VERSION = (process.env.META_GRAPH_VERSION || 'v21.0').replace(/^\/+|\/+$/g, '')
export const META_GRAPH = `https://graph.facebook.com/${VERSION}`

// Approximate fallbacks if the live FX lookup fails (rates drift slowly).
const FX_FALLBACK: Record<string, number> = { USD: 10, EUR: 10.8, GBP: 12.6, MAD: 1 }

/**
 * Conversion rate from the ad account's billing currency to MAD.
 * Priority: META_FX_TO_MAD env override → live rate (open.er-api.com, no key)
 * → approximate fallback → 1 (no conversion).
 */
export async function fxToMad(account: string, token: string): Promise<number> {
  const override = Number(process.env.META_FX_TO_MAD)
  if (Number.isFinite(override) && override > 0) return override
  try {
    const acc = await fetch(`${META_GRAPH}/${account}?fields=currency&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const accJson = await acc.json()
    const currency = (accJson?.currency || 'MAD').toUpperCase()
    if (currency === 'MAD') return 1
    try {
      const fxRes = await fetch(`https://open.er-api.com/v6/latest/${currency}`, { cache: 'no-store' })
      const fxJson = await fxRes.json()
      const rate = Number(fxJson?.rates?.MAD)
      if (Number.isFinite(rate) && rate > 0) return rate
    } catch { /* fall through */ }
    return FX_FALLBACK[currency] || 1
  } catch {
    return 1
  }
}
