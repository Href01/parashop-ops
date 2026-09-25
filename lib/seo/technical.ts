import * as cheerio from 'cheerio'
import { SITE, type IndexCheck } from './google'

export type PageCheck = {
  url: string
  status: number | null
  canonical: string | null
  title: string | null
  issues: string[]
}
export type TechnicalReport = {
  indexing?: IndexCheck[]
  checkedAt: string
  discovered: number
  checked: number
  complete: boolean
  issues: PageCheck[]
  healthy: number
  sitemapError: string | null
}
export function reusableAudit(report: TechnicalReport | null, now = Date.now()) {
  if (!report?.complete || !report.indexing?.length || report.indexing.some((item) => item.error)) return false
  const age = now - Date.parse(report.checkedAt)
  return age >= 0 && age < 60 * 60 * 1000
}
export function publicSiteUrl(value: string): string | null {
  try {
    const u = new URL(value, SITE)
    if (
      u.origin !== SITE ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      /%(?:2f|5c|2e)/i.test(u.pathname) ||
      /^\/(?:ar\/)?(?:api|admin|auth|account|checkout|mockup)(?:\/|$)/i.test(
        u.pathname,
      )
    )
      return null
    return u.href
  } catch {
    return null
  }
}
async function boundedText(response: Response, limit = 2_000_000) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('body_limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks).toString('utf8')
}
export function inspectHtml(
  url: string,
  status: number,
  html: string,
  xRobots = '',
  location: string | null = null,
): PageCheck {
  const $ = cheerio.load(html)
  const canonicals = $('link[rel="canonical"]')
  const canonical = canonicals.first().attr('href') || null
  const title = $('title').first().text().trim() || null
  const robots =
    $('meta[name="robots"]')
      .map((_, e) => $(e).attr('content'))
      .get()
      .join(' ') +
    ' ' +
    xRobots
  const issues: string[] = []
  if (status >= 300 && status < 400)
    issues.push(
      `Redirection dans le sitemap${location ? ` → ${location}` : ''}`,
    )
  else if (status !== 200) issues.push(`HTTP ${status}`)
  if (status === 200) {
    if (/\b(noindex|none)\b/i.test(robots))
      issues.push('URL du sitemap non indexable (noindex)')
    if (!title) issues.push('Titre absent')
    if (!$('meta[name="description"]').attr('content')?.trim())
      issues.push('Description absente')
    if ($('h1').length !== 1)
      issues.push(`${$('h1').length} H1 dans le HTML initial`)
    if (canonicals.length !== 1)
      issues.push(`${canonicals.length} URL canonique`)
    else {
      try {
        if (new URL(canonical!, url).href !== new URL(url).href)
          issues.push('Canonique différente de l’URL du sitemap')
      } catch {
        issues.push('Canonique invalide')
      }
    }
  }
  return { url, status, canonical, title, issues }
}
export async function auditTechnical(
  deadline = Date.now() + 100_000,
  fetcher: typeof fetch = fetch,
): Promise<TechnicalReport> {
  const report: TechnicalReport = {
    checkedAt: new Date().toISOString(),
    discovered: 0,
    checked: 0,
    complete: false,
    issues: [],
    healthy: 0,
    sitemapError: null,
  }
  const read = async (url: string) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('deadline')
    return fetcher(url, {
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        'User-Agent': 'ShineOps-SEO/1.0 (+https://www.shinecosmetics.ma)',
      },
      signal: AbortSignal.timeout(Math.min(12_000, remaining)),
    })
  }
  try {
    const response = await read(`${SITE}/sitemap.xml`)
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error('sitemap_status')
    }
    const $ = cheerio.load(await boundedText(response), { xmlMode: true })
    // Current storefront uses a urlset. Fail explicitly if its format changes.
    if (!$('urlset').length) throw new Error('sitemap_format')
    const raw = $('url > loc')
      .map((_, el) => $(el).text().trim())
      .get()
    if (!raw.length) throw new Error('empty_sitemap')
    // Equivalent spellings (notably the homepage without a trailing slash)
    // identify the same public URL. Normalize before deduplicating, but keep
    // rejected entries visible in the report and never fetch them.
    const urls = [...new Set(raw.map((url) => publicSiteUrl(url) ?? url))]
    report.discovered = urls.length
    const valid = urls.filter((u) => {
      if (publicSiteUrl(u)) return true
      report.issues.push({
        url: u.slice(0, 2048),
        status: null,
        canonical: null,
        title: null,
        issues: ['URL hors périmètre public : non explorée'],
      })
      return false
    })
    let cursor = 0
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (
          cursor < Math.min(valid.length, 300) &&
          Date.now() < deadline - 500
        ) {
          const url = valid[cursor++]
          try {
            const response = await read(url)
            const html =
              response.status === 200 ? await boundedText(response) : ''
            if (response.status !== 200) await response.body?.cancel()
            const page = inspectHtml(
              url,
              response.status,
              html,
              response.headers.get('x-robots-tag') || '',
              response.headers.get('location'),
            )
            if (page.issues.length) report.issues.push(page)
            else report.healthy++
          } catch {
            report.issues.push({
              url,
              status: null,
              canonical: null,
              title: null,
              issues: [
                'Contrôle incomplet : délai réseau ou HTML trop volumineux',
              ],
            })
          }
          report.checked++
        }
      }),
    )
    report.complete =
      report.checked === urls.length &&
      !report.issues.some((p) => p.status === null)
  } catch {
    report.sitemapError =
      'Sitemap inaccessible, vide ou format non pris en charge. Aucun bilan global de santé ne peut être déduit.'
  }
  return report
}
