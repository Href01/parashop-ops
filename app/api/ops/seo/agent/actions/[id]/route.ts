import { getOpsSession } from '@/lib/auth'
import { annulerAction, appliquerAction, majAction } from '@/lib/seo/agent'
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

/**
 * Appliquer le changement que l'agent a prepare (titre Google ou question de
 * FAQ d'une fiche), ou l'annuler. Corps : { operation: 'appliquer' | 'annuler' }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!sameOrigin(request)) return Response.json({ error: 'Origine invalide.' }, { status: 403, headers: PRIVATE_HEADERS })
  const id = Number((await params).id)
  const { operation } = await request.json().catch(() => ({}))
  if (!Number.isInteger(id) || !['appliquer', 'annuler'].includes(operation))
    return Response.json({ error: 'Requête invalide' }, { status: 400, headers: PRIVATE_HEADERS })
  try {
    const r = operation === 'appliquer' ? await appliquerAction(id) : await annulerAction(id)
    return Response.json(r, { headers: PRIVATE_HEADERS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Échec' }, { status: 409, headers: PRIVATE_HEADERS })
  }
}
