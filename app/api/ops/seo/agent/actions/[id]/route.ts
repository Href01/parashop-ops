import { getOpsSession } from '@/lib/auth'
import { majAction } from '@/lib/seo/agent'
import { PRIVATE_HEADERS, sameOrigin } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'

/** Cocher une action recommandee : faite, ecartee, ou a refaire. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!sameOrigin(request)) return Response.json({ error: 'Origine invalide.' }, { status: 403, headers: PRIVATE_HEADERS })
  const id = Number((await params).id)
  const { statut } = await request.json().catch(() => ({}))
  if (!Number.isInteger(id) || !['a_faire', 'fait', 'ecarte'].includes(statut))
    return Response.json({ error: 'Requête invalide' }, { status: 400, headers: PRIVATE_HEADERS })
  const r = await majAction(id, statut)
  return r ? Response.json(r, { headers: PRIVATE_HEADERS }) : Response.json({ error: 'Action introuvable' }, { status: 404, headers: PRIVATE_HEADERS })
}
