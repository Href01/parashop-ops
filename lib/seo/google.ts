import { GoogleAuth } from 'google-auth-library'
import { readFile } from 'node:fs/promises'
import { DIMENSIONS, type Dataset, type SearchRow } from './model'

export const PROPERTY = 'sc-domain:shinecosmetics.ma'
export const SITE = 'https://www.shinecosmetics.ma'
export const READ_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
export class SeoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message)
  }
}
export function connectionStatus() {
  return {
    configured: Boolean(
      process.env.GSC_CLIENT_EMAIL &&
        (process.env.GSC_PRIVATE_KEY || process.env.GSC_PRIVATE_KEY_FILE),
    ),
    account: process.env.GSC_CLIENT_EMAIL || null,
    property: PROPERTY,
    cronConfigured: Boolean(process.env.CRON_SECRET),
  }
}
type ApiRow = {
  keys?: string[]
  clicks: number
  impressions: number
  position: number
}
export type QueryResponse = { rows?: ApiRow[] }
export type GoogleRequest = (
  body: Record<string, unknown>,
) => Promise<QueryResponse>

export async function readPrivateKey(
  env: Record<string, string | undefined> = process.env,
  read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
) {
  // The path comes only from server configuration, never from a request.
  if (env.GSC_PRIVATE_KEY?.trim()) return env.GSC_PRIVATE_KEY.replace(/\\n/g, '\n')
  if (env.GSC_PRIVATE_KEY_FILE) {
    try {
      const key = await read(env.GSC_PRIVATE_KEY_FILE)
      if (key.trim()) return key
    } catch {
      // Filesystem errors can contain the secret's location. Keep them server-private.
    }
  }
  throw new SeoError('key_unavailable', 'La clé Google est indisponible côté serveur. Vérifiez la configuration Ops.', 503)
}

async function readClient() {
  if (!connectionStatus().configured)
    throw new SeoError(
      'not_configured',
      'Connectez le compte de service Google en lecture seule avant de synchroniser.',
      409,
    )
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GSC_CLIENT_EMAIL,
      private_key: await readPrivateKey(),
    },
    scopes: [READ_SCOPE],
  })
  return auth.getClient()
}

export async function getGoogleRequest(deadline = Infinity): Promise<GoogleRequest> {
  const client = await readClient()
  return async (body) => {
    const remaining = deadline - Date.now()
    if (remaining < 1000)
      throw new SeoError('sync_budget', 'Temps de collecte atteint. Les journées validées sont conservées ; relancez pour poursuivre.')
    try {
      const response = await client.request<QueryResponse>({
        url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`,
        method: 'POST',
        data: body,
        timeout: Math.min(20_000, remaining),
        retry: false,
      })
      return response.data
    } catch (error: unknown) {
      // Never persist/return Google's error object: it can contain request credentials.
      const status = (error as { response?: { status?: number } }).response
        ?.status
      if (status === 401 || status === 403)
        throw new SeoError(
          'google_access',
          'Google refuse l’accès. Vérifiez la clé, l’API Search Console et l’accès à la propriété.',
          403,
        )
      if (status === 429)
        throw new SeoError(
          'google_quota',
          'Quota Google atteint. La reprise conservera les journées déjà importées.',
          429,
        )
      throw new SeoError(
        'google_unavailable',
        'Google est indisponible ou la requête a expiré. Les données précédentes sont conservées.',
      )
    }
  }
}

export const PRIORITY_URLS = [
  '/',
  '/marques/olaplex',
  '/marques/milk-shake',
  '/k-beauty',
].map((path) => `${SITE}${path}`)
export type IndexCheck = {
  url: string
  verdict: string | null
  coverage: string | null
  lastCrawl: string | null
  googleCanonical: string | null
  declaredCanonical: string | null
  error: string | null
}
type InspectionResponse = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      lastCrawlTime?: string
      googleCanonical?: string
      userCanonical?: string
    }
  }
}
export function normalizeInspection(
  url: string,
  response: InspectionResponse,
): IndexCheck {
  const value = response.inspectionResult?.indexStatusResult
  return {
    url,
    verdict: value?.verdict ?? null,
    coverage: value?.coverageState ?? null,
    lastCrawl: value?.lastCrawlTime ?? null,
    googleCanonical: value?.googleCanonical ?? null,
    declaredCanonical: value?.userCanonical ?? null,
    error: value ? null : 'Google n’a pas fourni de résultat d’indexation.',
  }
}
export async function inspectPriorityUrls(
  deadline: number,
): Promise<IndexCheck[]> {
  if (!connectionStatus().configured) return []
  const client = await readClient()
  const results: IndexCheck[] = []
  for (const url of PRIORITY_URLS) {
    try {
      if (deadline - Date.now() < 1500) throw new Error('deadline')
      const response = await client.request<InspectionResponse>({
        url: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
        method: 'POST',
        data: { inspectionUrl: url, siteUrl: PROPERTY, languageCode: 'fr-FR' },
        timeout: Math.min(12_000, deadline - Date.now()),
        retry: false,
      })
      results.push(normalizeInspection(url, response.data))
    } catch {
      results.push({
        ...normalizeInspection(url, {}),
        error:
          'Inspection indisponible : vérifier les droits Google, le quota ou relancer.',
      })
    }
  }
  return results
}

export async function fetchDay(
  request: GoogleRequest,
  day: string,
  dataset: Dataset,
) {
  const dimensions = DIMENSIONS[dataset]
  const rows: SearchRow[] = []
  const seen = new Set<string>()
  // Search Console exposes at most 50k rows/day/type. A cap is not completeness.
  for (let offset = 0; offset < 50_000; offset += 25_000) {
    const response = await request({
      startDate: day,
      endDate: day,
      dimensions,
      type: 'web',
      dataState: 'final',
      aggregationType:
        dataset === 'site' || dataset === 'query' ? 'byProperty' : 'byPage',
      rowLimit: 25_000,
      startRow: offset,
    })
    const batch = response.rows ?? []
    for (const row of batch) {
      if (
        !Array.isArray(row.keys) ||
        row.keys.length !== dimensions.length ||
        row.keys.some((k) => typeof k !== 'string') ||
        ![row.clicks, row.impressions, row.position].every(
          (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
        )
      ) {
        throw new SeoError(
          'invalid_google_data',
          'Réponse Google invalide : journée non enregistrée.',
        )
      }
      const key = JSON.stringify(row.keys)
      if (seen.has(key))
        throw new SeoError(
          'duplicate_google_data',
          'Pagination Google incohérente : journée non enregistrée.',
        )
      seen.add(key)
      const fields = Object.fromEntries(
        dimensions.map((d, i) => [d, row.keys![i]]),
      )
      rows.push({
        day,
        dataset,
        query: fields.query || '',
        page: fields.page || '',
        country: fields.country || '',
        device: fields.device || '',
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      })
    }
    if (batch.length < 25_000) return { rows, capped: false }
  }
  return { rows, capped: true }
}

export async function latestFinalDay(
  request: GoogleRequest,
  start: string,
  end: string,
) {
  const response = await request({
    startDate: start,
    endDate: end,
    dimensions: ['date'],
    type: 'web',
    dataState: 'final',
    rowLimit: 100,
  })
  const dates = (response.rows ?? [])
    .map((r) => r.keys?.[0])
    .filter(
      (d): d is string =>
        !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= start && d <= end,
    )
  return dates.sort().at(-1) ?? null
}
