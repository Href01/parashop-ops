#!/usr/bin/env node
/**
 * LES VRAIES ETAPES DU SITE, pour le plan « site » des Reels.
 *
 * Pour chaque produit : la fiche (on touchera « Ajouter au panier »), le panier
 * (« Livraison → ») et la livraison (« Confirmer la commande »), captures sur
 * shinecosmetics.ma en mobile (390x844, x2), comme une cliente les voit.
 *
 * Rien n'est soumis ni rempli : le formulaire reste vide, aucune commande, aucun
 * lead. Le suivi est bloque (/api/events, /api/track, pixels) : pas de fausse
 * visite ni de faux ajout au panier dans les statistiques. Le panier vit dans
 * le navigateur jetable de la capture.
 *
 * Usage (depuis parashop-ops, Chrome installe) :
 *   node scripts/ads/captures-site.mjs 111 117      des produits
 *   node scripts/ads/captures-site.mjs --packs      tous les packs actifs
 *   node scripts/ads/captures-site.mjs --tous       tout le catalogue en vente
 * Les captures vont sur Cloudinary (shine-ads/site) et dans "AdsSiteCapture"
 * (une ligne par produit et par ecran, remplacee a chaque passage).
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local', quiet: true })
require('dotenv').config({ path: '.env', quiet: true })
const { Pool } = require('pg')

const SITE = process.env.SHOP_URL || 'https://www.shinecosmetics.ma'
const VUE = { width: 390, height: 844 }
const SUIVI = /\/api\/(events|track|analytics\/product-views)|facebook|fbevents|google-analytics|googletagmanager|tiktok|clarity|hotjar|doubleclick/i

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const args = process.argv.slice(2)

async function produitsVoulus() {
  if (args.includes('--tous')) {
    return (await pool.query(`SELECT id, price::float AS prix FROM "Product" WHERE active AND NOT coalesce(discontinued, false)
      AND (coalesce(stock, 0) + coalesce("virtualStock", 0)) > 0 ORDER BY id`)).rows
  }
  if (args.includes('--packs')) {
    return (await pool.query(`SELECT p.id, p.price::float AS prix FROM "Bundle" b JOIN "Product" p ON p.id = b."productId" WHERE b.active AND p.active ORDER BY p.id`)).rows
  }
  const ids = args.map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (!ids.length) throw new Error('Donne des ids de produit, --packs ou --tous.')
  return (await pool.query(`SELECT id, price::float AS prix FROM "Product" WHERE id = ANY($1::int[]) ORDER BY id`, [ids])).rows
}

async function versCloudinary(png, publicId) {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME, cle = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!nuage || !cle || !secret) throw new Error('CLOUDINARY_* absentes de .env.local.')
  const params = { folder: 'shine-ads/site', overwrite: 'true', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  const f = new FormData()
  f.append('file', `data:image/png;base64,${png.toString('base64')}`)
  for (const [k, v] of Object.entries(params)) f.append(k, v)
  f.append('api_key', cle); f.append('signature', signature)
  const r = await fetch(`https://api.cloudinary.com/v1_1/${nuage}/image/upload`, { method: 'POST', body: f, signal: AbortSignal.timeout(60_000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.secure_url) throw new Error(`Cloudinary : ${j.error?.message || r.status}`)
  return { url: j.secure_url, publicId: j.public_id, largeur: j.width, hauteur: j.height }
}

/** Le bouton, en fractions de la vue ; null s'il n'est pas visible dans l'ecran capture. */
async function cible(bouton) {
  const b = await bouton.boundingBox()
  if (!b || b.y < 0 || b.y + b.height > VUE.height) return null
  return { x: b.x / VUE.width, y: b.y / VUE.height, w: b.width / VUE.width, h: b.height / VUE.height }
}

async function capturer(nav, produit) {
  const ctx = await nav.newContext({ viewport: VUE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' })
  await ctx.route(SUIVI, (r) => r.abort())
  // Le popup de bienvenue attendrait devant le bouton : on le dit deja vu.
  await ctx.addInitScript(() => { try { localStorage.setItem('shine_welcome_seen', JSON.stringify({ ts: Date.now() })) } catch { /* rien */ } })
  const page = await ctx.newPage()
  const ecrans = []
  try {
    await page.goto(`${SITE}/products/${produit.id}`, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForTimeout(2500)
    // 1. La fiche : le prix et « Ajouter au panier » au milieu de l'ecran.
    const ajouter = page.getByText('Ajouter au panier', { exact: true }).first()
    await ajouter.waitFor({ timeout: 20_000 })
    const haut = await ajouter.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 844 * 0.6)), haut)
    await page.waitForTimeout(900)
    ecrans.push({ etape: 'produit', png: await page.screenshot(), cible: await cible(ajouter), bouton: 'Ajouter au panier' })
    // 2. Le panier (01 Mon panier) : « Livraison → ».
    await ajouter.click()
    const livraison = page.getByRole('button', { name: /^Livraison/ }).last()
    await livraison.waitFor({ timeout: 15_000 })
    await page.waitForTimeout(1200)
    ecrans.push({ etape: 'panier', png: await page.screenshot(), cible: await cible(livraison), bouton: 'Livraison →' })
    // 3. La livraison (02 Où vous livrer ?) : « Confirmer la commande » — jamais touche.
    await livraison.click()
    const confirmer = page.getByRole('button', { name: /^Confirmer la commande$/ }).last()
    await confirmer.waitFor({ timeout: 15_000 })
    await page.waitForTimeout(1200)
    ecrans.push({ etape: 'livraison', png: await page.screenshot(), cible: await cible(confirmer), bouton: 'Confirmer la commande' })
  } finally {
    await ctx.close()
  }
  return ecrans
}

const produits = await produitsVoulus()
const nav = await chromium.launch({ channel: 'chrome' })
let ok = 0
for (const p of produits) {
  try {
    const ecrans = await capturer(nav, p)
    for (const e of ecrans) {
      if (!e.cible) throw new Error(`${e.etape} : le bouton « ${e.bouton} » n'est pas visible dans l'écran capturé`)
      const u = await versCloudinary(e.png, `produit-${p.id}-${e.etape}`)
      await pool.query(
        `INSERT INTO "AdsSiteCapture" (product_id, etape, url, public_id, largeur, hauteur, cible, bouton, prix, capture_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now())
         ON CONFLICT (product_id, etape) DO UPDATE SET url = EXCLUDED.url, public_id = EXCLUDED.public_id, largeur = EXCLUDED.largeur, hauteur = EXCLUDED.hauteur,
           cible = EXCLUDED.cible, bouton = EXCLUDED.bouton, prix = EXCLUDED.prix, capture_le = now()`,
        [p.id, e.etape, u.url, u.publicId, u.largeur, u.hauteur, JSON.stringify(e.cible), e.bouton, p.prix])
    }
    ok++
    console.log(`#${p.id} : ${ecrans.map((e) => e.etape).join(', ')}`)
  } catch (e) {
    console.log(`#${p.id} : ÉCHEC — ${e.message}`)
  }
}
await nav.close()
await pool.end()
console.log(`${ok}/${produits.length} produit(s) capturé(s).`)
