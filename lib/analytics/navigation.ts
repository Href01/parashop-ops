const isSeo = (path: string) =>
  path === '/analytics/seo' || path.startsWith('/analytics/seo/')

export function analyticsModuleHref(from: string, to: string, search: string) {
  // Google and first-party analytics use different device/country values and
  // date semantics. Never carry their segments across that boundary.
  if (isSeo(from) !== isSeo(to) || !search) return to
  return `${to}?${search.replace(/^\?/, '')}`
}
