import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'

/**
 * Santé technique — surveiller la conso serveur/base SANS ouvrir de console.
 *
 * Tout vient de Postgres lui-même (aucune clé d'API supplémentaire) :
 *
 * - `pg_postmaster_start_time()` = depuis quand le compute Neon est ÉVEILLÉ. C'est
 *   l'unité que Neon facture (compute-heures). Avec scale-to-zero actif, un compute
 *   éveillé depuis des heures sans activité signifie que quelque chose l'empêche de
 *   dormir — le symptôme exact de la panne du 26/07.
 * - Taille de la base, connexions, taux de cache : indicateurs de saturation.
 * - Croissance des événements analytics : c'est ce volume qui rend les requêtes
 *   lourdes, donc c'est l'indicateur avancé du coût.
 *
 * Volontairement lu sur le pool partagé et sans cache : cette page doit dire la
 * vérité de l'instant, pas une valeur mise en cache il y a 5 minutes.
 */
/**
 * Consommation facturée, lue sur l'API Neon (clé lue côté serveur uniquement,
 * jamais exposée au navigateur). Forme de réponse documentée :
 *   { projects: [ { project_id, periods: [ { consumption: [
 *       { timeframe_start, timeframe_end, metrics: [ { metric_name, value } ] } ] } ] } ] }
 * Les métriques à zéro peuvent être OMISES — on ne suppose donc jamais leur présence.
 * Tout échec est non bloquant : la page doit rester utile sans l'API.
 */
type NeonUsage =
  | { configured: false; missing: string[] }
  | { configured: true; error: string }
  | { configured: true; cuHours: number; days: Array<{ date: string; cuHours: number }>; projectedMonth: number; monthStart: string }

async function fetchNeonUsage(): Promise<NeonUsage> {
  const key = process.env.NEON_API_KEY
  const projectId = process.env.NEON_PROJECT_ID
  const orgId = process.env.NEON_ORG_ID
  // On nomme LA variable manquante : sinon « non configurée » ne dit pas si le
  // problème vient d'une faute de frappe, du mauvais projet Vercel, ou d'un
  // déploiement antérieur à l'ajout des variables (Vercel ne les injecte qu'au
  // build suivant — cause la plus fréquente).
  // org_id est OBLIGATOIRE : l'API le refuse sans, avec
  // « query parameter "org_id" not set ». On le traite donc comme requis plutot
  // que de lancer un appel voue a l'echec.
  const missing = [
    !key && 'NEON_API_KEY',
    !projectId && 'NEON_PROJECT_ID',
    !orgId && 'NEON_ORG_ID',
  ].filter(Boolean) as string[]
  if (!key || !projectId || !orgId) return { configured: false, missing }

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const base = {
    from: monthStart.toISOString(),
    to: now.toISOString(),
    granularity: 'daily',
  }

  // L'API a refusé certaines combinaisons de paramètres selon le type de clé
  // (personnelle, d'organisation, ou limitée à un projet). Plutôt que de deviner,
  // on essaie les variantes plausibles dans l'ordre et on garde la première qui
  // répond — en remontant l'erreur COMPLÈTE si toutes échouent.
  const mk = (extra: Record<string, string>) => new URLSearchParams({ ...base, ...extra })
  const variants: Array<{ label: string; params: URLSearchParams }> = [
    { label: 'org_id + project_ids', params: mk({ org_id: orgId, project_ids: projectId, metrics: 'compute_unit_seconds' }) },
    // Repli : certaines cles renvoient toute l'organisation plutot qu'un projet filtre.
    { label: 'org_id seul', params: mk({ org_id: orgId, metrics: 'compute_unit_seconds' }) },
  ]

  // Forme documentee, mais on reste permissif : l'API peut omettre des champs.
  type NeonPayload = { projects?: Array<{ periods?: Array<{ consumption?: Array<{ timeframe_start?: string; metrics?: Array<{ metric_name?: string; value?: number }> }> }> }> }
  let json: NeonPayload | null = null
  let lastError = ''
  try {
    for (const v of variants) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(`https://console.neon.tech/api/v2/consumption_history/v2/projects?${v.params}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.ok) { json = await res.json(); break }
      const body = await res.text().catch(() => '')
      lastError = `${res.status} (${v.label})${body ? ` — ${body.slice(0, 400)}` : ''}`
      // 401/403 = problème de clé : inutile d'essayer les autres variantes.
      if (res.status === 401 || res.status === 403) break
    }
    if (json == null) return { configured: true, error: `Neon a répondu ${lastError}` }
    const days: Array<{ date: string; cuHours: number }> = []
    for (const p of json?.projects ?? []) {
      for (const period of p?.periods ?? []) {
        for (const frame of period?.consumption ?? []) {
          const metric = (frame?.metrics ?? []).find((m: { metric_name?: string }) => m?.metric_name === 'compute_unit_seconds')
          const seconds = Number(metric?.value) || 0
          const date = String(frame?.timeframe_start ?? '').slice(0, 10)
          if (!date) continue
          const existing = days.find((d) => d.date === date)
          if (existing) existing.cuHours += seconds / 3600
          else days.push({ date, cuHours: seconds / 3600 })
        }
      }
    }
    days.sort((a, b) => a.date.localeCompare(b.date))
    const cuHours = days.reduce((s, d) => s + d.cuHours, 0)

    // Projection fin de mois au rythme observé depuis le 1er.
    const dayOfMonth = now.getUTCDate()
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
    const projectedMonth = dayOfMonth > 0 ? (cuHours / dayOfMonth) * daysInMonth : cuHours

    return { configured: true, cuHours, days, projectedMonth, monthStart: monthStart.toISOString().slice(0, 10) }
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : 'appel impossible' }
  }
}

export async function GET() {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const [db, conn, cache, events, tables, sendit, neon] = await Promise.all([
      pool.query(`
        SELECT pg_database_size(current_database())::bigint AS bytes,
               pg_size_pretty(pg_database_size(current_database())) AS pretty,
               pg_postmaster_start_time() AS awake_since,
               EXTRACT(epoch FROM (NOW() - pg_postmaster_start_time()))::bigint AS awake_seconds`),
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE state = 'active')::int AS active,
               COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
               current_setting('max_connections')::int AS max
        FROM pg_stat_activity`),
      pool.query(`
        SELECT ROUND(100 * SUM(blks_hit)::numeric / NULLIF(SUM(blks_hit + blks_read), 0), 2)::float AS hit_ratio,
               SUM(xact_commit)::bigint AS commits,
               SUM(xact_rollback)::bigint AS rollbacks
        FROM pg_stat_database`),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours')::int AS d1,
               COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')::int AS d7,
               COUNT(*)::int AS total
        FROM "AnalyticsEvent"`),
      pool.query(`
        SELECT relname AS name, n_live_tup::bigint AS rows,
               pg_total_relation_size(relid)::bigint AS bytes,
               pg_size_pretty(pg_total_relation_size(relid)) AS pretty
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC LIMIT 8`),
      pool.query(`
        WITH staging AS (
          SELECT
            MAX("pulledAt") AS "lastPull",
            COUNT(*) FILTER (WHERE state IS DISTINCT FROM 'ignored')::int AS total,
            COUNT(*) FILTER (WHERE state = 'sendit_only')::int AS unmatched,
            COUNT(*) FILTER (WHERE state = 'mismatch')::int AS mismatches
          FROM "SenditStaging"
        ), latest AS (
          SELECT id, status, "startedAt", "finishedAt", "durationMs", "apiCalls",
                 pulled, "ordersSynced", "statusesChanged", failures, error, details
          FROM "IntegrationSyncRun"
          WHERE integration = 'sendit'
          ORDER BY "startedAt" DESC
          LIMIT 1
        ), recent AS (
          SELECT COUNT(*) FILTER (WHERE status IN ('failed', 'partial'))::int AS issues
          FROM "IntegrationSyncRun"
          WHERE integration = 'sendit' AND "startedAt" > NOW() - INTERVAL '7 days'
        )
        SELECT staging.*, latest.*, recent.issues
        FROM staging CROSS JOIN recent LEFT JOIN latest ON true`),
      fetchNeonUsage(),
    ])

    const d = db.rows[0], c = conn.rows[0], k = cache.rows[0], e = events.rows[0]
    const perDay = Number(e.d7) / 7
    const awakeHours = Number(d.awake_seconds) / 3600
    const senditRow = sendit.rows[0] || {}
    const lastPull = senditRow.lastPull ? new Date(senditRow.lastPull) : null
    const staleHours = lastPull ? (Date.now() - lastPull.getTime()) / 3_600_000 : null

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      compute: {
        awakeSince: d.awake_since,
        awakeHours,
        // Au-delà de ~12 h d'éveil continu, le scale-to-zero ne se déclenche jamais :
        // il y a forcément un appel récurrent (onglet ouvert, cron, pinger).
        warn: awakeHours >= 12,
      },
      database: { bytes: Number(d.bytes), pretty: d.pretty },
      connections: {
        total: Number(c.total), active: Number(c.active), idle: Number(c.idle),
        max: Number(c.max), usage: Number(c.max) > 0 ? (Number(c.total) / Number(c.max)) * 100 : 0,
      },
      cache: { hitRatio: Number(k.hit_ratio) || 0, commits: Number(k.commits), rollbacks: Number(k.rollbacks) },
      events: {
        last24h: Number(e.d1), last7d: Number(e.d7), total: Number(e.total),
        perDay, projectedYear: Math.round(perDay * 365),
      },
      sendit: {
        lastPull: lastPull?.toISOString() || null,
        staleHours,
        stale: staleHours == null || staleHours > 26,
        total: Number(senditRow.total) || 0,
        unmatched: Number(senditRow.unmatched) || 0,
        mismatches: Number(senditRow.mismatches) || 0,
        recentIssues: Number(senditRow.issues) || 0,
        lastRun: senditRow.id ? {
          id: Number(senditRow.id),
          status: senditRow.status,
          startedAt: senditRow.startedAt,
          finishedAt: senditRow.finishedAt,
          durationMs: Number(senditRow.durationMs) || 0,
          apiCalls: Number(senditRow.apiCalls) || 0,
          pulled: Number(senditRow.pulled) || 0,
          ordersSynced: Number(senditRow.ordersSynced) || 0,
          statusesChanged: Number(senditRow.statusesChanged) || 0,
          failures: Number(senditRow.failures) || 0,
          avoidedTrackingCalls: Number(senditRow.details?.avoidedTrackingCalls) || 0,
          error: senditRow.error || null,
        } : null,
      },
      tables: tables.rows.map((t) => ({ name: t.name, rows: Number(t.rows), pretty: t.pretty })),
      // Consommation facturée (Neon). Le plan Launch est 100 % à l'usage : aucun
      // forfait, aucun minimum, aucune heure incluse. On affiche donc un COÛT, pas
      // une jauge de quota. Tarifs publics — la facture qui fait foi reste celle de
      // la console Neon (ces taux peuvent changer).
      neon,
      neonRates: { computePerCuHour: 0.106, storagePerGbMonth: 0.35, currency: 'USD' },
    })
  } catch (error) {
    console.error('[Health]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
