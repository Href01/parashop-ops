import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { FORMATS_IMAGE, consigneImage, type FormatImage } from './creatif-model'
import { promptFinal } from './direction-model'

/**
 * LES VISUELS DES PUBS, GENERES PAR OPENAI A PARTIR DES VRAIES PHOTOS PRODUIT.
 *
 * - Avec une fiche produit : /v1/images/edits, la photo Cloudinary de la fiche
 *   en reference (le modele garde le vrai flacon). Sans fiche : /generations.
 * - Le visuel n'a AUCUN texte : l'ecran pose l'accroche et le bouton ensuite.
 * - Stocke sur Cloudinary (dossier shine-ads), trace dans "AdsCreativeImage"
 *   avec la consigne exacte, le modele, la duree et l'usage renvoye par l'API.
 * - Avec une option du directeur artistique (optionId) : la consigne est celle
 *   que Claude a ecrite, plus nos garde-fous (promptFinal). Une carte 2..10 de
 *   carrousel recoit aussi le visuel de la carte 1 en reference de style.
 * - Plafonds : ADS_IMAGES_PAR_JOUR (defaut 40) sur tout le compte, 40 par
 *   creation (un carrousel de 10 cartes, avec ses reprises). Une image coute de
 *   quelques centimes a ~0,20 $ : le plafond protege le credit OpenAI d'un
 *   agent ou d'un double clic trop zeles.
 */

const MODELE_EDITION = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
const MODELE_CREATION = process.env.OPENAI_IMAGE_MODEL_GENERATION || 'gpt-image-2.5-flare'
const PLAFOND_JOUR = Number(process.env.ADS_IMAGES_PAR_JOUR) || 40
const PLAFOND_CREATION = 40
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

type Reference = { nom: string; url: string }

/** Le choix est par « place » : la carte d'un carrousel (son option), ou l'image seule de la creation. */
const PLACE = `(CASE WHEN x.carte IS NULL THEN i.creatif_id = x.creatif_id AND i.carte IS NULL ELSE i.option_id = x.option_id END)`

export async function genererImage(o: { creatifId?: number; optionId?: number; format?: FormatImage; qualite?: Qualite; precision?: string; par: string | null }) {
  const qualite: Qualite = QUALITES.includes(o.qualite as Qualite) ? (o.qualite as Qualite) : 'medium'
  const opt = o.optionId
    ? (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [o.optionId])).rows[0]
    : null
  if (o.optionId && !opt) throw new Error('Option introuvable.')
  // Un plan qui attend un clip anime (consigne de mouvement ecrite) peint son IMAGE DE DEPART : c'est elle que la video animera.
  const imageDeDepart = Boolean(String(opt?.motion?.clipPrompt ?? '').trim())
  if (!imageDeDepart && opt?.motion?.fond && opt.motion.fond !== 'decor') throw new Error('Ce plan a un fond Shine dessiné : pas d’image à peindre (le crédit OpenAI est gardé).')
  if (!imageDeDepart && opt?.motion?.clip) throw new Error('Ce plan a un clip vidéo en fond : pas de décor à peindre.')
  const creatifId: number = opt ? opt.creatif_id : Number(o.creatifId)
  const format: FormatImage = opt ? opt.format : (o.format as FormatImage)
  if (!FORMATS_IMAGE[format]) throw new Error('Format : feed, story ou carre.')
  const c = (await pool.query(`SELECT id, angle, accroche, visuel, public, format, produit_ids FROM "AdsCreative" WHERE id = $1`, [creatifId])).rows[0]
  if (!c) throw new Error('Création introuvable.')
  const plafonds = await pool.query<{ jour: number; creation: number }>(
    `SELECT count(*) FILTER (WHERE cree_le > now() - interval '24 hours')::int jour, count(*) FILTER (WHERE creatif_id = $1)::int creation FROM "AdsCreativeImage"`, [creatifId])
  if (plafonds.rows[0].jour >= PLAFOND_JOUR) throw new Error(`${PLAFOND_JOUR} visuels déjà générés en 24 h : limite atteinte pour protéger le crédit OpenAI.`)
  if (plafonds.rows[0].creation >= PLAFOND_CREATION) throw new Error(`${PLAFOND_CREATION} visuels existent déjà pour cette création : supprime ceux qui ne servent pas.`)

  // Les produits montres : ceux de l'option (NULL = tous ceux de la creation, {} = aucun).
  const ids: number[] = (opt && opt.produit_ids != null ? opt.produit_ids : c.produit_ids) ?? []
  const produits = ids.length
    ? (await pool.query(`SELECT id, name AS nom, brand AS marque, category AS categorie, image FROM "Product" WHERE id = ANY($1::int[])`, [ids])).rows
    : []
  const references: Reference[] = produits
    .map((p) => ({ nom: `produit-${p.id}`, url: p.image ? urlReference(String(p.image)) : null }))
    .filter((p): p is Reference => Boolean(p.url)).slice(0, 3)
  const nbProduits = references.length
  // Carrousel : la carte 1 deja peinte donne le decor, la lumiere et l'etalonnage des suivantes.
  let styleCarte1 = false
  if (opt && opt.carte > 1) {
    const r = await pool.query(
      `SELECT i.url FROM "AdsCreativeImage" i JOIN "AdsCreativeOption" x ON x.id = i.option_id
       WHERE x.creatif_id = $1 AND x.serie = $2 AND x.carte = 1 ORDER BY i.choisie DESC, i.cree_le DESC LIMIT 1`, [creatifId, opt.serie])
    const url = r.rows[0]?.url ? urlReference(String(r.rows[0].url)) : null
    if (url) { references.push({ nom: 'carte-1', url }); styleCarte1 = true }
  }
  const prompt = opt
    ? promptFinal({ prompt: opt.prompt, format, position: opt.position, style: opt.style, produits: nbProduits, styleCarte1, decorPourAnimation: Boolean(opt.animes?.length) })
    : consigneImage(c, produits, format, (o.precision || '').trim().slice(0, 500) || undefined)
  const { taille } = FORMATS_IMAGE[format]

  const debut = Date.now()
  let reponse: Json, modele: string
  if (references.length) {
    modele = MODELE_EDITION
    const f = new FormData()
    f.append('model', modele); f.append('prompt', prompt); f.append('size', taille); f.append('quality', qualite)
    f.append('n', '1'); f.append('output_format', 'jpeg'); f.append('output_compression', '92')
    for (const [i, ref] of references.entries()) {
      const img = await fetch(ref.url, { signal: AbortSignal.timeout(30_000) })
      if (!img.ok) throw new Error(`Image de référence ${ref.nom} illisible (${img.status}).`)
      f.append('image[]', new Blob([await img.arrayBuffer()], { type: 'image/jpeg' }), `${ref.nom}-${i}.jpg`)
    }
    reponse = await openai('edits', f, false)
  } else {
    modele = MODELE_CREATION
    reponse = await openai('generations', JSON.stringify({ model: modele, prompt, size: taille, quality: qualite, n: 1, output_format: 'jpeg', output_compression: 92 }), true)
  }
  const b64 = ((reponse.data as Json[] | undefined)?.[0]?.b64_json) as string | undefined
  if (!b64) throw new Error('OpenAI n’a renvoyé aucune image.')
  const stock = await versCloudinary(b64, `creatif-${creatifId}${opt ? `-o${opt.id}` : ''}-${format}-${Date.now()}`)
  const [largeur, hauteur] = taille.split('x').map(Number)
  const colonnesOption = opt ? ', option_id, carte' : ''
  const valeursOption = opt ? ', $15, $16' : ''
  const r = await pool.query(
    `INSERT INTO "AdsCreativeImage" (creatif_id, format, url, public_id, largeur, hauteur, modele, qualite, prompt, references_produits, demande_par, duree_ms, usage, choisie${colonnesOption})
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, $14${valeursOption}
     RETURNING *`,
    [creatifId, format, stock.url, stock.publicId, largeur, hauteur, modele, qualite, prompt, produits.map((p) => p.id).slice(0, 3), o.par, Date.now() - debut,
      JSON.stringify(reponse.usage ?? null), await premiereDeSaPlace(creatifId, opt), ...(opt ? [opt.id, opt.carte] : [])])
  return r.rows[0]
}

/** Le premier visuel d'une place est choisi d'office (sans colonne option_id avant la migration 049 : ancienne regle). */
async function premiereDeSaPlace(creatifId: number, opt: { id: number; carte: number | null } | null): Promise<boolean> {
  const r = opt
    ? await pool.query(`SELECT 1 FROM "AdsCreativeImage" i, (SELECT $1::int creatif_id, $2::int option_id, $3::int carte) x WHERE i.choisie AND ${PLACE} LIMIT 1`, [creatifId, opt.id, opt.carte])
    : await pool.query(`SELECT 1 FROM "AdsCreativeImage" i WHERE i.creatif_id = $1 AND i.choisie AND coalesce((to_jsonb(i) ->> 'carte'), '') = '' LIMIT 1`, [creatifId])
  return !r.rowCount
}

export async function choisirImage(id: number) {
  const r = await pool.query(`SELECT creatif_id FROM "AdsCreativeImage" WHERE id = $1`, [id])
  if (!r.rowCount) throw new Error('Visuel introuvable.')
  // Un seul visuel choisi par place (la carte, ou l'image seule) : les autres cartes gardent le leur.
  await pool.query(`UPDATE "AdsCreativeImage" i SET choisie = (i.id = x.id) FROM "AdsCreativeImage" x WHERE x.id = $1 AND ${PLACE}`, [id])
  return { id, creatifId: r.rows[0].creatif_id }
}

export async function supprimerImage(id: number) {
  const r = await pool.query(`DELETE FROM "AdsCreativeImage" WHERE id = $1 RETURNING public_id, creatif_id, option_id, carte, choisie`, [id])
  if (!r.rowCount) throw new Error('Visuel introuvable.')
  const x = r.rows[0]
  if (x.public_id) await supprimerDeCloudinary(x.public_id)
  // Si c'etait le visuel choisi, le plus recent restant a la meme place le devient.
  if (x.choisie) await pool.query(
    `UPDATE "AdsCreativeImage" SET choisie = true WHERE id = (SELECT i.id FROM "AdsCreativeImage" i, (SELECT $1::int creatif_id, $2::int option_id, $3::int carte) x WHERE ${PLACE} ORDER BY i.cree_le DESC LIMIT 1)`,
    [x.creatif_id, x.option_id, x.carte])
  return { id }
}

export async function imagesDesCreations(ids: number[]) {
  if (!ids.length) return {}
  // Sans la table (migration 048 pas encore appliquee), l'ecran s'affiche quand meme, sans visuels.
  // option_id et carte n'existent qu'apres la migration 049 : to_jsonb les lit si elles sont la.
  const r = await pool.query(`SELECT to_jsonb(i) - 'prompt' - 'usage' - 'public_id' AS x FROM "AdsCreativeImage" i WHERE creatif_id = ANY($1::int[]) ORDER BY cree_le DESC`, [ids])
    .catch((e: { code?: string }) => { if (e.code === '42P01') return { rows: [] }; throw e })
  const out: Record<number, unknown[]> = {}
  for (const { x } of r.rows as { x: Json }[]) (out[x.creatif_id as number] ||= []).push({ option_id: null, carte: null, ...x })
  return out
}

/** Les options et cartes du directeur artistique, par creation (vide tant que la migration 049 n'est pas passee). */
export async function optionsDesCreations(ids: number[]) {
  if (!ids.length) return {}
  const r = await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE creatif_id = ANY($1::int[]) ORDER BY creatif_id, serie DESC, carte NULLS FIRST, id`, [ids])
    .catch((e: { code?: string }) => { if (e.code === '42P01') return { rows: [] }; throw e })
  const out: Record<number, unknown[]> = {}
  for (const x of r.rows) (out[x.creatif_id] ||= []).push(x)
  return out
}

/**
 * Une image de NOTRE Cloudinary, en base64, pour l'agent : son environnement
 * cloud peut ne pas joindre res.cloudinary.com ; il passe alors par le BOS.
 */
export async function lireImage(url: string) {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME
  if (!nuage || !url.startsWith(`https://res.cloudinary.com/${nuage}/image/upload/`)) throw new Error('Seules les images du Cloudinary de Shine sont lisibles ici.')
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`Image illisible (${r.status}).`)
  const b = Buffer.from(await r.arrayBuffer())
  if (b.length > 8_000_000) throw new Error('Image trop lourde (8 Mo au plus).')
  return { type: r.headers.get('content-type') || 'image/jpeg', base64: b.toString('base64') }
}
