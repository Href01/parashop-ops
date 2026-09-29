import { contexte, echecDemande, publierRapport, reclamerDemande } from '@/lib/ads/agent'
import { synchroniserPubsMeta } from '@/lib/ads/meta-sync'
import { genererImage, lireImage, poserImageDepuisUrl, supprimerImage } from '@/lib/ads/images'
import { poserClipDepuisUrl } from '@/lib/ads/clips'
import { proposerDirection, contexteDirection, enregistrerDirection, modifierPlan, terminerDirection } from '@/lib/ads/direction'
import { genererVoix, type LangueVoix } from '@/lib/ads/voix'
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
 *   POST …/machine/image     → le visuel d'une creation, ou d'une option / carte / plan (optionId) — OpenAI, plafonne
 *
 * Le directeur artistique (routine a part) :
 *   POST …/machine/demande { direction: true } → reserve la plus ancienne demande « direction »
 *   POST …/machine/direction-contexte { id }   → brief, creation, vrais produits (photo + detouree), pubs qui marchent
 *   POST …/machine/direction                   → livre les options / cartes / plans (valides, puis enregistres)
 *   POST …/machine/option { id, …champs du plan, note? } → retouche un plan (memes regles que la livraison), note un controle
 *   POST …/machine/voix { optionId, langue }   → la voix off d'un plan (OpenAI, ASMR)
 *   POST …/machine/image-supprimee { id }      → retire un visuel rate
 *   POST …/machine/fichier { url }             → une image du Cloudinary de Shine, en base64 (si le cloud ne le joint pas)
 *   POST …/machine/termine { id, resultat }    → clot la direction avec son mot de fin
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
        return Response.json(await synchroniserPubsMeta(Number(body?.jours) || 30), { headers: PRIVATE_HEADERS })
      case 'demande':
        return Response.json({ demande: await reclamerDemande(body?.direction === true) }, { headers: PRIVATE_HEADERS })
      case 'contexte':
        return Response.json(await contexte(), { headers: PRIVATE_HEADERS })
      case 'rapport':
        return Response.json(await publierRapport(body), { headers: PRIVATE_HEADERS })
      // Une image faite par un modele d'image Higgsfield (connecteur de Claude) : posee dans le plan.
      case 'image-url':
        return Response.json({ image: await poserImageDepuisUrl({ optionId: Number(body?.optionId), url: String(body?.url || ''), source: body?.source, modele: body?.modele, credits: body?.credits, par: 'agent' }) }, { headers: PRIVATE_HEADERS })
      case 'image':
        if (Number.isInteger(body?.optionId)) return Response.json({ image: await genererImage({ optionId: body.optionId, qualite: body.qualite, par: 'agent' }) }, { headers: PRIVATE_HEADERS })
        if (!Number.isInteger(body?.creatifId)) return Response.json({ error: 'creatifId ou optionId requis' }, { status: 400, headers: PRIVATE_HEADERS })
        return Response.json({ image: await genererImage({ creatifId: body.creatifId, format: body.format as FormatImage, qualite: body.qualite, precision: body.precision, par: 'agent' }) }, { headers: PRIVATE_HEADERS })
      // Un clip genere hors du BOS (Higgsfield via le connecteur MCP de Claude) : copie et pose dans le plan.
      case 'clip-url':
        return Response.json({ clip: await poserClipDepuisUrl({ optionId: Number(body?.optionId), url: String(body?.url || ''), source: body?.source, modele: body?.modele, credits: body?.credits, par: 'agent' }) }, { headers: PRIVATE_HEADERS })
      // Avant de creer : la proposition (ou la reponse) a Achraf ; la demande attend sa validation.
      case 'proposer':
        return Response.json(await proposerDirection(Number(body?.id), String(body?.texte || ''), body?.palier, body?.pieces), { headers: PRIVATE_HEADERS })
      case 'direction-contexte':
        return Response.json(await contexteDirection(Number(body?.id)), { headers: PRIVATE_HEADERS })
      case 'direction':
        return Response.json(await enregistrerDirection(body), { headers: PRIVATE_HEADERS })
      case 'option':
        return Response.json({ option: await modifierPlan(Number(body?.id), body ?? {}) }, { headers: PRIVATE_HEADERS })
      case 'voix':
        return Response.json(await genererVoix(Number(body?.optionId), body?.langue as LangueVoix), { headers: PRIVATE_HEADERS })
      case 'image-supprimee':
        return Response.json(await supprimerImage(Number(body?.id)), { headers: PRIVATE_HEADERS })
      case 'fichier':
        return Response.json(await lireImage(String(body?.url || '')), { headers: PRIVATE_HEADERS })
      case 'termine':
        return Response.json(await terminerDirection(Number(body?.id), String(body?.resultat || '')), { headers: PRIVATE_HEADERS })
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
