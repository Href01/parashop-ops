import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'
import { CLE_REGLES_AVIS, fusionnerReglages, normaliserReglesAvis } from '@/lib/avis-demandes'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'
export const maxDuration = 300

/**
 * LES DEMANDES D'AVIS, PILOTÉES DEPUIS LE BOS (page Avis).
 *   GET                              → réglages + ce que la prochaine tâche enverrait
 *   POST { action: 'regles', regles } → enregistre les montants et réglages
 *   POST { action: 'creerModeles' }   → soumet à Meta les modèles WhatsApp manquants
 *   POST { action: 'statutModeles' }  → relit chez Meta le statut des modèles
 *   POST { action: 'envoyer', limite? } → envoie maintenant (mêmes règles que la tâche)
 * Meta et WhatsApp passent par la boutique, qui détient la clé (secret partagé).
 */
async function lireRegles() {
  const r = await pool.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = $1`, [CLE_REGLES_AVIS])
  try { return normaliserReglesAvis(r.rows[0] ? JSON.parse(r.rows[0].value) : {}) } catch { return normaliserReglesAvis({}) }
}

async function boutique(path: string, method: 'GET' | 'POST', body?: unknown) {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET manquant sur le BOS')
  const res = await fetch(`${STOREFRONT_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(280_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `La boutique a répondu ${res.status}`)
  return data
}

export async function GET() {
  if (!(await getOpsSession())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const regles = await lireRegles()
  try {
    return NextResponse.json({ regles, apercu: await boutique('/api/reviews/requests', 'GET') }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ regles, apercu: null, apercuErreur: e instanceof Error ? e.message : 'Boutique injoignable' }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: NextRequest) {
  if (!(await getOpsSession())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  try {
    switch (body?.action) {
      case 'regles': {
        const regles = fusionnerReglages(await lireRegles(), body.regles)
        await pool.query(
          `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
          [CLE_REGLES_AVIS, JSON.stringify(regles)],
        )
        return NextResponse.json({ regles })
      }
      case 'creerModeles': return NextResponse.json(await boutique('/api/reviews/templates', 'POST'))
      case 'statutModeles': return NextResponse.json(await boutique('/api/reviews/templates', 'GET'))
      case 'envoyer': return NextResponse.json(await boutique('/api/reviews/requests', 'POST', { limite: body.limite }))
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 502 })
  }
}
