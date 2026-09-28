import { getOpsSession } from '@/lib/auth'
import { PERIODES, creerDemande, ecran, ecranStudio, majTextesCreatif, enregistrerStrategie, majAction, majCreatif, rapport, type GenreAds } from '@/lib/ads/agent'
import { synchroniserPubsMeta } from '@/lib/ads/meta-sync'
import { choisirImage, genererImage, supprimerImage, type Qualite } from '@/lib/ads/images'
import { detailPub } from '@/lib/ads/series'
import { demanderDirection, demanderRetouche, deplacerPlan, dupliquerPlan, modifierPlan, supprimerPlan, supprimerSerie } from '@/lib/ads/direction'
import { genererVoix, type LangueVoix } from '@/lib/ads/voix'
import { ajouterLecon, basculerLecon } from '@/lib/ads/apprentissage'
import { animerPlan, clipsDuPlan, estimerClip, poserClipDepuisUrl, signatureClip, suivreClip } from '@/lib/ads/clips'
import type { CleModeleVideo } from '@/lib/ads/clips-model'
import type { FormatImage } from '@/lib/ads/creatif-model'
import { PRIVATE_HEADERS, sameOrigin } from '@/lib/seo/http'

export const dynamic = 'force-dynamic'
// Un visuel OpenAI peut prendre jusqu'a deux minutes, plus l'envoi a Cloudinary.
export const maxDuration = 300

/** L'ecran « Agent Meta Ads » : verite, strategie, pubs, actions, creatifs ; ?rapport=<id> pour un rapport complet. */
export async function GET(request: Request) {
  if (!(await getOpsSession())) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const url = new URL(request.url)
  try {
    const adId = url.searchParams.get('pub')
    if (adId) {
      const d = /^\d{5,30}$/.test(adId) ? await detailPub(adId) : null
      return d ? Response.json(d, { headers: PRIVATE_HEADERS }) : Response.json({ error: 'Pub introuvable' }, { status: 404, headers: PRIVATE_HEADERS })
    }
    const id = Number(url.searchParams.get('rapport'))
    if (id) {
      const r = await rapport(id)
      return r ? Response.json(r, { headers: PRIVATE_HEADERS }) : Response.json({ error: 'Rapport introuvable' }, { status: 404, headers: PRIVATE_HEADERS })
    }
    if (url.searchParams.get('vue') === 'studio') return Response.json(await ecranStudio(), { headers: PRIVATE_HEADERS })
    const jours = (PERIODES as readonly number[]).includes(Number(url.searchParams.get('jours'))) ? Number(url.searchParams.get('jours')) : 30
    return Response.json(await ecran(jours), { headers: PRIVATE_HEADERS })
  } catch (e) {
    console.error('[ads/agent GET]', e)
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
 *   { image: { creatifId, format, qualite?, precision? } } → genere un visuel (OpenAI, photo produit en reference)
 *   { image: { optionId, qualite? } }    → genere le visuel d'une option / carte / plan (consigne ecrite par Claude)
 *   { direction: { type, nombre, format, styles, qualite, brief, creatifId? | produitIds? } } → brief au directeur artistique
 *   { option: { id, …champs du plan } } → retouche a la main (memes regles que la livraison de Claude)
 *   { planDuplique: id } / { planSupprime: id } / { planDeplace: { id, sens: -1 | 1 } } / { serieSupprimee: { creatifId, serie } }
 *   { retouche: { optionId, note } } → « refais ce plan », demande au directeur artistique
 *   { voix: { optionId, langue } } → la voix off du plan (OpenAI, ASMR)
 *   { imageChoisie: id } / { imageSupprimee: id }
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
    if (body?.image) {
      const i = body.image
      return Response.json({ image: await genererImage(i.optionId
        ? { optionId: Number(i.optionId), qualite: i.qualite as Qualite, par }
        : { creatifId: Number(i.creatifId), format: i.format as FormatImage, qualite: i.qualite as Qualite, precision: typeof i.precision === 'string' ? i.precision : undefined, par }) }, { headers: PRIVATE_HEADERS })
    }
    if (body?.direction) return Response.json(await demanderDirection(body.direction, par), { headers: PRIVATE_HEADERS })
    if (body?.option) return Response.json({ option: await modifierPlan(Number(body.option.id), body.option) }, { headers: PRIVATE_HEADERS })
    // Un clip video : le navigateur l'envoie a Cloudinary avec cette signature (dossier impose).
    if (body?.clipSignature) return Response.json(signatureClip(), { headers: PRIVATE_HEADERS })
    // Higgsfield : estimer, lancer, suivre l'animation de l'image de depart d'un plan.
    if (body?.clipEstimation) return Response.json(await estimerClip(Number(body.clipEstimation.optionId), body.clipEstimation.modele as CleModeleVideo, Number(body.clipEstimation.duree)), { headers: PRIVATE_HEADERS })
    if (body?.clipIA) return Response.json({ generation: await animerPlan({ optionId: Number(body.clipIA.optionId), modele: body.clipIA.modele as CleModeleVideo, duree: Number(body.clipIA.duree) || undefined, par }) }, { headers: PRIVATE_HEADERS })
    if (body?.clipSuivi) return Response.json({ generation: await suivreClip(Number(body.clipSuivi.id)) }, { headers: PRIVATE_HEADERS })
    if (body?.clipUrl) return Response.json({ clip: await poserClipDepuisUrl({ optionId: Number(body.clipUrl.optionId), url: String(body.clipUrl.url || ''), source: body.clipUrl.source, par }) }, { headers: PRIVATE_HEADERS })
    if (body?.clipsDuPlan) return Response.json({ generations: await clipsDuPlan(Number(body.clipsDuPlan.optionId)) }, { headers: PRIVATE_HEADERS })
    // Ce que le directeur artistique doit retenir : relu avant chaque direction.
    if (body?.lecon) return Response.json({ lecon: await ajouterLecon(body.lecon, par) }, { headers: PRIVATE_HEADERS })
    if (body?.leconActive) return Response.json({ lecon: await basculerLecon(Number(body.leconActive.id), Boolean(body.leconActive.active)) }, { headers: PRIVATE_HEADERS })
    if (body?.creatifTextes) return Response.json({ creatif: await majTextesCreatif(Number(body.creatifTextes.id), body.creatifTextes) }, { headers: PRIVATE_HEADERS })
    if (body?.planDuplique) return Response.json(await dupliquerPlan(Number(body.planDuplique)), { headers: PRIVATE_HEADERS })
    if (body?.planSupprime) return Response.json(await supprimerPlan(Number(body.planSupprime)), { headers: PRIVATE_HEADERS })
    if (body?.planDeplace) return Response.json(await deplacerPlan(Number(body.planDeplace.id), body.planDeplace.sens === -1 ? -1 : 1), { headers: PRIVATE_HEADERS })
    if (body?.retouche) return Response.json(await demanderRetouche({ optionId: Number(body.retouche.optionId), note: String(body.retouche.note || '') }, par), { headers: PRIVATE_HEADERS })
    if (body?.voix) return Response.json(await genererVoix(Number(body.voix.optionId), body.voix.langue as LangueVoix), { headers: PRIVATE_HEADERS })
    if (body?.serieSupprimee) return Response.json(await supprimerSerie(Number(body.serieSupprimee.creatifId), Number(body.serieSupprimee.serie)), { headers: PRIVATE_HEADERS })
    if (body?.imageChoisie) return Response.json(await choisirImage(Number(body.imageChoisie)), { headers: PRIVATE_HEADERS })
    if (body?.imageSupprimee) return Response.json(await supprimerImage(Number(body.imageSupprimee)), { headers: PRIVATE_HEADERS })
    return Response.json({ error: 'Rien à faire.' }, { status: 400, headers: PRIVATE_HEADERS })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 400, headers: PRIVATE_HEADERS })
  }
}
