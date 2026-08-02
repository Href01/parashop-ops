/**
 * Shared TTL cache for expensive ops aggregates, backed by the Next.js Data Cache.
 *
 * Why this exists: heavy dashboard/analytics queries were running fresh on every BOS
 * load, keeping Neon compute awake and (once) blowing the compute quota. These numbers
 * don't need to be second-fresh for a COD store — an hour old is fine.
 *
 * Why it is NOT a module-level Map any more: that cache lived in the memory of ONE
 * serverless instance. In production several instances serve the BOS, each with its own
 * copy filled at a different moment, so consecutive refreshes returned different
 * snapshots of the CA — always older, never newer, which read as "the revenue keeps
 * dropping". Worse for cost, not better: N warm instances meant up to N full recomputes
 * per TTL, and a low-traffic founder tool recycles instances constantly, so the cache
 * was usually cold and Neon paid for it.
 *
 * The Data Cache is shared across every instance and survives recycling, so a given key
 * is computed ONCE per TTL for the whole deployment — same numbers everywhere, and
 * strictly less Neon compute than the per-instance version.
 *
 * Demand-driven by design: nothing recomputes unless a founder actually opens the page,
 * so when the BOS is idle the DB still gets to scale-to-zero.
 */
import { unstable_cache, revalidateTag } from 'next/cache'

/** Tag on every entry, so `bustCache()` with no prefix can clear everything. */
const TAG_ALL = 'ops:all'

/** Group tag, e.g. key `dashboard-stats:2026-07-01:…` → `ops:dashboard-stats`. */
function groupTag(key: string): string {
  return `ops:${key.split(':')[0]}`
}

/** Per-key tag, so "Actualiser" can drop ONE entry instead of the whole group. */
function keyTag(key: string): string {
  return `ops-key:${key}`
}

/**
 * The value actually stored in the Data Cache. `ts` is captured at compute time and
 * travels with the entry, so every instance reports the same "Chiffres à HH:MM" —
 * unlike a local timestamp, which would differ per instance.
 */
type Entry<T> = { data: T; ts: number }

/** Below this age a returned entry must have just been computed by us, not replayed. */
const FRESHLY_COMPUTED_MS = 1500

/**
 * Cache-life profile for every purge. Next 16 uses this to decide how long to remember
 * the invalidation; our longest TTL is 6h (a fully-past dashboard period), so anything
 * shorter than 'max' could let the invalidation be forgotten while a stale entry is
 * still live — i.e. a write that never shows up.
 */
const PURGE_PROFILE = 'max'

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts?: { fresh?: boolean }
): Promise<{ data: T; cachedAt: number; hit: boolean }> {
  // "Actualiser" (?fresh=1): drop the stored entry and recompute live. We call the
  // fetcher directly rather than relying on the revalidation landing within this same
  // request — a refresh button that can still return a stale number is worse than the
  // one extra recompute this costs.
  if (opts?.fresh) {
    revalidateTag(keyTag(key), PURGE_PROFILE)
    const data = await fetcher()
    return { data, cachedAt: Date.now(), hit: false }
  }

  // revalidate is in SECONDS here, while every caller passes milliseconds.
  const revalidate = Math.max(1, Math.round(ttlMs / 1000))

  const read = unstable_cache(
    async (): Promise<Entry<T>> => ({ data: await fetcher(), ts: Date.now() }),
    [key],
    { revalidate, tags: [TAG_ALL, groupTag(key), keyTag(key)] }
  )

  const entry = await read()

  return {
    data: entry.data,
    cachedAt: entry.ts,
    hit: Date.now() - entry.ts > FRESHLY_COMPUTED_MS,
  }
}

/**
 * Invalidate everything, or every key starting with `prefix`. Call after a write.
 * Callers pass either a group prefix with a trailing colon (`'dashboard-stats:'`) or a
 * bare key (`'leads'`); both map to the same group tag.
 */
export function bustCache(prefix?: string): void {
  if (!prefix) {
    revalidateTag(TAG_ALL, PURGE_PROFILE)
    return
  }

  revalidateTag(groupTag(prefix.replace(/:+$/, '')), PURGE_PROFILE)
}
