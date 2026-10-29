import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import { synchroniserPubsGoogle } from '@/lib/ads/google-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * GET  (Vercel Cron, Bearer CRON_SECRET) ou POST (fondateur, depuis le BOS)
 *      /api/ops/ads/sync-google[?days=35][&from=AAAA-MM-JJ]
 * Rapatrie la depense Google Ads par jour et par campagne dans "AdSpendDaily".
 * `from` sert a rattraper l'historique (ex. mars 2026), jamais le cron.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

async function run(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp = req.nextUrl.searchParams
    const days = Number(sp.get('days'))
    const result = await synchroniserPubsGoogle({ days: Number.isFinite(days) && days > 0 ? days : undefined, from: sp.get('from') || undefined })
    if (!result.configured) {
      return NextResponse.json({ configured: false, error: 'Google Ads non configuré (variables GOOGLE_ADS_*).' }, { status: 503 })
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[Ads] sync-google', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Synchro Google impossible' }, { status: 502 })
  }
}

export const GET = run
export const POST = run
