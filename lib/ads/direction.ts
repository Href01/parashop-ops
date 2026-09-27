import 'server-only'
import pool from '@/lib/db'
import { performancePubs, strategie } from './agent'
import { verdicts } from './conseils'
import { reveillerDirecteur } from './declencher'
import { BORNES, LivraisonDirection, MOUVEMENTS, STYLES, sujetDemande, validerDemande, verifierLivraison, type DemandeDirection, type Style } from './direction-model'
import { FORMATS_IMAGE } from './creatif-model'
import { urlDetouree } from './reel-model'

/**
 * LE DIRECTEUR ARTISTIQUE, COTE BOS. Claude ecrit les consignes, OpenAI peint.
 *
 * 1. Achraf envoie un brief (options ou carrousel, format, styles, qualite)
 *    → une demande « direction » dans la file de l'agent, et la routine est
 *    reveillee si le declencheur est configure (lib/ads/declencher.ts).
 * 2. La routine Claude reclame la demande, lit son contexte (vraies photos
 *    produit, creation, strategie, pubs qui marchent, directions passees),
 *    regarde les photos, ecrit les options ou les cartes et les livre ici.
 * 3. Elle fait generer chaque visuel (lib/ads/images.ts, option par option),
 *    les regarde, regenere ceux qui sont rates, note son controle, et clot.
 */

type Json = Record<string, unknown>
const texteSeul = (html: string | null) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const MAX_EN_ATTENTE = 3

/** Une photo de fiche a 1024 px en JPEG : ce que Claude regarde avant d'ecrire. */
function photo(url: string | null): string | null {
  if (!url) return null
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  return m ? `${m[1]}c_limit,w_1024,h_1024,f_jpg,q_85/${m[2].replace(/^(?:[a-z]_[^/]*\/)+/, '')}` : url
}

export async function demanderDirection(entree: unknown, par: string | null) {
  const d = validerDemande(entree)
  if (d.creatifId) {
    const c = await pool.query(`SELECT id FROM "AdsCreative" WHERE id = $1`, [d.creatifId])
    if (!c.rowCount) throw new Error('Création introuvable.')
  } else {
    const p = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "Product" WHERE id = ANY($1::int[])`, [d.produitIds])
    if (p.rows[0].n !== d.produitIds!.length) throw new Error('Un des produits choisis n’existe pas.')
  }
  const n = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "AdsAgentRequest" WHERE genre = 'direction' AND statut IN ('en_attente', 'en_cours')`)
  if (n.rows[0].n >= MAX_EN_ATTENTE) throw new Error(`${MAX_EN_ATTENTE} directions sont déjà en cours : attends que le directeur artistique en livre une.`)
  const r = await pool.query(
    `INSERT INTO "AdsAgentRequest" (genre, sujet, demande_par, creatif_id, parametres) VALUES ('direction', $1, $2, $3, $4::jsonb)
     RETURNING id, genre, sujet, statut, demande_le, creatif_id, parametres`,
    [sujetDemande(d), par, d.creatifId ?? null, JSON.stringify(d)])
  const demande = r.rows[0]
  return { demande, lancee: await reveillerDirecteur(demande.id) }
}

type DemandeEnCours = { id: number; genre: string; statut: string; sujet: string; creatif_id: number | null; parametres: DemandeDirection; demande_par: string | null }

async function demandeEnCours(id: number): Promise<DemandeEnCours> {
  const r = await pool.query(`SELECT id, genre, statut, sujet, creatif_id, parametres, demande_par FROM "AdsAgentRequest" WHERE id = $1`, [id])
  const x = r.rows[0]
  if (!x) throw new Error('Demande inconnue.')
  if (x.genre !== 'direction') throw new Error('Ce n’est pas une demande de direction artistique.')
  if (x.statut !== 'en_cours') throw new Error('Cette demande n’est pas en cours : réclame-la d’abord (bos.mjs demande --direction).')
  return { ...x, parametres: validerDemande(x.parametres) as DemandeDirection }
}

/** Tout ce dont Claude a besoin pour diriger : le brief, la creation, les vrais produits, ce qui marche deja. */
export async function contexteDirection(demandeId: number) {
  const dem = await demandeEnCours(demandeId)
  const p = dem.parametres
  const creation = dem.creatif_id
    ? (await pool.query(`SELECT id, angle, format, public, accroche, script, texte_fr, texte_darija, texte_ar, titre, cta, visuel, produit_ids FROM "AdsCreative" WHERE id = $1`, [dem.creatif_id])).rows[0] ?? null
    : null
  const produitIds: number[] = creation ? creation.produit_ids : p.produitIds ?? []
  const [produits, s, pubs, passees] = await Promise.all([
    produitIds.length
      ? pool.query(`SELECT id, name AS nom, brand AS marque, category AS categorie, price AS prix, image, description, benefits,
                           (coalesce(stock, 0) + coalesce("virtualStock", 0)) AS stock_vendable FROM "Product" WHERE id = ANY($1::int[])`, [produitIds])
      : Promise.resolve({ rows: [] as Json[] }),
    strategie(),
    performancePubs(),
    dem.creatif_id
      ? pool.query(`SELECT o.serie, o.carte, o.concept, o.prompt, o.note, (SELECT url FROM "AdsCreativeImage" i WHERE i.option_id = o.id ORDER BY i.choisie DESC, i.cree_le DESC LIMIT 1) AS visuel
                    FROM "AdsCreativeOption" o WHERE o.creatif_id = $1 ORDER BY o.serie DESC, o.carte NULLS FIRST, o.id LIMIT 20`, [dem.creatif_id])
      : Promise.resolve({ rows: [] as Json[] }),
  ])
  const v = verdicts(pubs, s.config.regles.depenseMinAvantVerdict)
  const qui = pubs.filter((x) => v[x.adId]?.verdict === 'gagnante').slice(0, 5)
  return {
    demande: { id: dem.id, sujet: dem.sujet, ...p, stylesSouhaites: p.styles.map((x: string) => STYLES[x as Style]).filter(Boolean) },
    formats: Object.fromEntries(Object.entries(FORMATS_IMAGE).map(([k, f]) => [k, { taille: f.taille, label: f.label }])),
    bornes: BORNES[p.type],
    mouvements: p.type === 'reel' ? MOUVEMENTS : undefined,
    creation,
    produits: (produits.rows as Json[]).map((x) => ({
      id: x.id, nom: x.nom, marque: x.marque, categorie: x.categorie, prix: Number(x.prix), stockVendable: Number(x.stock_vendable),
      photo: photo(x.image as string | null),
      // Ce que le Reel anime : la meme photo, detouree par Cloudinary (fond transparent).
      detouree: urlDetouree(x.image as string | null),
      page: `https://www.shinecosmetics.ma/products/${x.id}`,
      description: texteSeul(x.description as string | null).slice(0, 700),
      bienfaits: (Array.isArray(x.benefits) ? (x.benefits as Json[]) : []).map((b) => String(b.titleFR || b.title || '')).filter(Boolean).slice(0, 6),
    })),
    strategie: { ton: s.config.ton, public: s.config.public, langues: s.config.langues, offres: s.config.offres, produitsExclus: s.config.produitsExclus },
    pubsQuiMarchent: qui.map((x) => ({ nom: x.nom, texte: x.texte, vignette: x.vignette, raison: v[x.adId].raison })),
    directionsPassees: passees.rows,
  }
}

/** Claude livre ses options (ou cartes) : on cree la creation si besoin, on enregistre la serie. */
export async function enregistrerDirection(entree: unknown) {
  const p = LivraisonDirection.safeParse(entree)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · '))
  const l = p.data
  const dem = await demandeEnCours(l.demandeId)
  const d = dem.parametres
  const creationExistante = dem.creatif_id
    ? (await pool.query(`SELECT id, produit_ids FROM "AdsCreative" WHERE id = $1`, [dem.creatif_id])).rows[0]
    : null
  const produitsCreation: number[] = creationExistante ? creationExistante.produit_ids : d.produitIds ?? []
  verifierLivraison(l, d, produitsCreation, Boolean(creationExistante))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let creatifId: number = creationExistante?.id
    if (!creatifId) {
      const c = l.creation!
      const ins = await client.query(
        `INSERT INTO "AdsCreative" (produit_ids, angle, format, public, accroche, texte_fr, texte_darija, texte_ar, titre, cta, visuel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [produitsCreation, c.angle, d.type === 'options' ? 'image' : d.type, c.public || null, c.accroche, c.texteFr || null, c.texteDarija || null,
          c.texteAr || null, c.titre || null, c.cta || null, l.style])
      creatifId = ins.rows[0].id
      await client.query(`UPDATE "AdsAgentRequest" SET creatif_id = $2 WHERE id = $1`, [dem.id, creatifId])
    }
    const serie = (await client.query(`SELECT coalesce(max(serie), 0) + 1 AS n FROM "AdsCreativeOption" WHERE creatif_id = $1`, [creatifId])).rows[0].n as number
    const options = []
    for (const [i, o] of l.options.entries()) {
      const r = await client.query(
        `INSERT INTO "AdsCreativeOption" (creatif_id, demande_id, serie, carte, role, concept, pourquoi, prompt, texte, position, format, produit_ids, animes, mouvement, duree, style, brief, qualite, modele, motion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb) RETURNING id, carte, concept, mouvement`,
        [creatifId, dem.id, serie, d.type === 'options' ? null : i + 1, o.role || (d.type === 'carrousel' ? `carte ${i + 1}` : d.type === 'reel' ? `plan ${i + 1}` : `option ${i + 1}`),
          o.concept, o.pourquoi, o.prompt, JSON.stringify(o.texte), o.position, d.format, o.produitIds === undefined ? null : o.produitIds,
          d.type === 'reel' ? o.animes ?? [] : null, d.type === 'reel' ? o.mouvement : null, d.type === 'reel' ? o.duree : null,
          l.style, d.brief || null, d.qualite, l.modele || null,
          d.type === 'reel' ? JSON.stringify({ transition: o.transition ?? 'coupe', ambiance: o.ambiance ?? 'aucune', bulles: o.bulles ?? [], points: o.points ?? [], choix: o.choix ?? [] }) : null])
      options.push(r.rows[0])
    }
    await client.query('COMMIT')
    return { creatifId, serie, qualite: d.qualite, options }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function terminerDirection(id: number, resultat: string) {
  await demandeEnCours(id)
  await pool.query(`UPDATE "AdsAgentRequest" SET statut = 'termine', termine_le = now(), resultat = left($2, 3000) WHERE id = $1`, [id, resultat.trim() || 'Direction livrée.'])
  return { id }
}

/** Retoucher une option : la consigne, le texte pose, la position (Achraf) ; la note de controle (Claude). */
export async function modifierOption(id: number, patch: Json) {
  const r = await pool.query(`SELECT id, prompt, texte, position, note FROM "AdsCreativeOption" WHERE id = $1`, [id])
  if (!r.rowCount) throw new Error('Option introuvable.')
  const x = r.rows[0]
  if (typeof patch.prompt === 'string' && patch.prompt.trim().length < 200) throw new Error('La consigne doit rester complète (200 caractères au moins).')
  const prompt = typeof patch.prompt === 'string' ? patch.prompt.trim().slice(0, 4000) : x.prompt
  const t = (patch.texte && typeof patch.texte === 'object' ? patch.texte : {}) as Json
  const texte = { ...x.texte, ...Object.fromEntries(['fr', 'darija', 'ar'].filter((k) => typeof t[k] === 'string').map((k) => [k, String(t[k]).trim().slice(0, 120)])) }
  const position = patch.position === 'bas' || patch.position === 'haut' ? patch.position : x.position
  const note = typeof patch.note === 'string' ? patch.note.trim().slice(0, 1500) || null : x.note
  const u = await pool.query(`UPDATE "AdsCreativeOption" SET prompt = $2, texte = $3::jsonb, position = $4, note = $5, maj_le = now() WHERE id = $1 RETURNING *`,
    [id, prompt, JSON.stringify(texte), position, note])
  return u.rows[0]
}

export async function supprimerSerie(creatifId: number, serie: number) {
  // Les visuels deja generes restent dans la galerie (option_id passe a NULL) : on ne jette pas une image payee.
  const r = await pool.query(`DELETE FROM "AdsCreativeOption" WHERE creatif_id = $1 AND serie = $2`, [creatifId, serie])
  return { supprimees: r.rowCount }
}
