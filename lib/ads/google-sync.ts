import pool from '@/lib/db'
import { googleAdsConfigured, googleAdsSearch } from '@/lib/google-ads'
import { bustAnalyticsCache } from '@/lib/analytics-cache'

/**
 * LA DEPENSE GOOGLE ADS, JOUR PAR JOUR → "AdSpendDaily" (platform = 'Google').
 *
 * Le tableau de bord additionne toute la table : sans cette synchro, la marge
 * nette ignorerait la pub Google des qu'une campagne tourne. Meme cle que Meta,
 * (platform, externalId, date) : rejouer la synchro met a jour, ne duplique pas.
 * On relit une fenetre glissante (35 j par defaut) : Google corrige la depense
 * apres coup (clics invalides rembourses).
 */

type Row = {
  campaign?: { id?: string; name?: string }
  segments?: { date?: string }
  metrics?: { costMicros?: string | number; impressions?: string | number; clicks?: string | number; conversionsValue?: number }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })

/** `from` (AAAA-MM-JJ) pour rattraper l'historique ; sinon les `days` derniers jours. */
export async function synchroniserPubsGoogle(opts: { days?: number; from?: string } = {}) {
  if (!googleAdsConfigured()) return { configured: false as const }

  const to = iso(new Date())
  const from = opts.from && DAY.test(opts.from)
    ? opts.from
    : iso(new Date(Date.now() - (Math.min(Math.max(opts.days ?? 35, 1), 800) - 1) * 86_400_000))

  // Toute la BOS est en dirhams : on refuse plutot que de melanger deux devises.
  const [{ customer } = {} as { customer?: { currencyCode?: string } }] = await googleAdsSearch<{ customer?: { currencyCode?: string } }>('SELECT customer.currency_code FROM customer')
  if (customer?.currencyCode && customer.currencyCode !== 'MAD') {
    throw new Error(`Le compte Google Ads est en ${customer.currencyCode}, pas en MAD : conversion non prevue.`)
  }

  const rows = await googleAdsSearch<Row>(
    `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions_value
       FROM campaign
      WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0`,
  )

  let upserts = 0
  let spend = 0
  for (const r of rows) {
    const date = r.segments?.date, id = r.campaign?.id
    if (!date || !DAY.test(date) || !id) continue
    const cost = (Number(r.metrics?.costMicros) || 0) / 1_000_000
    spend += cost
    await pool.query(
      `INSERT INTO "AdSpendDaily" (date, platform, "externalId", "campaignName", spend, revenue, impressions, clicks, "updatedAt")
       VALUES ($1, 'Google', $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (platform, "externalId", date) DO UPDATE SET
         spend = EXCLUDED.spend, revenue = EXCLUDED.revenue,
         impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
         "campaignName" = EXCLUDED."campaignName", "updatedAt" = NOW()`,
      [date, String(id), r.campaign?.name ?? '', cost, Number(r.metrics?.conversionsValue) || 0, Number(r.metrics?.impressions) || 0, Number(r.metrics?.clicks) || 0],
    )
    upserts++
  }
  if (upserts > 0) await bustAnalyticsCache()
  return { configured: true as const, from, to, rows: rows.length, upserts, spend: Math.round(spend * 100) / 100 }
}
