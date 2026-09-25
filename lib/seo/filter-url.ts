const defaults = {
  days: '28',
  country: 'mar',
  device: 'all',
  query: '',
  page: '',
  match: 'contains',
} as const

export type FilterChange = Partial<Record<keyof typeof defaults, string>>

// Read the current URL at interaction time, not the previous React render.
// This keeps consecutive changes independent of navigation/network latency.
export function mergeFilterSearch(search: string, changes: FilterChange) {
  const current = new URLSearchParams(search)
  const next = new URLSearchParams()
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    next.set(key, changes[key] ?? current.get(key) ?? defaults[key])
  }
  if (changes.query !== undefined && changes.match === undefined)
    next.set('match', 'contains')
  return next.toString()
}
