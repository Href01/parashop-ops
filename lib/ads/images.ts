import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { FORMATS_IMAGE, consigneImage, type FormatImage } from './creatif-model'

/**
 * LES VISUELS DES PUBS, GENERES PAR OPENAI A PARTIR DES VRAIES PHOTOS PRODUIT.
 *
 * - Avec une fiche produit : /v1/images/edits, la photo Cloudinary de la fiche
 *   en reference (le modele garde le vrai flacon). Sans fiche : /generations.
 * - Le visuel n'a AUCUN texte : l'ecran pose l'accroche et le bouton ensuite.
 * - Stocke sur Cloudinary (dossier shine-ads), trace dans "AdsCreativeImage"
 *   avec la consigne exacte, le modele, la duree et l'usage renvoye par l'API.
 * - Plafonds : ADS_IMAGES_PAR_JOUR (defaut 20) sur tout le compte, 6 par
 *   creation. Une image coute de quelques centimes a ~0,20 $ : le plafond
 *   protege le credit OpenAI d'un agent ou d'un double clic trop zeles.
 */

const MODELE_EDITION = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
const MODELE_CREATION = process.env.OPENAI_IMAGE_MODEL_GENERATION || 'gpt-image-2.5-flare'
const PLAFOND_JOUR = Number(process.env.ADS_IMAGES_PAR_JOUR) || 20
const PLAFOND_CREATION = 6
const QUALITES = ['low', 'medium', 'high'] as const
export type Qualite = (typeof QUALITES)[number]

type Json = Record<string, unknown>

/** Une photo de fiche, limitee a 1536 px et en JPEG par Cloudinary : assez fine, pas trop lourde. */
function urlReference(url: string): string | null {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  return m ? `${m[1]}c_limit,w_1536,h_1536,f_jpg,q_90/${m[2].replace(/^(?:[a-z]_[^/]*\/)+/, '')}` : null
}

async function openai(chemin: string, corps: BodyInit, json: boolean): Promise<Json> {
  const cle = process.env.OPENAI_API_KEY
  if (!cle) throw new Error('OPENAI_API_KEY absente du BOS.')
  const r = await fetch(`https://api.openai.com/v1/images/${chemin}`, {
    method: 'POST', body: corps, signal: AbortSignal.timeout(240_000),
    headers: { Authorization: `Bearer ${cle}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
  })
  const j = (await r.json().catch(() => ({}))) as Json
  if (!r.ok) {
    const msg = String((j.error as Json | undefined)?.message || r.status)
    if (r.status === 400 && /safety|moderation|policy/i.test(msg)) throw new Error('OpenAI a refusé l’image (règles de sécurité) : reformule le brief visuel.')
    if (r.status === 429 || /quota|billing/i.test(msg)) throw new Error('Crédit ou limite OpenAI atteint : réessaie plus tard ou recharge le compte.')
    throw new Error(`OpenAI : ${msg}`)
  }
  return j
}

/** Envoi signe a Cloudinary (API REST, sans dependance). */
async function versCloudinary(base64: string, publicId: string): Promise<{ url: string; publicId: string }> {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME, cle = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!nuage || !cle || !secret) throw new Error('Cloudinary n’est pas configuré sur le BOS.')
  const horodatage = Math.floor(Date.now() / 1000)
  const params = { folder: 'shine-ads', public_id: publicId, timestamp: String(horodatage) }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  const f = new FormData()
  f.append('file', `data:image/jpeg;base64,${base64}`)
  for (const [k, v] of Object.entries(params)) f.append(k, v)
  f.append('api_key', cle)
  f.append('signature', signature)
  const r = await fetch(`https://api.cloudinary.com/v1_1/${nuage}/image/upload`, { method: 'POST', body: f, signal: AbortSignal.timeout(60_000) })
  const j = (await r.json().catch(() => ({}))) as Json
  if (!r.ok || typeof j.secure_url !== 'string') throw new Error(`Cloudinary : ${(j.error as Json | undefined)?.message || r.status}`)
  return { url: j.secure_url, publicId: String(j.public_id) }
}

async function supprimerDeCloudinary(publicId: string) {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME, cle = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!nuage || !cle || !secret) return
  const horodatage = Math.floor(Date.now() / 1000)
  const signature = createHash('sha1').update(`public_id=${publicId}&timestamp=${horodatage}${secret}`).digest('hex')
  const f = new FormData()
  f.append('public_id', publicId); f.append('timestamp', String(horodatage)); f.append('api_key', cle); f.append('signature', signature)
  await fetch(`https://api.cloudinary.com/v1_1/${nuage}/image/destroy`, { method: 'POST', body: f }).catch(() => {})
}

export async function genererImage(o: { creatifId: number; format: FormatImage; qualite?: Qualite; precision?: string; par: string | null }) {
  if (!FORMATS_IMAGE[o.format]) throw new Error('Format : feed, story ou carre.')
  const qualite: Qualite = QUALITES.includes(o.qualite as Qualite) ? (o.qualite as Qualite) : 'medium'
  const c = (await pool.query(`SELECT id, angle, accroche, visuel, public, format, produit_ids FROM "AdsCreative" WHERE id = $1`, [o.creatifId])).rows[0]
  if (!c) throw new Error('Création introuvable.')
  const plafonds = await pool.query<{ jour: number; creation: number }>(
    `SELECT count(*) FILTER (WHERE cree_le > now() - interval '24 hours')::int jour, count(*) FILTER (WHERE creatif_id = $1)::int creation FROM "AdsCreativeImage"`, [o.creatifId])
  if (plafonds.rows[0].jour >= PLAFOND_JOUR) throw new Error(`${PLAFOND_JOUR} visuels déjà générés en 24 h : limite atteinte pour protéger le crédit OpenAI.`)
  if (plafonds.rows[0].creation >= PLAFOND_CREATION) throw new Error(`${PLAFOND_CREATION} visuels existent déjà pour cette création : supprime ceux qui ne servent pas.`)

  const produits = c.produit_ids?.length
    ? (await pool.query(`SELECT id, name AS nom, brand AS marque, category AS categorie, image FROM "Product" WHERE id = ANY($1::int[])`, [c.produit_ids])).rows
    : []
  const precision = (o.precision || '').trim().slice(0, 500) || undefined
  const prompt = consigneImage(c, produits, o.format, precision)
  const { taille } = FORMATS_IMAGE[o.format]
  const references = produits.map((p) => ({ id: p.id as number, url: p.image ? urlReference(String(p.image)) : null })).filter((p) => p.url).slice(0, 3)

  const debut = Date.now()
  let reponse: Json, modele: string
  if (references.length) {
    modele = MODELE_EDITION
    const f = new FormData()
    f.append('model', modele); f.append('prompt', prompt); f.append('size', taille); f.append('quality', qualite)
    f.append('n', '1'); f.append('output_format', 'jpeg'); f.append('output_compression', '92')
    for (const [i, ref] of references.entries()) {
      const img = await fetch(ref.url!, { signal: AbortSignal.timeout(30_000) })
      if (!img.ok) throw new Error(`Photo de la fiche ${ref.id} illisible (${img.status}).`)
      f.append('image[]', new Blob([await img.arrayBuffer()], { type: 'image/jpeg' }), `produit-${ref.id}-${i}.jpg`)
    }
    reponse = await openai('edits', f, false)
  } else {
    modele = MODELE_CREATION
    reponse = await openai('generations', JSON.stringify({ model: modele, prompt, size: taille, quality: qualite, n: 1, output_format: 'jpeg', output_compression: 92 }), true)
  }
  const b64 = ((reponse.data as Json[] | undefined)?.[0]?.b64_json) as string | undefined
  if (!b64) throw new Error('OpenAI n’a renvoyé aucune image.')
  const stock = await versCloudinary(b64, `creatif-${o.creatifId}-${o.format}-${Date.now()}`)
  const [largeur, hauteur] = taille.split('x').map(Number)
  const r = await pool.query(
    `INSERT INTO "AdsCreativeImage" (creatif_id, format, url, public_id, largeur, hauteur, modele, qualite, prompt, references_produits, demande_par, duree_ms, usage, choisie)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, NOT EXISTS (SELECT 1 FROM "AdsCreativeImage" WHERE creatif_id = $1 AND choisie))
     RETURNING *`,
    [o.creatifId, o.format, stock.url, stock.publicId, largeur, hauteur, modele, qualite, prompt, references.map((x) => x.id), o.par, Date.now() - debut, JSON.stringify(reponse.usage ?? null)])
  return r.rows[0]
}

export async function choisirImage(id: number) {
  const r = await pool.query(`SELECT creatif_id FROM "AdsCreativeImage" WHERE id = $1`, [id])
  if (!r.rowCount) throw new Error('Visuel introuvable.')
  await pool.query(`UPDATE "AdsCreativeImage" SET choisie = (id = $1) WHERE creatif_id = $2`, [id, r.rows[0].creatif_id])
  return { id, creatifId: r.rows[0].creatif_id }
}

export async function supprimerImage(id: number) {
  const r = await pool.query(`DELETE FROM "AdsCreativeImage" WHERE id = $1 RETURNING public_id, creatif_id, choisie`, [id])
  if (!r.rowCount) throw new Error('Visuel introuvable.')
  const x = r.rows[0]
  if (x.public_id) await supprimerDeCloudinary(x.public_id)
  // Si c'etait le visuel choisi, le plus recent restant le devient.
  if (x.choisie) await pool.query(`UPDATE "AdsCreativeImage" SET choisie = true WHERE id = (SELECT id FROM "AdsCreativeImage" WHERE creatif_id = $1 ORDER BY cree_le DESC LIMIT 1)`, [x.creatif_id])
  return { id }
}

export async function imagesDesCreations(ids: number[]) {
  if (!ids.length) return {}
  // Sans la table (migration 048 pas encore appliquee), l'ecran s'affiche quand meme, sans visuels.
  const r = await pool.query(`SELECT id, creatif_id, format, url, largeur, hauteur, modele, qualite, choisie, duree_ms, cree_le FROM "AdsCreativeImage" WHERE creatif_id = ANY($1::int[]) ORDER BY cree_le DESC`, [ids])
    .catch((e: { code?: string }) => { if (e.code === '42P01') return { rows: [] }; throw e })
  const out: Record<number, unknown[]> = {}
  for (const x of r.rows) (out[x.creatif_id] ||= []).push(x)
  return out
}
