import { contexte, echecDemande, publierRapport, reclamerDemande, type Genre } from '@/lib/seo/agent'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * LES ROUTES DE L'AGENT SEO (cloud d'Anthropic), authentifiees par SEO_AGENT_TOKEN.
 *
 *   POST /api/ops/seo/agent/machine/demande   → reserve la plus ancienne demande en attente
 *   POST /api/ops/seo/agent/machine/contexte  → suivi + positions Search Console + releve precedent
 *   POST /api/ops/seo/agent/machine/rapport   → publie un rapport (+ actions, + releves du moteur)
 *   POST /api/ops/seo/agent/machine/echec     → clot une demande que l'agent n'a pas pu traiter
 *
 * Le middleware laisse passer ces chemins avec le bon jeton ; on le reverifie
 * ici en temps constant. Aucune de ces routes ne modifie le site.
 */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!cronAuthorized(request, process.env.SEO_AGENT_TOKEN))
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const { action } = await params
  const body = await request.json().catch(() => ({}))
  try {
    switch (action) {
      case 'demande':
        return Response.json({ demande: await reclamerDemande() }, { headers: PRIVATE_HEADERS })
      case 'contexte': {
        const genre = body?.genre as Genre | undefined
        const filtre = genre && ['requete', 'grappe'].includes(genre) && typeof body.cible === 'string'
          ? { genre, cible: body.cible } : undefined
        return Response.json(await contexte(filtre), { headers: PRIVATE_HEADERS })
      }
      case 'rapport':
        return Response.json(await publierRapport(body), { headers: PRIVATE_HEADERS })
      case 'echec':
        if (!Number.isInteger(body?.id)) return Response.json({ error: 'id requis' }, { status: 400, headers: PRIVATE_HEADERS })
        await echecDemande(body.id, String(body.erreur || 'Échec sans détail'))
        return Response.json({ ok: true }, { headers: PRIVATE_HEADERS })
      default:
        return Response.json({ error: 'Action inconnue' }, { status: 404, headers: PRIVATE_HEADERS })
    }
  } catch (e) {
    // Une erreur de validation est renvoyee telle quelle a l'agent : elle lui dit quoi corriger.
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400, headers: PRIVATE_HEADERS })
  }
}
