/**
 * CLIENT GOOGLE ADS (API REST, lecture) — le minimum pour rapatrier la depense.
 *
 * Pas de jeton developpeur : Google les a supprimes le 9/09/2026, l'acces se
 * rattache au projet Cloud (`x-goog-user-project`). Pas de compte gestionnaire
 * (MCC) non plus : on interroge le compte directement ; si un MCC est ajoute un
 * jour, GOOGLE_ADS_LOGIN_CUSTOMER_ID suffit.
 *
 * Variables (Vercel, sensibles) : GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_CLIENT_ID,
 * GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_PROJECT_ID.
 * Sans elles, rien ne s'execute et rien ne casse.
 */

const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v23'
const TIMEOUT_MS = 25_000

export function googleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_CUSTOMER_ID && process.env.GOOGLE_ADS_CLIENT_ID
    && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REFRESH_TOKEN
    && process.env.GOOGLE_ADS_PROJECT_ID,
  )
}

let cached: { token: string; expiresAt: number } | null = null

/** Jeton d'acces (1 h) tire du jeton de rafraichissement, garde en memoire entre deux appels. */
export async function googleAdsAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null
  if (!res.ok || !json?.access_token) {
    // invalid_grant = jeton revoque ou expire : il faut en regenerer un (script de connexion).
    throw new Error(`Google OAuth: ${json?.error || res.status}${json?.error_description ? ` — ${json.error_description}` : ''}`)
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return cached.token
}

type SearchResponse<T> = { results?: T[]; nextPageToken?: string; error?: { message?: string } }

/** Requete GAQL, toutes les pages. */
export async function googleAdsSearch<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const token = await googleAdsAccessToken()
  const customer = String(process.env.GOOGLE_ADS_CUSTOMER_ID).replace(/\D/g, '')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-goog-user-project': process.env.GOOGLE_ADS_PROJECT_ID || '',
  }
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, '')
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers['developer-token'] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN

  const out: T[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${customer}/googleAds:search`, {
      method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
      // Pas de pageSize : l'API v21+ le refuse (400 INVALID_ARGUMENT), la taille de page est fixe.
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    })
    const json = await res.json().catch(() => null) as SearchResponse<T> | null
    if (!res.ok) throw new Error(`Google Ads API ${res.status}: ${json?.error?.message || 'erreur'}`)
    out.push(...(json?.results ?? []))
    pageToken = json?.nextPageToken
    if (!pageToken) break
  }
  return out
}
