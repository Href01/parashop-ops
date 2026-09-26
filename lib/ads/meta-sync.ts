import 'server-only'
import pool from '@/lib/db'
import { getMetaToken } from '@/lib/meta-token'
import { actionsParJour, type MetaActions } from './meta-model'

/**
 * META AU NIVEAU DE CHAQUE PUBLICITE — lecture seule sur Meta.
 *
 * La synchro historique (/api/ops/ads/sync-meta) ne garde que les totaux par
 * campagne : impossible de dire QUELLE creation marche, si elle fatigue, ni si
 * elle ramene des messages Instagram. Celle-ci lit, pour chaque pub : depense,
 * portee, clics, vues de page, paniers, achats du pixel, conversations
 * demarrees, vues video ; sa creation (texte, format, vignette) ; sa frequence
 * sur 7 jours ; et la repartition du compte par age, sexe, placement, region.
 *
 * Jeton : celui de la synchro existante (ads_read suffit). Montants convertis
 * dans la devise du BOS (MAD) comme la synchro historique.
 */

const VERSION = (process.env.META_GRAPH_VERSION || 'v21.0').replace(/^\/+|\/+$/g, '')
const GRAPH = `https://graph.facebook.com/${VERSION}`
const FX_SECOURS: Record<string, number> = { USD: 10, EUR: 10.8, GBP: 12.6, MAD: 1 }

type Json = Record<string, unknown>

async function graph(chemin: string, jeton: string): Promise<Json> {
  const url = `${GRAPH}/${chemin}${chemin.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(jeton)}`
  const r = await fetch(url, { cache: 'no-store' })
  const j = (await r.json().catch(() => ({}))) as Json
  if (!r.ok) throw new Error(`Meta : ${(j.error as Json | undefined)?.message || r.status}`)
  return j
}

/** Toutes les pages d'une liste Meta (curseur « next »), avec un plafond de securite. */
async function toutesLesPages(chemin: string, jeton: string, max = 40): Promise<Json[]> {
  const lignes: Json[] = []
  let j = await graph(chemin, jeton)
  for (let i = 0; i < max; i++) {
    lignes.push(...((j.data as Json[]) || []))
    const suivant = (j.paging as Json | undefined)?.next as string | undefined
    if (!suivant) break
    const r = await fetch(suivant, { cache: 'no-store' })
    j = (await r.json()) as Json
    if (!r.ok) break
  }
  return lignes
}

async function tauxVersMad(compte: string, jeton: string): Promise<number> {
  const force = Number(process.env.META_FX_TO_MAD)
  if (Number.isFinite(force) && force > 0) return force
  try {
    const devise = String((await graph(`${compte}?fields=currency`, jeton)).currency || 'MAD').toUpperCase()
    if (devise === 'MAD') return 1
    try {
      const fx = await (await fetch(`https://open.er-api.com/v6/latest/${devise}`, { cache: 'no-store' })).json()
      const taux = Number(fx?.rates?.MAD)
      if (Number.isFinite(taux) && taux > 0) return taux
    } catch { /* secours ci-dessous */ }
    return FX_SECOURS[devise] || 1
  } catch {
    return 1
  }
}

const jour = (d: Date) => d.toISOString().slice(0, 10)
const n = (v: unknown) => Number(v) || 0

export type ResultatSynchro = { configure: boolean; jours: number; pubs: number; lignes: number; repartitions: number; taux: number; erreurs: string[] }

export async function synchroniserPubsMeta(jours = 30): Promise<ResultatSynchro> {
  const jeton = await getMetaToken()
  const brut = process.env.META_AD_ACCOUNT_ID
  if (!jeton || !brut) return { configure: false, jours, pubs: 0, lignes: 0, repartitions: 0, taux: 1, erreurs: ['META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID absent'] }
  const compte = brut.startsWith('act_') ? brut : `act_${brut}`
  const taux = await tauxVersMad(compte, jeton)
  const erreurs: string[] = []
  const fin = new Date(Date.now() - 864e5) // hier : la journee du jour n'est pas close
  const debut = new Date(fin.getTime() - (jours - 1) * 864e5)
  const periode = encodeURIComponent(JSON.stringify({ since: jour(debut), until: jour(fin) }))

  // 1. Une ligne par pub et par jour.
  const quotidien = await toutesLesPages(
    `${compte}/insights?level=ad&time_range=${periode}&time_increment=1&limit=500`
    + `&fields=ad_id,spend,impressions,reach,inline_link_clicks,actions,action_values,video_thruplay_watched_actions`, jeton)
  let lignes = 0
  for (const r of quotidien) {
    if (!r.ad_id || !r.date_start) continue
    const a = actionsParJour(r.actions as MetaActions, r.action_values as MetaActions, r.video_thruplay_watched_actions as MetaActions)
    await pool.query(
      `INSERT INTO "MetaAdDaily" (jour, ad_id, depense, impressions, portee, clics_lien, vues_page, paniers, commandes_initiees, achats, valeur_achats, messages, vues_video_3s, thruplays, engagements, maj_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
       ON CONFLICT (jour, ad_id) DO UPDATE SET depense=EXCLUDED.depense, impressions=EXCLUDED.impressions, portee=EXCLUDED.portee,
         clics_lien=EXCLUDED.clics_lien, vues_page=EXCLUDED.vues_page, paniers=EXCLUDED.paniers, commandes_initiees=EXCLUDED.commandes_initiees,
         achats=EXCLUDED.achats, valeur_achats=EXCLUDED.valeur_achats, messages=EXCLUDED.messages, vues_video_3s=EXCLUDED.vues_video_3s,
         thruplays=EXCLUDED.thruplays, engagements=EXCLUDED.engagements, maj_le=now()`,
      [r.date_start, r.ad_id, n(r.spend) * taux, n(r.impressions), n(r.reach), n(r.inline_link_clicks), a.vuesPage, a.paniers, a.commandesInitiees,
        a.achats, a.valeurAchats * taux, a.messages, a.vuesVideo3s, a.thruplays, a.engagements])
    lignes++
  }

  // 2. La creation et le reglage de chaque pub vue dans la periode (par lots de 50).
  const idsPubs = [...new Set(quotidien.map((r) => String(r.ad_id || '')).filter(Boolean))]
  let pubs = 0
  for (let i = 0; i < idsPubs.length; i += 50) {
    const lot = idsPubs.slice(i, i + 50)
    try {
      const res = await graph(`?ids=${lot.join(',')}&fields=id,name,effective_status,created_time,campaign{id,name,objective,daily_budget},adset{id,name,optimization_goal,daily_budget},creative{object_type,body,title,call_to_action_type,thumbnail_url,instagram_permalink_url}`, jeton)
      for (const id of lot) {
        const p = res[id] as Json | undefined
        if (!p) continue
        const c = (p.campaign || {}) as Json, s = (p.adset || {}) as Json, cr = (p.creative || {}) as Json
        // Les budgets Meta sont en centimes de la devise du compte.
        const budget = n(s.daily_budget) || n(c.daily_budget)
        await pool.query(
          `INSERT INTO "MetaAd" (ad_id, nom, statut, campagne_id, campagne, objectif, adset_id, adset, optimisation, budget_jour, format, texte, titre, cta, vignette, permalien, cree_le, maj_le)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
           ON CONFLICT (ad_id) DO UPDATE SET nom=EXCLUDED.nom, statut=EXCLUDED.statut, campagne_id=EXCLUDED.campagne_id, campagne=EXCLUDED.campagne,
             objectif=EXCLUDED.objectif, adset_id=EXCLUDED.adset_id, adset=EXCLUDED.adset, optimisation=EXCLUDED.optimisation, budget_jour=EXCLUDED.budget_jour,
             format=EXCLUDED.format, texte=EXCLUDED.texte, titre=EXCLUDED.titre, cta=EXCLUDED.cta, vignette=EXCLUDED.vignette, permalien=EXCLUDED.permalien,
             cree_le=EXCLUDED.cree_le, maj_le=now()`,
          [id, p.name ?? null, p.effective_status ?? null, c.id ?? null, c.name ?? null, c.objective ?? null, s.id ?? null, s.name ?? null,
            s.optimization_goal ?? null, budget ? (budget / 100) * taux : null, cr.object_type ?? null, cr.body ?? null, cr.title ?? null,
            cr.call_to_action_type ?? null, cr.thumbnail_url ?? null, cr.instagram_permalink_url ?? null, p.created_time ?? null])
        pubs++
      }
    } catch (e) { erreurs.push(`creations : ${(e as Error).message}`) }
  }

  // 3. Portee et frequence sur 7 jours (non additives : une seule lecture sur la fenetre).
  try {
    const sept = await toutesLesPages(`${compte}/insights?level=ad&date_preset=last_7d&limit=500&fields=ad_id,reach,frequency`, jeton, 10)
    for (const r of sept) {
      await pool.query(`UPDATE "MetaAd" SET portee_7j = $2, frequence_7j = $3 WHERE ad_id = $1`, [r.ad_id, n(r.reach), n(r.frequency)])
    }
  } catch (e) { erreurs.push(`frequence : ${(e as Error).message}`) }

  // 4. Repartition du compte sur 28 jours : a qui la pub parle vraiment.
  let repartitions = 0
  const fin28 = jour(fin)
  for (const [dimension, breakdowns] of [['age', 'age'], ['sexe', 'gender'], ['placement', 'publisher_platform,platform_position'], ['region', 'region']] as const) {
    try {
      const rows = await toutesLesPages(`${compte}/insights?date_preset=last_28d&breakdowns=${breakdowns}&limit=200&fields=spend,impressions,inline_link_clicks,actions`, jeton, 5)
      for (const r of rows) {
        const valeur = breakdowns.split(',').map((b) => String(r[b] ?? '?')).join(' · ')
        const a = actionsParJour(r.actions as MetaActions, undefined, undefined)
        await pool.query(
          `INSERT INTO "MetaBreakdown" (fin, jours, dimension, valeur, depense, impressions, clics_lien, achats, messages, maj_le)
           VALUES ($1, 28, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (fin, jours, dimension, valeur) DO UPDATE SET depense=EXCLUDED.depense, impressions=EXCLUDED.impressions,
             clics_lien=EXCLUDED.clics_lien, achats=EXCLUDED.achats, messages=EXCLUDED.messages, maj_le=now()`,
          [fin28, dimension, valeur, n(r.spend) * taux, n(r.impressions), n(r.inline_link_clicks), a.achats, a.messages])
        repartitions++
      }
    } catch (e) { erreurs.push(`${dimension} : ${(e as Error).message}`) }
  }

  return { configure: true, jours, pubs, lignes, repartitions, taux, erreurs }
}
