import assert from 'node:assert/strict'
import test from 'node:test'

import { countFunnel, FUNNEL_PAR_DEFAUT } from '@/lib/analytics/funnel'
import { AGENTS_AUTOMATISES, robotSessionSql, sessionSansAchatSql } from '@/lib/analytics/automated-rules'
import { DIMENSIONS, MESURES, DERIVEES, nomCampagneSql } from '@/lib/analytics/model'
import {
  MEDIUMS_PAYANTS, PAID_CHANNELS, isPaidChannel, acquisitionChannelSql, sessionChannelSql,
  SESSION_BOT_FILTER_CLAUSE, SESSION_HUMAN_FILTER_CLAUSE, PAGEVIEW_HUMAN_FILTER_CLAUSE,
} from '@/lib/analytics/metrics'
import { ETAPES } from '@/app/api/ops/analytics/analyses/route'
import { calculerEcart } from '@/lib/analytics/ecart'

/* Audit du 2026-10-29 : chaque test reprend un constat chiffre sur la base reelle. */

// ── 1. L'ENTONNOIR QUI AFFICHAIT 0 % ────────────────────────────────────────
// Ordre relevé sur les 12 sessions qui ont acheté en 30 jours : 12 sur 12.
const SESSION_REELLE = [
  'PRODUCT_VIEW_DETAIL', 'PRODUCT_ADD_TO_CART', 'BEGIN_CHECKOUT',
  'CHECKOUT_SUBMIT_ATTEMPT', 'ADD_PAYMENT_INFO', 'OTP_VERIFIED', 'PURCHASE_SUCCESS',
]
const evenements = (noms: string[], sessionId = 's1') =>
  noms.map((name, i) => ({ sessionId, name, at: new Date(Date.UTC(2026, 9, 20, 12, 0, i * 10)), dansPeriode: true }))

test("l'entonnoir par défaut suit l'ordre réel du checkout et atteint la commande acceptée", () => {
  const etapes = countFunnel(evenements(SESSION_REELLE), [...FUNNEL_PAR_DEFAUT], 1440)
  assert.deepEqual(etapes.map((e) => e.sessions), [1, 1, 1, 1, 1, 1, 1])
  assert.equal(etapes[etapes.length - 1].evenement, 'PURCHASE_SUCCESS')
})

test("l'ancien défaut (coordonnées AVANT l'envoi, arrêt avant l'achat) comptait 0 : il faut le prouver, pas le supposer", () => {
  const ancien = ['PRODUCT_VIEW_DETAIL', 'PRODUCT_ADD_TO_CART', 'BEGIN_CHECKOUT', 'ADD_PAYMENT_INFO', 'CHECKOUT_SUBMIT_ATTEMPT']
  const etapes = countFunnel(evenements(SESSION_REELLE), ancien, 1440)
  assert.equal(etapes[3].sessions, 1, 'les coordonnées sont bien atteintes')
  assert.equal(etapes[4].sessions, 0, "l'envoi survient AVANT les coordonnées : l'entonnoir séquentiel ne le voit jamais")
})

test('toutes les étapes par défaut sont dans la liste blanche et portent un libellé honnête', () => {
  for (const e of FUNNEL_PAR_DEFAUT) assert.ok(e in ETAPES, `${e} absent du catalogue`)
  assert.doesNotMatch(ETAPES.CHECKOUT_SUBMIT_ATTEMPT, /envoy/i, "c'est un clic, pas une commande envoyée")
  assert.match(ETAPES.PURCHASE_SUCCESS, /acceptée/)
})

// ── 2. LA PUB META RANGEE EN ORGANIQUE ──────────────────────────────────────
test("paid_social et cpc sont des médiums payants, pas seulement 'paid'", () => {
  for (const m of ['paid', 'paid_social', 'cpc', 'ppc']) assert.ok((MEDIUMS_PAYANTS as readonly string[]).includes(m), m)
  assert.ok(!(MEDIUMS_PAYANTS as readonly string[]).includes('referral'), "un lien de renvoi reste de l'organique")
  assert.ok(!(MEDIUMS_PAYANTS as readonly string[]).includes('social'), "un post organique reste de l'organique")
})

test('les mêmes règles classent les sessions et les commandes, et Google Ads passe avant Recherche', () => {
  for (const sql of [sessionChannelSql('s'), acquisitionChannelSql('o', 's')]) {
    assert.ok(sql.includes("'paid_social'"), 'paid_social reconnu')
    assert.ok(sql.includes("'Google Ads'"), 'canal Google Ads')
    assert.ok(sql.indexOf("'Google Ads'") < sql.indexOf("'Recherche'"), "google / cpc ne doit pas tomber dans la recherche gratuite")
    assert.ok(sql.indexOf("'Instagram Ads'") < sql.indexOf("'Instagram (organique)'"))
    assert.ok(sql.includes("'WhatsApp (lien)'") && sql.includes("'Messenger Ads'"))
  }
})

test('tous les canaux qui coûtent du budget comptent comme payants', () => {
  for (const c of ['Instagram Ads', 'Facebook Ads', 'Google Ads', 'Audience Network', 'Threads Ads', 'Messenger Ads', 'Pub Snapchat']) {
    assert.ok(isPaidChannel(c), c)
  }
  for (const c of ['Recherche', 'Direct', 'Instagram (organique)', 'Facebook (organique)', 'Instagram (DM)', 'WhatsApp (lien)']) {
    assert.ok(!isPaidChannel(c), c)
  }
  assert.ok(PAID_CHANNELS.includes('Google Ads'))
})

// ── 3. DEUX DÉFINITIONS D'UN VISITEUR ───────────────────────────────────────
test("le motif « bot » est une vraie limite de mot PostgreSQL (l'ancien '\\ybot\\y' valait « ybooty »)", () => {
  assert.ok(AGENTS_AUTOMATISES.includes('\\ybot\\y'))
  assert.ok(robotSessionSql('s').includes('\\ybot\\y'))
  assert.ok(!robotSessionSql('s').includes('ybooty'))
})

test("la relecture des annonces Google est un robot ; une session avec panier ou commande n'en est jamais un", () => {
  assert.ok(robotSessionSql('s').includes('google-adwords'))
  assert.ok(robotSessionSql('s').includes('Council Bluffs'))
  const garde = sessionSansAchatSql('s')
  assert.ok(garde.includes('PRODUCT_ADD_TO_CART') && garde.includes('PURCHASE_SUCCESS'))
  assert.ok(garde.includes('"Order"'), 'une commande liée protège la session')
})

test("les rapports retirent les robots que 'isBot' ne connaît pas ; la page Sessions garde le filtre natif", () => {
  assert.ok(SESSION_HUMAN_FILTER_CLAUSE.includes(SESSION_BOT_FILTER_CLAUSE.trim()), 'le filtre humain INCLUT le natif')
  assert.ok(SESSION_HUMAN_FILTER_CLAUSE.includes('google-adwords'))
  assert.ok(!SESSION_BOT_FILTER_CLAUSE.includes('google-adwords'), "le filtre natif reste tel quel : le bouton « inclure le trafic automatisé » en dépend")
  assert.ok(PAGEVIEW_HUMAN_FILTER_CLAUSE.includes('"PageView"."sessionId"') && PAGEVIEW_HUMAN_FILTER_CLAUSE.includes('google-adwords'))
})

// ── 4. LA CAMPAGNE : LA CLÉ QUI RELIE DÉPENSE ET RÉSULTAT ────────────────────
test("la dimension campagne existe dans les cinq sources, dont la dépense", () => {
  const d = DIMENSIONS.campagne
  assert.ok(d, 'dimension campagne')
  for (const source of ['commandes', 'pages', 'sessions', 'evenements', 'pub'] as const) assert.ok(d.sql[source], source)
})

test("un identifiant et un nom en dur se ramènent au même nom ; les espaces sont normalisés", () => {
  const sql = nomCampagneSql('s."utmCampaign"')
  assert.ok(sql.includes('"AdSpendDaily"') && sql.includes('"externalId" = s."utmCampaign"'), 'identifiant → nom')
  assert.ok(sql.includes("'(sans campagne)'"))
  assert.ok(sql.includes("'\\s+'"), 'retours à la ligne et doubles espaces normalisés (« IMPERFECTIONS⁉️\\n »)')
  // la dépense résout son propre identifiant avec la MÊME fonction : les deux côtés se rejoignent
  assert.ok(DIMENSIONS.campagne.sql.pub!.includes('a."externalId"'))
})

test("la marge après pub d'une ligne sans commande est −dépense, jamais NaN", () => {
  assert.ok(MESURES.margeApresPub && MESURES.margeApresPub.sql === null)
  const calc = DERIVEES.margeApresPub.calc
  assert.equal(calc({ marge: 500, depensePub: 120 }), 380)
  assert.equal(calc({ depensePub: 2048 }), -2048, 'publication boostée : de la dépense, aucune commande attribuée')
  assert.equal(calc({ marge: 90 }), 90)
})

// ── 5. LES ÉCARTS À QUATRE CHIFFRES ─────────────────────────────────────────
test("un écart ordinaire reste un pourcentage avec sa flèche", () => {
  assert.deepEqual(calculerEcart(122, 100), { pct: 22, monte: true, texte: '▲ 22 %', extreme: false })
  assert.equal(calculerEcart(78, 100)?.texte, '▼ 22 %')
  assert.equal(calculerEcart(5, 0), null, 'diviser par zéro ne produit rien')
  assert.equal(calculerEcart(null, 10), null)
})

test("« ▲ 4 863 % » devient « × 50 » : la période précédente n'avait presque rien à comparer", () => {
  const e = calculerEcart(943, 19)!
  assert.equal(e.extreme, true)
  assert.equal(e.texte, '× 50')
  assert.match(e.explication ?? '', /mesurée autrement/)
  // juste sous le seuil : encore un pourcentage
  assert.equal(calculerEcart(1090, 100)?.extreme, false)
  assert.equal(calculerEcart(1110, 100)?.extreme, true)
})

// ── 6. LES COMMANDES SAISIES À LA MAIN : D'OÙ VIENT LA CLIENTE ──────────────
import { ORIGINES_COMMANDE, CLES_ORIGINE, demandeOrigine, estOrigineCommande } from '@/lib/analytics/origine-commande'
import { CreateOrderSchema } from '@/lib/validation/order'

test("une commande Instagram « via pub » rejoint les canaux payants ; sans réponse elle reste « DM »", () => {
  const sql = acquisitionChannelSql('o', 's')
  assert.ok(sql.includes("'Instagram (DM · via pub)'") && sql.includes("'WhatsApp (DM · via pub)'"))
  assert.ok(sql.indexOf("'Instagram (DM · via pub)'") < sql.indexOf("'Instagram (DM)'"), "la règle précise passe avant la règle générale")
  assert.ok(sql.includes(`o."sourcePayload"->>'origine' = 'pub'`))
  assert.ok(isPaidChannel('Instagram (DM · via pub)') && isPaidChannel('WhatsApp (DM · via pub)'))
  assert.ok(!isPaidChannel('Instagram (DM)'), "sans réponse, on n'invente pas que c'est de la pub")
})

test("la question d'origine n'est posée que pour les ventes nées d'une conversation, et seules les réponses connues passent", () => {
  assert.deepEqual(ORIGINES_COMMANDE.map((o) => o.cle), ['pub', 'publication', 'recommandation', 'cliente', 'autre'])
  for (const c of ['Instagram', 'WhatsApp', 'TikTok', 'Phone', 'Manual']) assert.ok(demandeOrigine(c), c)
  for (const c of ['Jumia', 'Marjane Mall', 'Famille', 'Website']) assert.ok(!demandeOrigine(c), c)
  assert.ok(estOrigineCommande('pub') && !estOrigineCommande('') && !estOrigineCommande('<script>') && !estOrigineCommande(undefined))
  assert.deepEqual([...CLES_ORIGINE], ['pub', 'publication', 'recommandation', 'cliente', 'autre'])
})

test("le schéma de commande accepte une origine connue, l'absence d'origine, et refuse le reste", () => {
  // Le schéma exige d'autres champs : on ne regarde que les erreurs propres à `origine`.
  const erreurOrigine = (origine: unknown) =>
    CreateOrderSchema.safeParse({ sourceChannel: 'Instagram', origine }).error?.flatten().fieldErrors.origine
  assert.equal(erreurOrigine('pub'), undefined)
  assert.equal(erreurOrigine(undefined), undefined, "pas de réponse = non renseignée, ce n'est pas une erreur")
  assert.ok(erreurOrigine('inventee'), "une valeur hors liste est refusée")
  assert.ok(erreurOrigine('<script>'), "rien d'autre que les clés connues n'atteint la base")
})
