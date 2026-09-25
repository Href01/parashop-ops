import { getOpsSession } from '@/lib/auth'
import { dashboard } from '@/lib/seo/store'
import { parseFilters } from '@/lib/seo/model'
import { PRIVATE_HEADERS } from '@/lib/seo/http'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  if (!(await getOpsSession()))
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: PRIVATE_HEADERS },
    )
  let filters
  try {
    filters = parseFilters(new URL(request.url).searchParams)
  } catch {
    return Response.json(
      { error: 'Filtres invalides.' },
      { status: 400, headers: PRIVATE_HEADERS },
    )
  }
  try {
    return Response.json(await dashboard(filters), { headers: PRIVATE_HEADERS })
  } catch {
    return Response.json(
      {
        error:
          'Les données SEO sont temporairement indisponibles. Aucun résultat ne peut être déduit.',
      },
      { status: 503, headers: PRIVATE_HEADERS },
    )
  }
}
