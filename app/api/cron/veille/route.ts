import { veille } from '@/lib/veille'
import { telegramConfigure } from '@/lib/telegram'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Toutes les 5 minutes : commandes, annulations, paniers a rappeler, codes non recus, sante du site → Telegram. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!telegramConfigure()) return Response.json({ skipped: 'Telegram non configuré' }, { headers: PRIVATE_HEADERS })
  try {
    return Response.json(await veille(), { headers: PRIVATE_HEADERS })
  } catch (e) {
    console.error('[veille]', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Veille impossible' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
