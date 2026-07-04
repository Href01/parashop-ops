import { NextResponse } from 'next/server'
import { getOpsSession } from '@/lib/auth'
import { syncSenditStatuses } from '@/lib/sendit-sync'

// Manual "Sync Sendit" button. Same logic runs automatically via the Vercel cron
// at /api/cron/sync-sendit (see lib/sendit-sync.ts).
export async function POST() {
  try {
    const session = await getOpsSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await syncSenditStatuses()
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Sync Sendit error:', error)
    return NextResponse.json(
      { error: 'Failed to sync Sendit statuses', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
