/**
 * Cache mémoire (par instance) pour les agrégats analytics coûteux.
 *
 * Pourquoi : /api/ops/analytics/store lance ~30 requêtes lourdes à CHAQUE ouverture de
 * la page ou changement de filtre de dates, sans aucun cache serveur. C'est l'endpoint
 * le plus lourd du système et exactement le profil qui a saturé le compute Neon.
 *
 * Piloté par la demande : rien ne se recalcule tant que personne n'ouvre la page, donc
 * la base peut toujours se mettre en veille (scale-to-zero) quand l'admin est fermé.
 * `fresh: true` (bouton Actualiser → ?fresh=1) force un recalcul immédiat.
 */
import pool from '@/lib/db'

type Entry = { data: unknown; ts: number; ttl: number }

const store = new Map<string, Entry>()
const enCours = new Map<string, Promise<unknown>>()
const MAX_ENTRIES = 100
const REVISION_KEY = 'analytics_cache_revision'
const REVISION_POLL_MS = 15_000
let revisionMemo = { value: '0', checkedAt: 0 }
let revisionEnCours: Promise<string> | null = null

async function sharedRevision(force = false): Promise<string> {
  const now = Date.now()
  if (!force && now - revisionMemo.checkedAt < REVISION_POLL_MS) return revisionMemo.value
  if (revisionEnCours) return revisionEnCours

  const pending = (async () => {
    try {
      const r = await pool.query<{ value: string | null }>(
        `SELECT value FROM "AppSetting" WHERE key = $1`,
        [REVISION_KEY],
      )
      revisionMemo = { value: r.rows[0]?.value || '0', checkedAt: now }
    } catch (error) {
      // Le cache est une optimisation : sa coordination ne doit pas rendre le
      // rapport indisponible si cette lecture auxiliaire echoue.
      console.warn('[analytics/cache] revision illisible', error)
      revisionMemo.checkedAt = now
    }
    return revisionMemo.value
  })()
  revisionEnCours = pending
  try {
    return await pending
  } finally {
    if (revisionEnCours === pending) revisionEnCours = null
  }
}

export async function cachedAnalytics<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts?: { fresh?: boolean }
): Promise<{ data: T; cachedAt: number; hit: boolean }> {
  const now = Date.now()
  const revision = await sharedRevision(Boolean(opts?.fresh))
  const scopedKey = `${revision}:${key}`
  const hit = store.get(scopedKey)
  if (!opts?.fresh && hit && now - hit.ts < hit.ttl) {
    return { data: hit.data as T, cachedAt: hit.ts, hit: true }
  }

  // En développement React peut lancer deux lectures identiques, et deux
  // admins peuvent ouvrir le même rapport au même instant. Une seule requête
  // atteint la base ; les autres attendent sa promesse.
  if (!opts?.fresh) {
    const pending = enCours.get(scopedKey)
    if (pending) {
      const data = await pending as T
      const entry = store.get(scopedKey)
      return { data, cachedAt: entry?.ts ?? Date.now(), hit: true }
    }
  }

  const pending = fetcher()
  enCours.set(scopedKey, pending)
  let data: T
  try {
    data = await pending
  } finally {
    if (enCours.get(scopedKey) === pending) enCours.delete(scopedKey)
  }
  const fetchedAt = Date.now()

  // Borne mémoire : évince l'entrée la plus ancienne quand c'est plein.
  if (!store.has(scopedKey) && store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTs = Infinity
    for (const [k, e] of store) if (e.ts < oldestTs) { oldestTs = e.ts; oldestKey = k }
    if (oldestKey) store.delete(oldestKey)
  }

  store.set(scopedKey, { data, ts: fetchedAt, ttl: ttlMs })
  return { data, cachedAt: fetchedAt, hit: false }
}

/** Invalide localement et signale les autres instances Vercel. */
export async function bustAnalyticsCache(prefix?: string): Promise<void> {
  if (!prefix) store.clear()
  else for (const k of store.keys()) if (k.includes(`:${prefix}`)) store.delete(k)

  try {
    const r = await pool.query<{ value: string }>(`
      INSERT INTO "AppSetting" (key, value, "updatedAt")
      VALUES ($1, '1', NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = (COALESCE(NULLIF("AppSetting".value, ''), '0')::bigint + 1)::text,
        "updatedAt" = NOW()
      RETURNING value
    `, [REVISION_KEY])
    revisionMemo = { value: r.rows[0]?.value || revisionMemo.value, checkedAt: Date.now() }
  } catch (error) {
    console.warn('[analytics/cache] invalidation partagee impossible', error)
  }
}
