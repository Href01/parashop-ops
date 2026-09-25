import test from 'node:test'
import assert from 'node:assert/strict'
import {
  auditTechnical,
  inspectHtml,
  publicSiteUrl,
} from '../../lib/seo/technical'
import { cronAuthorized, sameOrigin } from '../../lib/seo/http'
const base = 'https://www.shinecosmetics.ma'
test('audit cannot fetch off-site, private services, credentials, or sensitive routes', () => {
  for (const url of [
    'http://127.0.0.1',
    'https://evil.test/',
    'https://www.shinecosmetics.ma.evil.test',
    `${base}/api/orders`,
    `${base}/ar/admin`,
    `${base}/%2e%2e/api/x`,
    `https://user:pass@www.shinecosmetics.ma/`,
    `${base}/?token=secret`,
  ])
    assert.equal(publicSiteUrl(url), null, url)
  assert.equal(
    publicSiteUrl(`${base}/marques/olaplex`),
    `${base}/marques/olaplex`,
  )
})
test('HTML parser detects noindex, x-robots, wrong canonical, missing headings', () => {
  const r = inspectHtml(
    base + '/',
    200,
    `<html><title>Shine</title><meta name="description" content="Soins"><link href="${base}/other" rel="canonical"><h1>Shine</h1></html>`,
    'noindex',
  )
  assert.ok(r.issues.includes('URL du sitemap non indexable (noindex)'))
  assert.ok(r.issues.includes('Canonique différente de l’URL du sitemap'))
})
test('404 and redirect are not mistaken for healthy pages', () => {
  assert.deepEqual(inspectHtml(base + '/x', 404, '').issues, ['HTTP 404'])
  assert.match(
    inspectHtml(base + '/x', 308, '', '', '/y').issues[0],
    /Redirection/,
  )
})
test('health distinguishes failed sitemap from a zero-error audit', async () => {
  const r = await auditTechnical(
    Date.now() + 5000,
    async () => new Response('', { status: 500 }),
  )
  assert.equal(r.complete, false)
  assert.ok(r.sitemapError)
  assert.equal(r.checked, 0)
})
test('audit inspects only sitemap URLs and never follows redirects', async () => {
  const calls: string[] = []
  const r = await auditTechnical(Date.now() + 5000, async (url, init) => {
    calls.push(String(url))
    assert.equal(init?.redirect, 'manual')
    if (String(url).endsWith('sitemap.xml'))
      return new Response(
        `<urlset><url><loc>${base}/marques/olaplex</loc></url><url><loc>https://evil.test/</loc></url></urlset>`,
      )
    return new Response('', {
      status: 302,
      headers: { location: 'http://127.0.0.1/' },
    })
  })
  assert.equal(calls.length, 2)
  assert.equal(r.discovered, 2)
  assert.equal(r.checked, 1)
  assert.equal(r.complete, false)
})
test('cron fails closed without the correct secret', () => {
  assert.equal(cronAuthorized(new Request(base), ''), false)
  assert.equal(
    cronAuthorized(
      new Request(base, { headers: { authorization: 'Bearer wrong' } }),
      'secret',
    ),
    false,
  )
  assert.equal(
    cronAuthorized(
      new Request(base, { headers: { authorization: 'Bearer secret' } }),
      'secret',
    ),
    true,
  )
})

test('homepage with or without trailing slash is one healthy public URL', async () => {
  const calls: string[] = []
  const r = await auditTechnical(Date.now() + 5000, async (url) => {
    calls.push(String(url))
    if (String(url).endsWith('sitemap.xml'))
      return new Response(
        `<urlset><url><loc>${base}</loc></url><url><loc>${base}/</loc></url></urlset>`,
      )
    return new Response(
      `<html><title>Shine</title><meta name="description" content="Soins"><link href="${base}" rel="canonical"><h1>Shine</h1></html>`,
    )
  })
  assert.deepEqual(calls, [`${base}/sitemap.xml`, `${base}/`])
  assert.equal(r.discovered, 1)
  assert.equal(r.checked, 1)
  assert.equal(r.healthy, 1)
  assert.equal(r.complete, true)
  assert.deepEqual(r.issues, [])
})
test('manual synchronization requires a same-origin request', () => {
  assert.equal(
    sameOrigin(new Request(base, { headers: { origin: base } })),
    true,
  )
  assert.equal(
    sameOrigin(new Request(base, { headers: { origin: 'https://evil.test' } })),
    false,
  )
  assert.equal(sameOrigin(new Request(base)), false)
})
