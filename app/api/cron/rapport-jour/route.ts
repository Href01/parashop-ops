import { envoyerRapport } from '@/lib/rapport-jour'
import { telegramConfigure } from '@/lib/telegram'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Chaque soir a 21 h (heure du Maroc) : le rapport de la journee → Telegram. */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!telegramConfigure()) return Response.json({ skipped: 'Telegram non configuré' }, { headers: PRIVATE_HEADERS })
  try {
    return Response.json(await envoyerRapport(), { headers: PRIVATE_HEADERS })
  } catch (e) {
    console.error('[rapport-jour]', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Rapport impossible' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}
