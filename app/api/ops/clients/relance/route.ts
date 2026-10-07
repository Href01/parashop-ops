import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'
import { CLE_RELANCE, fusionnerReglagesRelance, normaliserReglesRelance } from '@/lib/relance-clientes'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'
export const maxDuration = 300

/**
 * LA RELANCE DES CLIENTES QUI NE COMMANDENT PLUS, PILOTÉE DEPUIS LE BOS (page Clientes).
 *   GET                               → réglages + aperçu (clientes visées, message type, bilan)
 *   POST { action: 'regles', regles }  → enregistre les réglages et le code promo
 *   POST { action: 'creerModele' }     → soumet le modèle WhatsApp à Meta
 *   POST { action: 'statutModele' }    → relit son statut chez Meta
 *   POST { action: 'envoyer', limite? } → envoie maintenant (jamais automatique)
 * WhatsApp et Meta passent par la boutique (secret partagé INTERNAL_API_SECRET).
 */
async function lireRegles() {
  const r = await pool.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = $1`, [CLE_RELANCE])
  try { return normaliserReglesRelance(r.rows[0] ? JSON.parse(r.rows[0].value) : {}) } catch { return normaliserReglesRelance({}) }
}

async function boutique(method: 'GET' | 'POST', body?: unknown) {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET manquant sur le BOS')
  const res = await fetch(`${STOREFRONT_URL}/api/winback`, {
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
    return NextResponse.json({ regles, apercu: await boutique('GET') }, { headers: { 'Cache-Control': 'no-store' } })
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
        const regles = fusionnerReglagesRelance(await lireRegles(), body.regles)
        await pool.query(
          `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
          [CLE_RELANCE, JSON.stringify(regles)],
        )
        return NextResponse.json({ regles })
      }
      case 'creerModele':
      case 'statutModele':
        return NextResponse.json(await boutique('POST', { action: body.action }))
      case 'envoyer':
        return NextResponse.json(await boutique('POST', { action: 'envoyer', limite: body.limite }))
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 502 })
  }
}
