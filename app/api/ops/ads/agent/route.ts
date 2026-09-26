import { getOpsSession } from '@/lib/auth'
import { creerDemande, ecran, enregistrerStrategie, majAction, majCreatif, rapport, type GenreAds } from '@/lib/ads/agent'
import { synchroniserPubsMeta } from '@/lib/ads/meta-sync'
import { PRIVATE_HEADERS, sameOrigin } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** L'ecran « Agent Meta Ads » : verite, strategie, pubs, actions, creatifs ; ?rapport=<id> pour un rapport complet. */
export async function GET(request: Request) {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const url = new URL(request.url)
  try {
    const id = Number(url.searchParams.get('rapport'))
    if (id) {
      const r = await rapport(id)
      return r ? Response.json(r, { headers: PRIVATE_HEADERS }) : Response.json({ error: 'Rapport introuvable' }, { status: 404, headers: PRIVATE_HEADERS })
    }
    const jours = [7, 30, 90].includes(Number(url.searchParams.get('jours'))) ? Number(url.searchParams.get('jours')) : 30
    return Response.json(await ecran(jours), { headers: PRIVATE_HEADERS })
  } catch {
    return Response.json({ error: 'Les données de l’agent sont indisponibles (migration 047 appliquée ?).' }, { status: 503, headers: PRIVATE_HEADERS })
  }
}

/**
 * Les gestes depuis l'ecran :
 *   { demande: { genre, sujet } }        → une demande a l'agent (prochain passage horaire)
 *   { strategie: {…} }                   → nouvelle version de la strategie
 *   { synchro: true }                    → relire Meta maintenant
 *   { action: { id, statut } }           → a_faire / fait / ecarte
 *   { creatif: { id, statut, adId? } }   → idee / validee / produite / en_ligne / ecartee
 */
export async function POST(request: Request) {
  const session = await getOpsSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  if (!sameOrigin(request)) return Response.json({ error: 'Origine invalide.' }, { status: 403, headers: PRIVATE_HEADERS })
  const body = await request.json().catch(() => ({}))
  const par = session.user?.email ?? null
  try {
    if (body?.demande) return Response.json({ demande: await creerDemande(body.demande.genre as GenreAds, String(body.demande.sujet || ''), par) }, { headers: PRIVATE_HEADERS })
    if (body?.strategie) return Response.json({ strategie: await enregistrerStrategie(body.strategie, par) }, { headers: PRIVATE_HEADERS })
    if (body?.synchro) return Response.json({ synchro: await synchroniserPubsMeta(30) }, { headers: PRIVATE_HEADERS })
    if (body?.action) {
      if (!['a_faire', 'fait', 'ecarte'].includes(body.action.statut)) throw new Error('Statut invalide.')
      return Response.json({ action: await majAction(Number(body.action.id), body.action.statut) }, { headers: PRIVATE_HEADERS })
    }
    if (body?.creatif) {
      if (!['idee', 'validee', 'produite', 'en_ligne', 'ecartee'].includes(body.creatif.statut)) throw new Error('Statut invalide.')
      return Response.json({ creatif: await majCreatif(Number(body.creatif.id), body.creatif.statut, body.creatif.adId ?? null) }, { headers: PRIVATE_HEADERS })
    }
    return Response.json({ error: 'Rien à faire.' }, { status: 400, headers: PRIVATE_HEADERS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400, headers: PRIVATE_HEADERS })
  }
}
