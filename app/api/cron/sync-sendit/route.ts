import { NextResponse } from 'next/server'
import { runSenditSync } from '@/lib/sendit-orchestrator'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Vercel Cron: keep Sendit delivery statuses fresh automatically.
 * Previously the sync only ran when a founder clicked "Sync Sendit", so statuses
 * went stale between clicks. This runs it on a schedule (see vercel.json).
 */
export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this header from the CRON_SECRET env var).
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSenditSync({ trigger: 'cron' })
    console.log(`[Cron] Sendit sync: ${result.status}, ${result.apiCalls} API call(s), ${result.pulled} parcel(s), ${result.ordersSynced} order(s)`)
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error: unknown) {
    console.error('[Cron] Sendit sync error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'sync failed' }, { status: 500 })
  }
}
