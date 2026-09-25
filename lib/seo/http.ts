import { timingSafeEqual } from 'node:crypto'
export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}
export function cronAuthorized(
  request: Request,
  secret = process.env.CRON_SECRET,
) {
  if (!secret) return false
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return origin === new URL(request.url).origin
}
