import { synchroniserPubsMeta } from '@/lib/ads/meta-sync'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Chaque matin, avant le brief de l'agent Meta Ads : les 30 derniers jours, pub par pub. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  try {
    return Response.json(await synchroniserPubsMeta(30), { headers: PRIVATE_HEADERS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Synchro impossible' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
