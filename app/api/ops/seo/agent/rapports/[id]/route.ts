import { getOpsSession } from '@/lib/auth'
import { rapport } from '@/lib/seo/agent'
import { PRIVATE_HEADERS } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return Response.json({ error: 'id invalide' }, { status: 400, headers: PRIVATE_HEADERS })
  const r = await rapport(id)
  return r ? Response.json(r, { headers: PRIVATE_HEADERS }) : Response.json({ error: 'Rapport introuvable' }, { status: 404, headers: PRIVATE_HEADERS })
}
