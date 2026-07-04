import { NextResponse } from 'next/server'
import { syncSenditStatuses } from '@/lib/sendit-sync'

/**
 * Vercel Cron: keep Sendit delivery statuses fresh automatically.
 * Previously the sync only ran when a founder clicked "Sync Sendit", so statuses
 * went stale between clicks. This runs it on a schedule (see vercel.json).
 */
export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this header from the CRON_SECRET env var).
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncSenditStatuses()
    console.log(`[Cron] Sendit sync: checked ${result.checked}, updated ${result.updated.length}, failed ${result.failed.length}`)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[Cron] Sendit sync error:', error)
    return NextResponse.json({ error: error?.message || 'sync failed' }, { status: 500 })
  }
}
