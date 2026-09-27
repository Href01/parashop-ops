import { contexte, echecDemande, publierRapport, reclamerDemande } from '@/lib/ads/agent'
import { synchroniserPubsMeta } from '@/lib/ads/meta-sync'
import { genererImage } from '@/lib/ads/images'
import type { FormatImage } from '@/lib/ads/creatif-model'
import { PRIVATE_HEADERS, cronAuthorized } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * LES ROUTES DE L'AGENT META ADS (cloud d'Anthropic), authentifiees par
 * ADS_AGENT_TOKEN (a defaut SEO_AGENT_TOKEN : meme environnement cloud).
 *
 *   POST …/machine/synchro   → relit Meta au niveau de chaque pub (lecture seule sur Meta)
 *   POST …/machine/demande   → reserve la plus ancienne demande en attente
 *   POST …/machine/contexte  → strategie, verite (livre vs pub), pubs, produits, memoire
 *   POST …/machine/rapport   → publie un rapport (+ actions, + creatifs)
 *   POST …/machine/echec     → clot une demande impossible
 *   POST …/machine/image     → le visuel d'une creation publiee (OpenAI, photo produit en reference ; plafonne)
 *
 * Rien ici ne modifie Meta ni le site.
 */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!cronAuthorized(request, process.env.ADS_AGENT_TOKEN || process.env.SEO_AGENT_TOKEN))
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const { action } = await params
  const body = await request.json().catch(() => ({}))
  try {
    switch (action) {
      case 'synchro':
        return Response.json(await synchroniserPubsMeta(Math.min(90, Math.max(1, Number(body?.jours) || 30))), { headers: PRIVATE_HEADERS })
      case 'demande':
        return Response.json({ demande: await reclamerDemande() }, { headers: PRIVATE_HEADERS })
      case 'contexte':
        return Response.json(await contexte(), { headers: PRIVATE_HEADERS })
      case 'rapport':
        return Response.json(await publierRapport(body), { headers: PRIVATE_HEADERS })
      case 'image':
        if (!Number.isInteger(body?.creatifId)) return Response.json({ error: 'creatifId requis' }, { status: 400, headers: PRIVATE_HEADERS })
        return Response.json({ image: await genererImage({ creatifId: body.creatifId, format: body.format as FormatImage, qualite: body.qualite, precision: body.precision, par: 'agent' }) }, { headers: PRIVATE_HEADERS })
      case 'echec':
        if (!Number.isInteger(body?.id)) return Response.json({ error: 'id requis' }, { status: 400, headers: PRIVATE_HEADERS })
        await echecDemande(body.id, String(body.erreur || 'Échec sans détail'))
        return Response.json({ ok: true }, { headers: PRIVATE_HEADERS })
      default:
        return Response.json({ error: 'Action inconnue' }, { status: 404, headers: PRIVATE_HEADERS })
    }
  } catch (e) {
    // Une erreur de validation est renvoyee telle quelle : elle dit a l'agent quoi corriger.
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400, headers: PRIVATE_HEADERS })
  }
}
