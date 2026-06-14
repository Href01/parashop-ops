/**
 * One-time Instagram setup helper.
 *
 * Turns a short-lived token (from the Graph API Explorer) into the two values
 * the sync needs: a 60-day long-lived token + your IG Business account id.
 *
 * Usage (run locally — nothing is committed, no secrets stored):
 *   node scripts/ig-setup.js <APP_ID> <APP_SECRET> <SHORT_LIVED_TOKEN>
 *
 * It prints IG_USER_ID and IG_ACCESS_TOKEN — paste those into Vercel env.
 */

const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || 'v21.0'}`

async function getJson(url) {
  const r = await fetch(url)
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`)
  return j
}

async function main() {
  const [appId, appSecret, shortToken] = process.argv.slice(2)
  if (!appId || !appSecret || !shortToken) {
    console.error('Usage: node scripts/ig-setup.js <APP_ID> <APP_SECRET> <SHORT_LIVED_TOKEN>')
    process.exit(1)
  }

  // 1) Exchange short-lived → long-lived token (~60 days)
  console.log('→ Échange du token (longue durée)…')
  const exch = await getJson(
    `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken)}`
  )
  const longToken = exch.access_token
  const expiresDays = exch.expires_in ? Math.round(exch.expires_in / 86400) : '~60'

  // 2) Find the Page(s) and their linked Instagram Business account
  console.log('→ Recherche du compte Instagram Business…')
  const pages = await getJson(`${GRAPH}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(longToken)}`)
  const withIg = (pages.data || []).filter((p) => p.instagram_business_account)

  if (withIg.length === 0) {
    console.error('\n❌ Aucun compte Instagram Business lié à tes Pages.')
    console.error('   Vérifie : compte Insta en Business/Creator + lié à une Page Facebook.')
    process.exit(1)
  }

  console.log('\n=================== À METTRE DANS VERCEL ===================')
  for (const p of withIg) {
    console.log(`\nPage : ${p.name}`)
    console.log(`IG_USER_ID=${p.instagram_business_account.id}`)
  }
  console.log(`\nIG_ACCESS_TOKEN=${longToken}`)
  console.log(`\n(token valable ${expiresDays} jours)`)
  console.log('===========================================================')
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
