import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * POST /api/ops/content/sync-instagram
 * Pulls organic post metrics from the Instagram Graph API and writes them onto
 * matching PUBLISHED ContentItems (matched by permalink, or externalId once set).
 *
 * Credentials come from env (no secrets in code):
 *   IG_USER_ID        — the Instagram Business account id
 *   IG_ACCESS_TOKEN   — long-lived token with instagram_manage_insights
 *   IG_GRAPH_VERSION  — optional, defaults to v21.0
 *
 * Until those are set, the endpoint returns a clear "not configured" message,
 * so manual entry keeps working and nothing breaks.
 */

// Works with both methods:
//  - Instagram API with Instagram Login (simplest 2026): base graph.instagram.com,
//    token only (IG_USER_ID optional → uses /me/media)
//  - Facebook Login for Business: set IG_API_BASE=https://graph.facebook.com + IG_USER_ID
const IG_BASE = (process.env.IG_API_BASE || 'https://graph.instagram.com').replace(/\/+$/, '')
const GRAPH = `${IG_BASE}/${process.env.IG_GRAPH_VERSION || 'v21.0'}`

interface IgMedia { id: string; permalink: string; media_type?: string; media_product_type?: string }
interface IgInsightValue { name: string; values: { value: number }[] }

/** Normalize a permalink for matching (strip query + trailing slash). */
function normPermalink(url: string): string {
  return url.trim().split('?')[0].replace(/\/+$/, '').toLowerCase()
}

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function POST(_req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })

    const igUserId = process.env.IG_USER_ID // optional with Instagram Login (→ /me/media)
    const token = process.env.IG_ACCESS_TOKEN
    if (!token) {
      return NextResponse.json({
        error: 'Instagram non configuré. Ajoute IG_ACCESS_TOKEN (et IG_USER_ID si méthode Facebook Login) dans les variables d\'environnement.',
        configured: false,
      }, { status: 503 })
    }

    // 1) Which posts do we want metrics for? PUBLISHED items with a permalink or externalId.
    const wanted = await pool.query<{ id: number; permalink: string | null; externalId: string | null }>(
      `SELECT id, permalink, "externalId" FROM "ContentItem"
       WHERE status = 'PUBLISHED' AND (permalink IS NOT NULL OR "externalId" IS NOT NULL)`
    )
    if (wanted.rows.length === 0) {
      return NextResponse.json({ updated: 0, message: 'Aucun post publié avec un lien à synchroniser.' })
    }
    const byPermalink = new Map<string, number>()
    const byExternal = new Map<string, number>()
    for (const r of wanted.rows) {
      if (r.permalink) byPermalink.set(normPermalink(r.permalink), r.id)
      if (r.externalId) byExternal.set(r.externalId, r.id)
    }

    // 2) Fetch recent media from the IG account ("me" with Instagram Login, or the id with FB Login)
    const mediaPath = igUserId ? igUserId : 'me'
    const mediaUrl = `${GRAPH}/${mediaPath}/media?fields=id,permalink,media_type,media_product_type&limit=50&access_token=${encodeURIComponent(token)}`
    const mediaRes = await fetch(mediaUrl, { cache: 'no-store' })
    const mediaJson = await mediaRes.json()
    if (!mediaRes.ok) {
      return NextResponse.json({ error: `IG API: ${mediaJson?.error?.message || mediaRes.status}`, configured: true }, { status: 502 })
    }
    const media: IgMedia[] = Array.isArray(mediaJson.data) ? mediaJson.data : []

    let updated = 0
    const errors: string[] = []

    for (const m of media) {
      const contentId = byExternal.get(m.id) ?? (m.permalink ? byPermalink.get(normPermalink(m.permalink)) : undefined)
      if (!contentId) continue // this IG post isn't tracked in the Content Hub

      // 3) Metrics depend on media type. Base set works for all; views for video/reels.
      const isVideo = m.media_type === 'VIDEO' || m.media_product_type === 'REELS'
      const metrics = isVideo ? 'reach,likes,comments,saved,shares,views' : 'reach,likes,comments,saved,shares'
      const insUrl = `${GRAPH}/${m.id}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`
      const insRes = await fetch(insUrl, { cache: 'no-store' })
      const insJson = await insRes.json()
      if (!insRes.ok) { errors.push(`#${contentId}: ${insJson?.error?.message || insRes.status}`); continue }

      const vals = new Map<string, number>()
      for (const it of (insJson.data || []) as IgInsightValue[]) {
        vals.set(it.name, it.values?.[0]?.value ?? 0)
      }

      await pool.query(
        `UPDATE "ContentItem"
         SET reach = $1, views = $2, likes = $3, saves = $4, comments = $5, shares = $6,
             "externalId" = $7, "metricsSyncedAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $8`,
        [
          vals.get('reach') ?? null,
          vals.get('views') ?? null,
          vals.get('likes') ?? null,
          vals.get('saved') ?? null,     // IG calls it "saved"; we store "saves"
          vals.get('comments') ?? null,
          vals.get('shares') ?? null,
          m.id,
          contentId,
        ]
      )
      updated++
    }

    return NextResponse.json({
      updated,
      scanned: media.length,
      tracked: wanted.rows.length,
      errors: errors.slice(0, 5),
      configured: true,
    })
  } catch (e) {
    console.error('[Content] sync-instagram', e)
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
