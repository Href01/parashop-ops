import { getOpsSession } from '@/lib/auth'
import { creerDemande, ecran, suivreRequete, type Genre } from '@/lib/seo/agent'
import { PRIVATE_HEADERS, sameOrigin } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'

/** L'ecran « Concurrence » : tout ce que l'agent a trouve, et la file des demandes. */
export async function GET() {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  try {
    return Response.json(await ecran(), { headers: PRIVATE_HEADERS })
  } catch {
    return Response.json(
      { error: 'Les données de l’agent sont indisponibles (migration 044 appliquée ?).' },
      { status: 503, headers: PRIVATE_HEADERS })
  }
}

/**
 * Deux gestes depuis l'ecran :
 *   { demande: { cible, genre } }            → une analyse, traitee au prochain passage de l'agent
 *   { suivi: { requete, grappe, actif } }    → ajouter / retirer une requete du releve quotidien
 */
export async function POST(request: Request) {
  const session = await getOpsSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!sameOrigin(request)) return Response.json({ error: 'Origine invalide.' }, { status: 403, headers: PRIVATE_HEADERS })
  const body = await request.json().catch(() => ({}))
  try {
    if (body?.demande) {
      const genre = body.demande.genre as Genre
      if (!['requete', 'grappe', 'tout'].includes(genre)) throw new Error('Type d’analyse invalide.')
      const d = await creerDemande(String(body.demande.cible || ''), genre, session.user?.email ?? null)
      return Response.json({ demande: d }, { headers: PRIVATE_HEADERS })
    }
    if (body?.suivi) {
      const s = await suivreRequete(String(body.suivi.requete || ''), String(body.suivi.grappe || ''), body.suivi.actif !== false)
      return Response.json({ suivi: s }, { headers: PRIVATE_HEADERS })
    }
    return Response.json({ error: 'Rien à faire.' }, { status: 400, headers: PRIVATE_HEADERS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400, headers: PRIVATE_HEADERS })
  }
}
