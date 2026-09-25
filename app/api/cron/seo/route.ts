import { synchronize } from '@/lib/seo/store'
import { connectionStatus, SeoError } from '@/lib/seo/google'
import { cronAuthorized, PRIVATE_HEADERS } from '@/lib/seo/http'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: PRIVATE_HEADERS },
    )
  try {
    const connected = connectionStatus().configured
    const result = await synchronize(connected ? 'all' : 'audit')
    return Response.json(
      { ...result, googleConfigured: connected },
      {
        status: result.status === 'failed' ? 503 : 200,
        headers: PRIVATE_HEADERS,
      },
    )
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof SeoError ? e.message : 'Synchronisation indisponible.',
      },
      {
        status: e instanceof SeoError ? e.status : 503,
        headers: PRIVATE_HEADERS,
      },
    )
  }
}
