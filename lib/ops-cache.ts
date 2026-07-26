/**
 * Per-instance TTL cache for expensive ops aggregates.
 *
 * Why this exists: heavy dashboard/analytics queries were running fresh on every BOS
 * load, keeping Neon compute awake and (once) blowing the compute quota. These numbers
 * don't need to be second-fresh for a COD store — an hour old is fine. This caches a
 * computed result in module memory so it's reused across requests hitting the same warm
 * serverless instance: a heavy query drops from "every load" to "≤ once per TTL".
 *
 * Demand-driven by design: nothing recomputes unless a founder actually opens the page,
 * so when the BOS is idle the DB gets to scale-to-zero. Pass { fresh:true } (the UI's
 * "Actualiser" button → ?fresh=1) to force a live recompute.
 */
type Entry = { data: unknown; ts: number; ttl: number }

const store = new Map<string, Entry>()
const MAX_ENTRIES = 200

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts?: { fresh?: boolean }
): Promise<{ data: T; cachedAt: number; hit: boolean }> {
  const now = Date.now()
  const existing = store.get(key)
  if (!opts?.fresh && existing && now - existing.ts < existing.ttl) {
    return { data: existing.data as T, cachedAt: existing.ts, hit: true }
  }

  const data = await fetcher()

  // Bound memory: evict the oldest entry when full (before inserting a new key).
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTs = Infinity
    for (const [k, e] of store) if (e.ts < oldestTs) { oldestTs = e.ts; oldestKey = k }
    if (oldestKey) store.delete(oldestKey)
  }

  store.set(key, { data, ts: now, ttl: ttlMs })
  return { data, cachedAt: now, hit: false }
}

/** Invalidate everything, or every key starting with `prefix`. Call after a write. */
export function bustCache(prefix?: string): void {
  if (!prefix) { store.clear(); return }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
}
