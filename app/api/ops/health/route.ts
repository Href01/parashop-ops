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
export async function GET() {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  try {
    const [db, conn, cache, events, tables] = await Promise.all([
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
    ])

    const d = db.rows[0], c = conn.rows[0], k = cache.rows[0], e = events.rows[0]
    const perDay = Number(e.d7) / 7
    const awakeHours = Number(d.awake_seconds) / 3600

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
      tables: tables.rows.map((t) => ({ name: t.name, rows: Number(t.rows), pretty: t.pretty })),
    })
  } catch (error) {
    console.error('[Health]', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
