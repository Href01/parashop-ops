import { gardeStockGoogle } from '@/lib/ads/google-stock-guard'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Toutes les 30 min : un groupe d'annonces dont les produits sont epuises est mis en pause (jamais relance). ?dry=1 = simulation. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  try {
    const dry = new URL(request.url).searchParams.get('dry') === '1'
    return Response.json(await gardeStockGoogle({ dry }), { headers: PRIVATE_HEADERS })
  } catch (e) {
    console.error('[google-ads-guard]', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Garde impossible' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
