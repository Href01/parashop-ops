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
type Entry = { data: unknown; ts: number; ttl: number }

const store = new Map<string, Entry>()
const MAX_ENTRIES = 100

export async function cachedAnalytics<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts?: { fresh?: boolean }
): Promise<{ data: T; cachedAt: number; hit: boolean }> {
  const now = Date.now()
  const hit = store.get(key)
  if (!opts?.fresh && hit && now - hit.ts < hit.ttl) {
    return { data: hit.data as T, cachedAt: hit.ts, hit: true }
  }

  const data = await fetcher()

  // Borne mémoire : évince l'entrée la plus ancienne quand c'est plein.
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTs = Infinity
    for (const [k, e] of store) if (e.ts < oldestTs) { oldestTs = e.ts; oldestKey = k }
    if (oldestKey) store.delete(oldestKey)
  }

  store.set(key, { data, ts: now, ttl: ttlMs })
  return { data, cachedAt: now, hit: false }
}

/** Invalide tout, ou les clés commençant par `prefix`. À appeler après une écriture. */
export function bustAnalyticsCache(prefix?: string): void {
  if (!prefix) { store.clear(); return }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k)
}
