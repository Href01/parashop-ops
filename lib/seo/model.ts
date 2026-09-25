export const DATASETS = ['site', 'query', 'page', 'detail'] as const
export type Dataset = (typeof DATASETS)[number]
export const DIMENSIONS: Record<Dataset, string[]> = {
  site: ['country', 'device'],
  query: ['query', 'country', 'device'],
  page: ['page', 'country', 'device'],
  detail: ['query', 'page', 'country', 'device'],
}
export type SearchRow = {
  day: string
  dataset: Dataset
  query: string
  page: string
  country: string
  device: string
  clicks: number
  impressions: number
  position: number
}
export type ImportDay = { day: string; dataset: Dataset; capped: boolean }
export type Metrics = {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}
export type Comparison = {
  key: string
  current: Metrics
  previous: Metrics
  positionDelta: number | null
  impressionDelta: number | null
  signal: 'drop' | 'unobserved' | 'opportunity' | 'low-volume' | 'stable'
}
export type Filters = {
  days: 7 | 28
  country: string
  device: string
  query: string
  page: string
  match: 'contains' | 'exact'
}

export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10)
}
export function pacificDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function daysBetween(start: string, end: string) {
  const result: string[] = []
  for (let day = start; day <= end; day = shiftDay(day, 1)) result.push(day)
  return result
}
export function sumMetrics(
  rows: Pick<SearchRow, 'clicks' | 'impressions' | 'position'>[],
): Metrics {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const impressions = rows.reduce((s, r) => s + r.impressions, 0)
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : null,
    position: impressions
      ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
      : null,
  }
}
export function comparison(
  key: string,
  current: Metrics,
  previous: Metrics,
  comparable: boolean,
): Comparison {
  const positionDelta =
    comparable && current.position !== null && previous.position !== null
      ? current.position - previous.position
      : null
  const impressionDelta =
    comparable && previous.impressions > 0
      ? (current.impressions - previous.impressions) / previous.impressions
      : null
  const signal = !comparable
    ? 'stable'
    : previous.impressions >= 30 && current.impressions === 0
      ? 'unobserved'
      : current.impressions < 20 || previous.impressions < 20
        ? 'low-volume'
        : (positionDelta !== null && positionDelta >= 3) ||
            (impressionDelta !== null && impressionDelta <= -0.4)
          ? 'drop'
          : current.impressions >= 50 &&
              current.position !== null &&
              current.position >= 4 &&
              current.position <= 20 &&
              (current.ctr ?? 1) < 0.03
            ? 'opportunity'
            : 'stable'
  return { key, current, previous, positionDelta, impressionDelta, signal }
}
export function parseFilters(search: URLSearchParams): Filters {
  const days = search.get('days') === '7' ? 7 : 28
  const country = search.get('country') || 'mar'
  const device = search.get('device') || 'all'
  if (
    !/^(all|[a-z]{3})$/.test(country) ||
    !['all', 'MOBILE', 'DESKTOP', 'TABLET'].includes(device)
  )
    throw new Error('Filtres invalides.')
  const query = (search.get('query') || '').trim()
  const page = (search.get('page') || '').trim()
  const match = search.get('match') || 'contains'
  if (match !== 'contains' && match !== 'exact')
    throw new Error('Correspondance invalide.')
  if (query.length > 120 || page.length > 2048)
    throw new Error('Filtre trop long.')
  return { days, country, device, query, page, match }
}
export function makeReport(
  rows: SearchRow[],
  imports: ImportDay[],
  end: string,
  filters: Filters,
  truncated = false,
) {
  const start = shiftDay(end, 1 - filters.days)
  const previousEnd = shiftDay(start, -1)
  const previousStart = shiftDay(start, -filters.days)
  const wantedDays = daysBetween(previousStart, end)
  const completeDays = new Set(
    imports.filter((i) => !i.capped).map((i) => `${i.day}:${i.dataset}`),
  )
  const missing = wantedDays.flatMap((day) =>
    DATASETS.filter((d) => !completeDays.has(`${day}:${d}`)).map((dataset) => ({
      day,
      dataset,
    })),
  )
  const comparable = missing.length === 0 && !truncated
  const selected = rows.filter(
    (r) =>
      r.day >= previousStart &&
      r.day <= end &&
      (filters.country === 'all' || r.country === filters.country) &&
      (filters.device === 'all' || r.device === filters.device) &&
      (!filters.query ||
        (filters.match === 'exact'
          ? r.query.toLocaleLowerCase() === filters.query.toLocaleLowerCase()
          : r.query
              .toLocaleLowerCase()
              .includes(filters.query.toLocaleLowerCase()))) &&
      (!filters.page || r.page === filters.page),
  )
  const summaryDataset: Dataset = filters.page
    ? filters.query
      ? 'detail'
      : 'page'
    : filters.query
      ? 'query'
      : 'site'
  const summaryRows = selected.filter((r) => r.dataset === summaryDataset)
  const current = sumMetrics(summaryRows.filter((r) => r.day >= start))
  const previous = sumMetrics(summaryRows.filter((r) => r.day < start))
  const group = (field: 'query' | 'page', dataset: Dataset) => {
    const groups = new Map<string, SearchRow[]>()
    for (const row of selected.filter((r) => r.dataset === dataset)) {
      const list = groups.get(row[field]) ?? []
      list.push(row)
      groups.set(row[field], list)
    }
    return [...groups]
      .map(([key, rs]) =>
        comparison(
          key,
          sumMetrics(rs.filter((r) => r.day >= start)),
          sumMetrics(rs.filter((r) => r.day < start)),
          comparable,
        ),
      )
      .sort(
        (a, b) =>
          b.current.impressions +
          b.previous.impressions -
          (a.current.impressions + a.previous.impressions),
      )
  }
  const queries = group('query', filters.page ? 'detail' : 'query')
  const pages = group('page', filters.query ? 'detail' : 'page')
  const daily = daysBetween(start, end).map((day, i) => {
    const oldDay = shiftDay(previousStart, i)
    return {
      day,
      previousDay: oldDay,
      current: completeDays.has(`${day}:${summaryDataset}`)
        ? sumMetrics(summaryRows.filter((r) => r.day === day))
        : null,
      previous: completeDays.has(`${oldDay}:${summaryDataset}`)
        ? sumMetrics(summaryRows.filter((r) => r.day === oldDay))
        : null,
    }
  })
  return {
    filters,
    start,
    end,
    previousStart,
    previousEnd,
    current,
    previous,
    daily,
    queries,
    pages,
    comparable,
    missingSlices: missing.length,
    truncated,
    aggregation:
      summaryDataset === 'site' || summaryDataset === 'query'
        ? 'property'
        : 'page',
    detailed: summaryDataset !== 'site',
    alerts: queries
      .filter((r) => ['drop', 'unobserved', 'opportunity'].includes(r.signal))
      .slice(0, 12),
  }
}
export type SeoReport = ReturnType<typeof makeReport>

// A cell starting with an Excel formula must stay text after export.
export function csvCell(value: string | number | null) {
  let text = value === null ? '' : String(value)
  if (typeof value === 'string' && /^[\s]*[=+@\-]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export function reportCsv(rows: Comparison[]) {
  const header = [
    'Terme / URL',
    'Clics',
    'Clics précédents',
    'Impressions',
    'Impressions précédentes',
    'CTR',
    'Position moyenne',
    'Position précédente',
    'Écart position',
    'Signal',
  ]
  return (
    '\uFEFF' +
    [
      header,
      ...rows.map((r) => [
        r.key,
        r.current.clicks,
        r.previous.clicks,
        r.current.impressions,
        r.previous.impressions,
        r.current.ctr,
        r.current.position,
        r.previous.position,
        r.positionDelta,
        r.signal,
      ]),
    ]
      .map((r) => r.map(csvCell).join(';'))
      .join('\r\n')
  )
}
