import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { getMetaToken } from '@/lib/meta-token'

/**
 * POST /api/ops/ads/sync-meta
 * Pulls campaign-level spend & performance from the Meta Marketing API and
 * upserts them into "AdCampaign" (platform='Meta'), de-duped by externalId.
 *
 * Crucially, re-syncing PRESERVES the manual mapping (eventId, productIds) —
 * it only refreshes the live metrics. New Meta campaigns arrive unmapped.
 *
 * Credentials from env (no secrets in code):
 *   META_ACCESS_TOKEN     — token with ads_read (system user token recommended)
 *   META_AD_ACCOUNT_ID    — e.g. act_1234567890 (the act_ prefix is optional)
 *   META_GRAPH_VERSION    — optional, defaults to v21.0
 */

const VERSION = (process.env.META_GRAPH_VERSION || 'v21.0').replace(/^\/+|\/+$/g, '')
const GRAPH = `https://graph.facebook.com/${VERSION}`

interface MetaAction { action_type: string; value: string }
interface MetaInsightRow {
  campaign_id: string
  campaign_name: string
  spend?: string
  impressions?: string
  clicks?: string
  action_values?: MetaAction[]
  actions?: MetaAction[]
}

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

/** Pixel-attributed purchase value from the action_values array. */
function purchaseValue(actions?: MetaAction[]): number {
  if (!actions) return 0
  for (const t of PURCHASE_TYPES) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return Number(hit.value) || 0
  }
  return 0
}

/** Sum of one or more action_type counts from the actions array. */
function actionCount(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0
  let sum = 0
  for (const a of actions) if (types.includes(a.action_type)) sum += Number(a.value) || 0
  return sum
}

// Approximate fallbacks if the live FX lookup fails (rates drift slowly).
const FX_FALLBACK: Record<string, number> = { USD: 10, EUR: 10.8, GBP: 12.6, MAD: 1 }

/**
 * Conversion rate from the ad account's billing currency to MAD.
 * Priority: META_FX_TO_MAD env override → live rate (open.er-api.com, no key)
 * → approximate fallback → 1 (no conversion).
 */
async function fxToMad(account: string, token: string): Promise<number> {
  const override = Number(process.env.META_FX_TO_MAD)
  if (Number.isFinite(override) && override > 0) return override
  try {
    const acc = await fetch(`${GRAPH}/${account}?fields=currency&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const accJson = await acc.json()
    const currency = (accJson?.currency || 'MAD').toUpperCase()
    if (currency === 'MAD') return 1
    try {
      const fxRes = await fetch(`https://open.er-api.com/v6/latest/${currency}`, { cache: 'no-store' })
      const fxJson = await fxRes.json()
      const rate = Number(fxJson?.rates?.MAD)
      if (Number.isFinite(rate) && rate > 0) return rate
    } catch { /* fall through */ }
    return FX_FALLBACK[currency] || 1
  } catch {
    return 1
  }
}

/** Cron (Bearer CRON_SECRET) or founder session. */
async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

async function runSync() {
    const token = await getMetaToken() // DB (auto-refreshed) → env bootstrap
    const rawAccount = process.env.META_AD_ACCOUNT_ID
    if (!token || !rawAccount) {
      return NextResponse.json({
        error: 'Meta non configuré. Ajoute META_ACCESS_TOKEN et META_AD_ACCOUNT_ID dans les variables d\'environnement.',
        configured: false,
      }, { status: 503 })
    }
    const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`

    // The ad account bills in its own currency (often USD/EUR) but the whole BOS
    // is in MAD. Convert spend & revenue to MAD so everything is consistent.
    const fx = await fxToMad(account, token)

    // Recent window only — avoids importing years of old/unrelated campaigns.
    const datePreset = process.env.META_DATE_PRESET || 'last_90d'
    const url = `${GRAPH}/${account}/insights`
      + `?level=campaign`
      + `&fields=campaign_id,campaign_name,spend,impressions,clicks,action_values,actions`
      + `&date_preset=${encodeURIComponent(datePreset)}&time_increment=all_days&limit=200`
      + `&access_token=${encodeURIComponent(token)}`

    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: `Meta API: ${json?.error?.message || res.status}`, configured: true }, { status: 502 })
    }
    const rows: MetaInsightRow[] = Array.isArray(json.data) ? json.data : []

    let created = 0, updated = 0
    for (const r of rows) {
      const spend = (Number(r.spend) || 0) * fx       // → MAD
      const revenue = purchaseValue(r.action_values) * fx // → MAD
      const roas = spend > 0 ? revenue / spend : 0      // ratio, unaffected by fx
      const impressions = Number(r.impressions) || 0
      const clicks = Number(r.clicks) || 0
      // Engagement from the actions array
      const likes = actionCount(r.actions, ['post_reaction', 'like'])
      const comments = actionCount(r.actions, ['comment'])
      const shares = actionCount(r.actions, ['post', 'onsite_conversion.post_save'].slice(0, 1)) // 'post' = shares
      const saves = actionCount(r.actions, ['onsite_conversion.post_save'])

      const existing = await pool.query(
        `SELECT id FROM "AdCampaign" WHERE platform = 'Meta' AND "externalId" = $1`,
        [r.campaign_id]
      )
      if (existing.rows.length > 0) {
        // Refresh metrics only — preserve eventId / productId(s) mapping
        await pool.query(
          `UPDATE "AdCampaign"
           SET name = $1, spend = $2, revenue = $3, roas = $4, impressions = $5, clicks = $6,
               likes = $7, comments = $8, shares = $9, saves = $10,
               "lastSyncedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $11`,
          [r.campaign_name, spend, revenue, roas, impressions, clicks, likes, comments, shares, saves, existing.rows[0].id]
        )
        updated++
      } else {
        await pool.query(
          `INSERT INTO "AdCampaign"
             (name, platform, spend, revenue, roas, status, "externalId", impressions, clicks, likes, comments, shares, saves, "lastSyncedAt", "createdAt", "updatedAt")
           VALUES ($1, 'Meta', $2, $3, $4, 'Active', $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())`,
          [r.campaign_name, spend, revenue, roas, r.campaign_id, impressions, clicks, likes, comments, shares, saves]
        )
        created++
      }
    }

    return NextResponse.json({ configured: true, scanned: rows.length, created, updated })
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return await runSync()
  } catch (e) {
    console.error('[Ads] sync-meta', e)
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}

// Vercel Cron calls GET — same sync, authorized via CRON_SECRET.
export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return await runSync()
  } catch (e) {
    console.error('[Ads] sync-meta', e)
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
