import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'

/**
 * LA VOIX OFF D'UN PLAN DE REEL — synthese vocale d'OpenAI (gpt-4o-mini-tts),
 * en chuchotement ASMR par defaut, en francais, darija ou arabe.
 *
 * Le texte est celui que Claude (ou Achraf) a ecrit dans `motion.voix` ; le
 * fichier MP3 est stocke sur Cloudinary (dossier shine-ads/voix) et son adresse
 * rangee dans `motion.voixUrl[langue]`, avec le texte lu : si le texte change,
 * l'ecran sait que la voix n'est plus a jour.
 */

const MODELE = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
const VOIX = process.env.ADS_VOIX || 'coral'
export type LangueVoix = 'fr' | 'darija' | 'ar'

const CONSIGNES: Record<LangueVoix, string> = {
  fr: 'Soft ASMR whisper, very close to the microphone, slow, calm, warm and intimate. French with a light Moroccan accent. Small breaths between phrases, never shouting, never salesy.',
  darija: 'Soft ASMR whisper in Moroccan Darija (the Arabic dialect of Morocco, written here in Latin letters), very close to the microphone, slow, calm and warm. Pronounce it like a Moroccan woman from Casablanca.',
  ar: 'Soft ASMR whisper in Modern Standard Arabic addressing a woman, very close to the microphone, slow, calm and warm.',
}

async function versCloudinary(mp3: Buffer, publicId: string): Promise<string> {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME, cle = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!nuage || !cle || !secret) throw new Error('Cloudinary n’est pas configuré sur le BOS.')
  const params = { folder: 'shine-ads/voix', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  const f = new FormData()
  f.append('file', `data:audio/mpeg;base64,${mp3.toString('base64')}`)
  for (const [k, v] of Object.entries(params)) f.append(k, v)
  f.append('api_key', cle); f.append('signature', signature)
  // Un son se range dans « video » chez Cloudinary.
  const r = await fetch(`https://api.cloudinary.com/v1_1/${nuage}/video/upload`, { method: 'POST', body: f, signal: AbortSignal.timeout(60_000) })
  const j = (await r.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } }
  if (!r.ok || !j.secure_url) throw new Error(`Cloudinary : ${j.error?.message || r.status}`)
  return j.secure_url
}

export async function genererVoix(optionId: number, langue: LangueVoix) {
  if (!CONSIGNES[langue]) throw new Error('Langue : fr, darija ou ar.')
  const cle = process.env.OPENAI_API_KEY
  if (!cle) throw new Error('OPENAI_API_KEY absente du BOS.')
  const o = (await pool.query(`SELECT id, creatif_id, motion FROM "AdsCreativeOption" WHERE id = $1`, [optionId])).rows[0]
  if (!o) throw new Error('Plan introuvable.')
  const texte = String(o.motion?.voix?.[langue] || '').trim()
  if (texte.length < 3) throw new Error(`Écris d’abord la voix off en ${langue === 'fr' ? 'français' : langue === 'ar' ? 'arabe' : 'darija'} pour ce plan.`)
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELE, voice: VOIX, input: texte, instructions: CONSIGNES[langue], response_format: 'mp3' }),
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(`OpenAI (voix) : ${j.error?.message || r.status}`)
  }
  const url = await versCloudinary(Buffer.from(await r.arrayBuffer()), `creatif-${o.creatif_id}-o${optionId}-${langue}-${Date.now()}`)
  const u = await pool.query(
    // Fusion explicite : jsonb_set ne cree pas la cle parente « voixUrl » quand elle manque.
    `UPDATE "AdsCreativeOption" SET motion = coalesce(motion, '{}'::jsonb) || jsonb_build_object('voixUrl',
       coalesce(motion->'voixUrl', '{}'::jsonb) || jsonb_build_object($2::text, jsonb_build_object('url', $3::text, 'texte', $4::text))), maj_le = now()
     WHERE id = $1 RETURNING motion`,
    [optionId, langue, url, texte])
  return { url, texte, motion: u.rows[0].motion }
}
