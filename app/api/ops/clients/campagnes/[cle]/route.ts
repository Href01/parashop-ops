import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'
export const maxDuration = 300

/* LES CAMPAGNES WHATSAPP (« annonce » : Olaplex et soins coréens avec BIENVENUE10 ;
   « milkshake » : -10 % Milk Shake avec MILKSHAKE10), pilotées depuis la page Clientes.
     GET                               → réglages + aperçu (clientes visées, message, code, bilan)
     POST { action: 'regles', regles }  → audience, lot, pause, code (jamais le statut Meta)
     POST { action: 'creerModele' | 'statutModele' | 'envoyer', limite? } → via la boutique
   Mêmes clés AppSetting que lib/campagnes.ts de la boutique (`campagne_<clé>`). */

const CAMPAGNES = { annonce: { marque: false }, milkshake: { marque: true } } as const
type Cle = keyof typeof CAMPAGNES
const estCle = (v: string): v is Cle => Object.hasOwn(CAMPAGNES, v)

async function lireRegles(cle: Cle): Promise<Record<string, unknown>> {
  const r = await pool.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = $1`, [`campagne_${cle}`])
  try { return r.rows[0] ? JSON.parse(r.rows[0].value) : {} } catch { return {} }
}

async function boutique(cle: Cle, method: 'GET' | 'POST', body?: unknown) {
  if (!process.env.INTERNAL_API_SECRET) throw new Error('INTERNAL_API_SECRET manquant sur le BOS')
  const res = await fetch(`${STOREFRONT_URL}/api/campagnes/${cle}`, {
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cle: string }> }) {
  if (!(await getOpsSession())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { cle } = await params
  if (!estCle(cle)) return NextResponse.json({ error: 'Campagne inconnue' }, { status: 404 })
  try {
    return NextResponse.json({ apercu: await boutique(cle, 'GET') }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ apercu: null, regles: await lireRegles(cle), apercuErreur: e instanceof Error ? e.message : 'Boutique injoignable' }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ cle: string }> }) {
  if (!(await getOpsSession())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { cle } = await params
  if (!estCle(cle)) return NextResponse.json({ error: 'Campagne inconnue' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  try {
    if (body?.action === 'regles') {
      const actuelles = await lireRegles(cle)
      const s = (body.regles && typeof body.regles === 'object' ? body.regles : {}) as Record<string, unknown>
      const audiences = CAMPAGNES[cle].marque ? ['clientes', 'comptes', 'toutes', 'marque'] : ['clientes', 'comptes', 'toutes']
      const entier = (v: unknown, min: number, max: number, d: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : d }
      const code = String(s.code ?? '').trim().toUpperCase()
      const regles = {
        ...actuelles,
        audience: audiences.includes(String(s.audience)) ? s.audience : actuelles.audience,
        lotMax: entier(s.lotMax, 1, 300, actuelles.lotMax ?? 50),
        pauseApresMessageJours: entier(s.pauseApresMessageJours, 0, 60, actuelles.pauseApresMessageJours ?? 7),
        code: /^[A-Z0-9]{3,20}$/.test(code) ? code : actuelles.code,
        modele: actuelles.modele ?? null, // le statut Meta appartient à la boutique
      }
      await pool.query(
        `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
        [`campagne_${cle}`, JSON.stringify(regles)])
      return NextResponse.json({ ok: true })
    }
    if (['creerModele', 'statutModele', 'envoyer'].includes(body?.action)) {
      return NextResponse.json(await boutique(cle, 'POST', { action: body.action, limite: body.limite }))
    }
    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 502 })
  }
}
