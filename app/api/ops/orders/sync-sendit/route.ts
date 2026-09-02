import { NextResponse } from 'next/server'
import { getOpsSession } from '@/lib/auth'
import { runSenditSync } from '@/lib/sendit-orchestrator'

// Manual "Sync Sendit" button. Same cost-aware orchestrator runs automatically
// via the Vercel cron at /api/cron/sync-sendit.
export async function POST() {
  try {
    const session = await getOpsSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await runSenditSync({ trigger: 'manual', force: true })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error: unknown) {
    console.error('Sync Sendit error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Sendit statuses', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
