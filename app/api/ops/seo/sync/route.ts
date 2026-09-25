import { getOpsSession } from '@/lib/auth'
import { synchronize } from '@/lib/seo/store'
import { SeoError } from '@/lib/seo/google'
import { PRIVATE_HEADERS, sameOrigin } from '@/lib/seo/http'
export const maxDuration = 300
export async function POST(request: Request) {
  if (!(await getOpsSession()))
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: PRIVATE_HEADERS },
    )
  if (!sameOrigin(request))
    return Response.json(
      { error: 'Origine invalide.' },
      { status: 403, headers: PRIVATE_HEADERS },
    )
  const mode = new URL(request.url).searchParams.get('mode')
  if (mode !== null && mode !== 'all' && mode !== 'audit')
    return Response.json(
      { error: 'Mode invalide.' },
      { status: 400, headers: PRIVATE_HEADERS },
    )
  try {
    return Response.json(
      await synchronize(mode === 'audit' ? 'audit' : 'all'),
      { headers: PRIVATE_HEADERS },
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
