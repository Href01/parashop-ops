/**
 * Tell the public site to drop its cached product data after a stock / product
 * mutation in the back-office.
 *
 * BOS and the site (www.shinecosmetics.ma) are separate Vercel deployments over
 * ONE shared database. BOS writing `Product.stock` is instant in the DB, but the
 * site caches product pages (`unstable_cache` + ISR `revalidate: 60`), so a manual
 * adjustment wouldn't show for up to a minute. This pings the site's `/api/revalidate`
 * webhook to refresh the 'products' tag right away.
 *
 * Fire-and-forget: it must NEVER block or fail the mutation. A missing secret or a
 * network error just falls back to the site's normal 60s revalidation.
 */
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://www.shinecosmetics.ma'

export async function revalidateWebsite(tags: string[] = ['products']): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) return
  try {
    await fetch(`${WEBSITE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags }),
      cache: 'no-store',
    })
  } catch (error) {
    console.error('[revalidate-website] failed (site will self-refresh in ~60s):', error)
  }
}
