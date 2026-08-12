'use client'

/**
 * ANCIEN TABLEAU DE BORD — conservé le temps de la transition.
 *
 * Il reste accessible pour comparer les chiffres pendant que les huit modules
 * sont reconstruits sur le modèle sémantique (`lib/analytics/model.ts`). Il sera
 * supprimé une fois la couverture confirmée.
 *
 * Ne rien ajouter ici : toute nouveauté va dans un module.
 */

import { useEffect, useState } from 'react'

interface StoreData {
  period: { start: string; end: string; days: number }
  kpis: {
    revenue: number; orders: number; aov: number; visitors: number; pageviews: number; conversionRate: number
    revenueDelta: number | null; ordersDelta: number | null; visitorsDelta: number | null
  }
  revenueByDay: Array<{ date: string; revenue: number; pending: number; orders: number; units: number; sessions: number; conversions: number }>
  ordersByStatus: Array<{ status: string; count: number; revenue: number }>
  topProducts: Array<{ name: string; brand: string; units: number; revenue: number; views: number }>
  topBrands: Array<{ brand: string; units: number; revenue: number }>
  channels: Array<{ channel: string; type: string; paid: boolean; orders: number; revenue: number }>
  /** Canal d'ACQUISITION réel (utm), plus le mélange type/origine d'avant. */
  channelRoas?: Array<{
    channel: string; placed: number; delivered: number; deliveryRate: number
    deliveredRevenue: number; aov: number; margin: number; buyers: number; repeatBuyers: number
  }>
  roas?: { metaRevenue: number; metaSpendPeriod: number; metaMargin: number }
  /** Chaîne de l'argent, tous canaux — pas seulement Meta. */
  money?: {
    adSpend: number; margin: number; delivered: number; placed: number
    deliveredRevenue: number; pendingRevenue: number; opex: number; opexEntries: number
  }
  /** Base de lecture assumée : sans elle, le même écran vaut deux montants. */
  basis?: 'cohorte' | 'cash'
  segment?: { device?: string; locale?: string; source?: string }
  maturite?: { enVol: number; total: number; pctResolu: number; provisoire: boolean }
  decomposition?: {
    depart: number; arrivee: number; ecart: number; residu: number; exploitable: boolean
    facteurs: Array<{ cle: string; label: string; effet: number; de: string; a: string }>
  }
  /** Impression en rayon → clic → fiche → panier, par produit. */
  merchFunnel?: Array<{ productId: number; name: string; brand: string; impressions: number; clicks: number; views: number; carts: number }>
  shelfPositions?: Array<{ bloc: string; impressions: number; clicks: number }>
  abandonValue?: Array<{ step: string; reason: string; abandons: number; sessions: number; value: number; avgValue: number }>
  segments?: {
    locale: Array<{ seg: string; sessions: number; orders: number; revenue: number }>
    device: Array<{ seg: string; sessions: number; orders: number; revenue: number }>
  }
  cities: Array<{ city: string; orders: number; revenue: number }>
  trafficSources: Array<{ source: string; visitors: number; orders: number; revenue: number }>
  funnel: Array<{ stage: string; sessions: number }>
  realtime: { activeVisitors: number; recentPageviews: number }
  lowStock: Array<{ name: string; brand: string; stock: number }>
  topActions: Array<{ name: string; count: number; sessions: number }>
  searchQueries: Array<{ query: string; searches: number; customers: number; zero: number; avgResults: number }>
  searchMissing: Array<{ term: string; customers: number; attempts: number }>
  searchFunnel: { searched: number; clicked: number; converted: number; deadEnd: number }
  deviceConversion: Array<{ device: string; visitors: number; orders: number; rate: number }>
  otpFunnel: { requested: number; sent: number; submitted: number; verified: number; invalid: number; resent: number; failed: number }
  landingPages: Array<{ page: string; visitors: number; orders: number; carts: number; rate: number }>
  homeFlow: Array<{ step: string; sessions: number; orders: number; rate: number }>
  shelfAvailability: Array<{ page: string; label: string; sessions: number; displayed: number; buyable: number; unavailableRate: number }>
  visitDepth: Array<{ entry: string; singlePage: boolean; sessions: number; orders: number; rate: number }>
  loyalty: { customers: number; once: number; twice: number; loyal: number; repeat: number; repeatRate: number; avgOrders: number; medianDays: number }
  orderTiming: Array<{ dow: number; hour: number; orders: number }>
  cityRefusals: Array<{ city: string; total: number; cancelled: number; rate: number }>
  abandonRates: {
    cart: { total: number; abandoned: number; rate: number }
    checkout: { total: number; abandoned: number; rate: number }
  }
  errors: {
    total: number
    byType: Array<{ name: string; count: number; sessions: number }>
    recent: Array<{ name: string; error: string | null; sessionId: string; at: string }>
  }
  recentSessions: Array<{
    sessionId: string; actions: number; productViews: number; carts: number; searches: number
    errors: number; device: string; city: string; source: string; ordered: boolean; lastSeen: string; durationSec: number
    visitorName: string | null; visitorPhone: string | null; hasAccount: boolean
  }>
  sessionDuration: {
    avgSeconds: number
    sessionsCount: number
    prevAvgSeconds: number
    delta: number | null
    distribution: Array<{ bucket: string; sessions: number }>
    topSessions: Array<{ sessionId: string; totalSec: number; pages: number; device: string; city: string; source: string }>
    byPage: Array<{ path: string; avgSeconds: number; views: number }>
  }
  pageElements: Array<{ path: string; element: string; id: string | null; clicks: number; sessions: number }>
  checkoutAbandon: Array<{ step: string; reason: string; count: number; sessions: number }>
  abandonedCarts: Array<{ name: string | null; phone: string | null; city: string | null; total: number; lastStep: string | null; reason: string | null; updatedAt: string }>
}

interface SessionDetail {
  identity: {
    kind: 'account' | 'guest' | 'anonymous'
    name: string | null; phone: string | null; email: string | null
    city: string | null; memberSince: string | null; priorSessions: number
  }
  session: {
    device?: string; city?: string; country?: string
    utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string
    landingUrl?: string; landingReferrer?: string; userAgent?: string
    paid?: boolean; paidSource?: string | null
    firstSeenAt?: string; lastSeenAt?: string
  } | null
  orders: Array<{ id: number; status: string; total: number; channel: string | null; at: string }>
  timeline: Array<{ name: string; path: string | null; props: Record<string, unknown>; at: string }>
}

/** Minimal, dependency-free UA → browser + OS (labels only, best-effort). */
function parseUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: '—', os: '—' }
  const b = /Edg/.test(ua) ? 'Edge'
    : /OPR|Opera/.test(ua) ? 'Opera'
    : /Chrome/.test(ua) ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari'
    : 'Autre'
  const o = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '—'
  return { browser: b, os: o }
}

/** Entry / exit page + distinct page count from a session timeline. */
function pageJourney(timeline: TimelineEvent[]) {
  const paths = timeline
    .filter((e) => e.name === 'PAGE_VIEW' && e.path)
    .map((e) => e.path as string)
  return {
    entry: paths[0] ?? null,
    exit: paths[paths.length - 1] ?? null,
    count: new Set(paths).size,
  }
}

import { StatTile, LineChart, FunnelChart, BarList } from '../_components/Viz'
import { MoneyChain, Signaux, type Maillon, type Signal } from '../_components/MoneyChain'
import {
  T, Cascade, Levier, Maturite, Repli, Tableau, Taux, BarreSegment,
  type SegmentEtat,
} from '../_components/Decision'
import { BASIS_LABEL } from '@/lib/analytics/metrics'

const ROSE = '#E11D74'

/**
 * Palette data-viz validée (validate_palette.js, mode light, surface #ffffff) :
 * bande de luminosité OK · plancher de chroma OK · séparation daltonisme la pire
 * paire ΔE 9.2 (≥8) · vision normale ΔE 27.6 (≥15). L'aqua passe sous 3:1 de
 * contraste, d'où la règle de relief : ses valeurs portent toujours un libellé
 * visible, jamais la couleur seule.
 * Les couleurs de STATUT sont réservées au sens bon/attention/critique — jamais
 * réutilisées comme "série n°4".
 */
const VIZ = {
  s1: '#2a78d6',   // série 1 — bleu (séquentiel par défaut)
  s2: '#eb6834',   // série 2 — orange
  s3: '#1baf7a',   // série 3 — aqua (libellé visible obligatoire)
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  grid: '#e1e0d9',   // hairline, une nuance au-dessus de la surface
  axis: '#c3c2b7',
  muted: '#898781',
  // Encre et papier : la hiérarchie se fait au texte, pas à la couleur. Le
  // violet et le rose de l'ancienne page ont disparu — trois accents sans
  // rapport ne hiérarchisaient rien, ils décoraient.
  ink: '#0b0b0b',
  ink2: '#52514e',
} as const
const fmtMAD = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} MAD`
const fmtNum = (n: number) => Math.round(n).toLocaleString('fr-FR')

/** Compact big numbers for axis ticks: 1 200 → 1,2k, 25 000 → 25k. */
function compactNum(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}M`
  if (abs >= 1000) return `${(n / 1000).toFixed(abs % 1000 === 0 ? 0 : 1).replace('.', ',')}k`
  return String(Math.round(n))
}
/** A clean axis: step from the 1/2/5 ladder, 3–6 intervals, ticks land on round numbers. */
function niceScale(max: number): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] }
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const candidates = [pow / 2, pow, pow * 2, pow * 5, pow * 10].filter((s) => s > 0)
  for (const step of candidates) {
    const n = Math.ceil(max / step)
    if (n >= 3 && n <= 6) {
      return { max: step * n, ticks: Array.from({ length: n + 1 }, (_, i) => step * i) }
    }
  }
  const step = candidates[candidates.length - 1]
  const n = Math.ceil(max / step)
  return { max: step * n, ticks: Array.from({ length: n + 1 }, (_, i) => step * i) }
}
const fmtDuration = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
  if (safe < 60) return `${safe}s`
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}m ${secs}s`
}

type TimelineEvent = SessionDetail['timeline'][number]
type EventTone = 'navigation' | 'commerce' | 'engagement' | 'search' | 'friction'
type EventMeta = { label: string; tone: EventTone }

const EVENT_META: Record<string, EventMeta> = {
  SESSION_START: { label: 'Session start', tone: 'navigation' },
  SESSION_END: { label: 'Session end', tone: 'navigation' },
  PAGE_VIEW: { label: 'Page vue', tone: 'navigation' },
  PAGE_VIEW_DURATION: { label: 'Temps page', tone: 'engagement' },
  PRODUCT_IMPRESSION: { label: 'Produit vu en liste', tone: 'engagement' },
  PRODUCT_CLICK: { label: 'Clic produit', tone: 'engagement' },
  PRODUCT_VIEW_DETAIL: { label: 'Vue fiche produit', tone: 'engagement' },
  PRODUCT_CONTENT_SECTION_CLICK: { label: 'Clic contenu produit', tone: 'engagement' },
  PRODUCT_ADD_TO_CART: { label: 'Ajout panier', tone: 'commerce' },
  PRODUCT_REMOVE_FROM_CART: { label: 'Retrait panier', tone: 'engagement' },
  CART_CLEAR: { label: 'Panier vide par client', tone: 'friction' },
  VIEW_CART: { label: 'Panier ouvert', tone: 'commerce' },
  DELIVERY_CITY_SELECTED: { label: 'Ville livraison choisie', tone: 'engagement' },
  CLICK_CHECKOUT_FROM_CART: { label: 'Clic checkout panier', tone: 'commerce' },
  BEGIN_CHECKOUT: { label: 'Checkout commence', tone: 'commerce' },
  CHECKOUT_STEP: { label: 'Etape checkout', tone: 'commerce' },
  CHECKOUT_CART_EMPTY: { label: 'Checkout panier vide', tone: 'friction' },
  CHECKOUT_VALIDATION_FAILED: { label: 'Validation checkout bloquee', tone: 'friction' },
  CHECKOUT_ABANDONED: { label: 'Checkout abandonne', tone: 'friction' },
  ADD_PAYMENT_INFO: { label: 'Infos paiement', tone: 'commerce' },
  OTP_REQUESTED: { label: 'Code demande', tone: 'commerce' },
  OTP_SENT: { label: 'Code envoye', tone: 'commerce' },
  OTP_SEND_FAILED: { label: "Echec d'envoi du code", tone: 'friction' },
  OTP_DELIVERY_FAILED: { label: 'Code non livre (WhatsApp)', tone: 'friction' },
  OTP_RESENT: { label: 'Code renvoye', tone: 'commerce' },
  OTP_SUBMITTED: { label: 'Code saisi', tone: 'commerce' },
  OTP_VERIFIED: { label: 'Numero verifie', tone: 'commerce' },
  OTP_INVALID: { label: 'Code incorrect', tone: 'friction' },
  PLACE_ORDER: { label: 'Commande envoyee', tone: 'commerce' },
  PURCHASE_SUCCESS: { label: 'Achat reussi', tone: 'commerce' },
  PURCHASE_FAILED: { label: 'Achat echoue', tone: 'friction' },
  SEARCH_QUERY: { label: 'Recherche', tone: 'search' },
  SEARCH_SUBMIT: { label: 'Recherche submit', tone: 'search' },
  SEARCH_RESULT_CLICK: { label: 'Clic resultat recherche', tone: 'search' },
  SEARCH_ABANDONED: { label: 'Recherche abandonnee', tone: 'search' },
  SEARCH_ZERO_RESULTS: { label: 'Recherche sans resultat', tone: 'friction' },
  PROMO_CODE_APPLIED: { label: 'Promo appliquee', tone: 'commerce' },
  PROMO_CODE_FAILED: { label: 'Promo refusee', tone: 'friction' },
  CLICK_UI: { label: 'Clic interface', tone: 'engagement' },
  CLICK_WHATSAPP: { label: 'Clic WhatsApp', tone: 'commerce' },
}

const TONE_CLASSES: Record<EventTone, { dot: string; text: string; badge: string }> = {
  navigation: { dot: 'bg-slate-300', text: 'text-slate-700', badge: 'bg-slate-50 text-slate-600 border-slate-200' },
  commerce: { dot: 'bg-emerald-500', text: 'text-emerald-800', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  engagement: { dot: 'bg-violet-400', text: 'text-violet-800', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  search: { dot: 'bg-sky-400', text: 'text-sky-800', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  friction: { dot: 'bg-rose-500', text: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
}

function getEventMeta(name: string): EventMeta {
  const known = EVENT_META[name]
  if (known) return known
  if (/FAILED|ZERO|EMPTY|ABANDONED|VALIDATION/.test(name)) {
    return { label: name.replace(/_/g, ' ').toLowerCase(), tone: 'friction' }
  }
  if (/CHECKOUT|PURCHASE|ORDER|CART|PAYMENT/.test(name)) {
    return { label: name.replace(/_/g, ' ').toLowerCase(), tone: 'commerce' }
  }
  if (/SEARCH/.test(name)) {
    return { label: name.replace(/_/g, ' ').toLowerCase(), tone: 'search' }
  }
  return { label: name.replace(/_/g, ' ').toLowerCase(), tone: 'engagement' }
}

function stringProp(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberProp(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function isFrictionEvent(name: string) {
  return getEventMeta(name).tone === 'friction'
}

function eventDetail(event: TimelineEvent) {
  const props = event.props || {}
  const name = event.name
  if (name === 'PAGE_VIEW_DURATION') {
    const seconds = numberProp(props.durationSeconds)
    return seconds != null ? `${fmtDuration(seconds)} sur ${event.path || 'page'}` : event.path
  }
  if (name === 'CHECKOUT_CART_EMPTY') {
    const step = stringProp(props.step)
    return step ? `Panier vide sur ${step}` : 'Panier vide'
  }
  if (name === 'CHECKOUT_STEP') {
    const step = stringProp(props.step)
    const itemsCount = numberProp(props.itemsCount)
    return [step ? `Etape ${step}` : null, itemsCount != null ? `${itemsCount} articles` : null].filter(Boolean).join(' - ') || event.path
  }
  if (name === 'BEGIN_CHECKOUT' || name === 'ADD_PAYMENT_INFO' || name === 'PLACE_ORDER') {
    const value = numberProp(props.value) ?? numberProp(props.finalTotal) ?? numberProp(props.cartTotal)
    const itemsCount = numberProp(props.itemsCount) ?? numberProp(props.numItems)
    return [itemsCount != null ? `${itemsCount} articles` : null, value != null ? fmtMAD(value) : null].filter(Boolean).join(' - ') || event.path
  }
  if (name === 'PRODUCT_VIEW_DETAIL' || name === 'PRODUCT_CLICK' || name === 'PRODUCT_ADD_TO_CART' || name === 'PRODUCT_REMOVE_FROM_CART') {
    return stringProp(props.name) || stringProp(props.productName) || stringProp(props.productId) || event.path
  }
  if (name === 'PRODUCT_CONTENT_SECTION_CLICK') {
    const action = stringProp(props.action)
    const section = stringProp(props.sectionLabel) || stringProp(props.section)
    const product = stringProp(props.name) || stringProp(props.productName) || stringProp(props.productId)
    return [action, section, product].filter(Boolean).join(' - ') || event.path
  }
  if (name.startsWith('SEARCH_')) {
    if (name === 'SEARCH_FILTER_APPLIED') {
      const filterType = stringProp(props.filterType)
      const filterValue = stringProp(props.filterValue)
      const previousValue = stringProp(props.previousValue)
      return [filterType, previousValue ? `${previousValue} -> ${filterValue}` : filterValue].filter(Boolean).join(' - ') || event.path
    }
    return stringProp(props.query) || stringProp(props.reason) || event.path
  }
  if (name === 'CLICK_BRAND') {
    return stringProp(props.brand) || stringProp(props.brandSlug) || event.path
  }
  if (name === 'CLICK_UI') {
    return stringProp(props.label) || stringProp(props.id) || event.path
  }
  if (name === 'DELIVERY_CITY_SELECTED') {
    const city = stringProp(props.city)
    const fee = numberProp(props.deliveryFee)
    const threshold = numberProp(props.freeThreshold)
    return [city, fee != null ? `${fee} MAD livraison` : null, threshold != null ? `seuil ${threshold} MAD` : null].filter(Boolean).join(' - ') || event.path
  }
  return stringProp(props.error)
    || stringProp(props.reason)
    || stringProp(props.step)
    || stringProp(props.productId)
    || event.path
}

function timelineForDisplay(timeline: TimelineEvent[]) {
  if (timeline.length <= 1) return timeline
  const times = timeline.map((event) => new Date(event.at).getTime()).filter(Number.isFinite)
  const firstTime = Math.min(...times)
  return [...timeline].sort((a, b) => {
    const aTime = new Date(a.at).getTime()
    const bTime = new Date(b.at).getTime()
    const aInitialStart = a.name === 'SESSION_START' && Number.isFinite(aTime) && Math.abs(aTime - firstTime) < 15000
    const bInitialStart = b.name === 'SESSION_START' && Number.isFinite(bTime) && Math.abs(bTime - firstTime) < 15000
    if (aInitialStart !== bInitialStart) return aInitialStart ? -1 : 1
    return aTime - bTime
  })
}

function sessionSummary(timeline: TimelineEvent[]) {
  return timeline.reduce((acc, event) => {
    if (event.path) acc.pages.add(event.path)
    if (event.name === 'PRODUCT_VIEW_DETAIL') acc.products += 1
    if (event.name === 'PRODUCT_ADD_TO_CART') acc.carts += 1
    if (event.name === 'BEGIN_CHECKOUT') acc.checkouts += 1
    if (event.name === 'SEARCH_QUERY') acc.searches += 1
    if (event.name === 'PURCHASE_SUCCESS') acc.purchases += 1
    if (isFrictionEvent(event.name)) acc.frictions += 1
    if (event.name === 'PAGE_VIEW_DURATION') acc.duration += numberProp(event.props?.durationSeconds) ?? 0
    return acc
  }, { pages: new Set<string>(), products: 0, carts: 0, checkouts: 0, searches: 0, purchases: 0, frictions: 0, duration: 0 })
}

function errorCount(data: StoreData, name: string) {
  return data.errors.byType.find((event) => event.name === name)?.count ?? 0
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', CONFIRMED: '#3B82F6', SHIPPED: '#8B5CF6', DELIVERED: '#10B981',
  RETURNED: '#EF4444', CANCELLED: '#9CA3AF', FAILED: '#EF4444',
}

const RANGES = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
] as const

type ChartMetric = 'revenue' | 'orders' | 'units' | 'aov' | 'cvr'
const METRICS: { key: ChartMetric; label: string; kind: 'mad' | 'num' | 'pct' }[] = [
  { key: 'revenue', label: 'CA', kind: 'mad' },
  { key: 'orders', label: 'Commandes', kind: 'num' },
  { key: 'units', label: 'Quantités', kind: 'num' },
  { key: 'aov', label: 'Panier moyen', kind: 'mad' },
  { key: 'cvr', label: 'Taux conv.', kind: 'pct' },
]
type DayRow = { date: string; revenue: number; orders: number; units: number; sessions: number; conversions: number }
function metricValue(d: DayRow, m: ChartMetric): number {
  if (m === 'revenue') return d.revenue
  if (m === 'orders') return d.orders
  if (m === 'units') return d.units
  if (m === 'aov') return d.orders > 0 ? d.revenue / d.orders : 0
  return d.sessions > 0 ? (d.conversions / d.sessions) * 100 : 0 // cvr
}
function fmtMetric(v: number, kind: 'mad' | 'num' | 'pct'): string {
  if (kind === 'mad') return fmtMAD(v)
  if (kind === 'pct') return `${v.toFixed(2)}%`
  return fmtNum(v)
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>
  const up = value >= 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  )
}

export default function StoreAnalytics() {
  const [data, setData] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rangeMode, setRangeMode] = useState<'today' | 'yesterday' | number>(30)
  // BASE DE LECTURE. « cohorte » date à la commande (la publicité de cette
  // période a-t-elle produit ?), « cash » date à la livraison (qu'est-ce qui est
  // rentré ? — c'est la base du BOS). 11 % d'écart entre les deux sur 30 j : les
  // confondre, c'est comparer le budget de juillet aux encaissements d'août.
  const [basis, setBasis] = useState<'cohorte' | 'cash'>('cohorte')
  const [segment, setSegment] = useState<SegmentEtat>({})
  const segmentKey = `${segment.device ?? ''}|${segment.locale ?? ''}|${segment.source ?? ''}`
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customActive, setCustomActive] = useState(false)
  const [sessionSource, setSessionSource] = useState('all')
  const [sessionDevice, setSessionDevice] = useState('all')
  const [sessionIssue, setSessionIssue] = useState<'all' | 'with_errors' | 'converted' | 'no_action'>('all')
  const [sessionSearch, setSessionSearch] = useState('')
  const [activeSession, setActiveSession] = useState<string | null>(null)
  // Real Meta spend for the selected period — entered by the user (the synced
  // AdCampaign.spend is cumulative and not period-accurate).
  const [metaSpend, setMetaSpend] = useState<string>('')
  useEffect(() => {
    if (typeof window !== 'undefined') setMetaSpend(localStorage.getItem('metaSpendInput') || '')
  }, [])
  const onSpendChange = (v: string) => {
    setMetaSpend(v)
    if (typeof window !== 'undefined') localStorage.setItem('metaSpendInput', v)
  }

  const useCustom = customActive && !!customFrom && !!customTo
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const base = useCustom
          ? `from=${customFrom}&to=${customTo}`
          : typeof rangeMode === 'string'
            ? `preset=${rangeMode}`
            : `days=${rangeMode}`
        // La base de lecture et le segment font partie de la requête : c'est le
        // serveur qui recalcule, pas le client qui filtre un tableau déjà agrégé.
        const extra = new URLSearchParams()
        extra.set('basis', basis)
        if (segment.device) extra.set('device', segment.device)
        if (segment.locale) extra.set('locale', segment.locale)
        if (segment.source) extra.set('source', segment.source)
        const params = `${base}&${extra.toString()}`
        const res = await fetch(`/api/ops/analytics/store?${params}`)
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        if (active) { setData(json); setError(null) }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (active) setLoading(false)
      }
    }
    setLoading(true); load()
    // Live refresh only for preset ranges (custom is a fixed historical window).
    const t = useCustom ? null : setInterval(load, 60000)
    return () => { active = false; if (t) clearInterval(t) }
    // `segment` est un objet : le passer tel quel relancerait la requête à chaque
    // rendu. On dépend de sa forme sérialisée, qui est stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, useCustom, customFrom, customTo, basis, segmentKey])

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: ROSE, borderTopColor: 'transparent' }} />
        <p className="text-gray-500 text-sm">Chargement…</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">
        <p className="text-gray-900 font-semibold mb-2">Analytics indisponible</p>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <button onClick={() => setRangeMode((m) => m)} className="px-4 py-2 rounded-lg text-white text-sm" style={{ background: ROSE }}>Réessayer</button>
      </div>
    )
  }

  // Biggest funnel leak: the step transition that loses the most visitors — the
  // clearest "fix this first" signal on the whole page.
  const funnelDrops = data.funnel.slice(1).map((s, i) => ({
    from: data.funnel[i].stage,
    to: s.stage,
    lost: Math.max(0, data.funnel[i].sessions - s.sessions),
    dropPct: data.funnel[i].sessions > 0 ? (1 - s.sessions / data.funnel[i].sessions) * 100 : 0,
  }))
  const biggestLeak = [...funnelDrops].filter((d) => d.lost > 0).sort((a, b) => b.lost - a.lost)[0] ?? null
  const checkoutEmpty = errorCount(data, 'CHECKOUT_CART_EMPTY')
  const checkoutAbandoned = errorCount(data, 'CHECKOUT_ABANDONED')
  const zeroSearches = data.searchQueries.reduce((sum, query) => sum + query.zero, 0)
  const diagnosticCards = [
    checkoutEmpty > 0 ? { label: 'Checkout vide', value: checkoutEmpty, tone: 'rose', hint: 'visiteurs arrives au checkout sans panier' } : null,
    checkoutAbandoned > 0 ? { label: 'Checkout abandonne', value: checkoutAbandoned, tone: 'amber', hint: 'checkout commence puis quitte avant achat' } : null,
    zeroSearches > 0 ? { label: 'Recherches sans resultat', value: zeroSearches, tone: 'sky', hint: 'demande non couverte ou synonymes manquants' } : null,
  ].filter((card): card is { label: string; value: number; tone: 'rose' | 'amber' | 'sky'; hint: string } => card != null)
  const sessionSources = ['all', ...Array.from(new Set(data.recentSessions.map((session) => session.source).filter(Boolean))).sort()]
  const sessionDevices = ['all', ...Array.from(new Set(data.recentSessions.map((session) => session.device).filter(Boolean))).sort()]
  const sessionNeedle = sessionSearch.trim().toLowerCase()
  const filteredSessions = data.recentSessions.filter((session) => {
    if (sessionSource !== 'all' && session.source !== sessionSource) return false
    if (sessionDevice !== 'all' && session.device !== sessionDevice) return false
    if (sessionIssue === 'with_errors' && session.errors === 0) return false
    if (sessionIssue === 'converted' && !session.ordered) return false
    if (sessionIssue === 'no_action' && session.actions > 0) return false
    if (!sessionNeedle) return true
    return [
      session.sessionId,
      session.source,
      session.device,
      session.city,
    ].some((value) => value.toLowerCase().includes(sessionNeedle))
  })

  // Les valeurs de segment disponibles viennent des données elles-mêmes : on
  // n'affiche pas un bouton « العربية » s'il n'y a eu aucune visite en arabe.
  const segOptions = {
    device: (data.segments?.device ?? []).map((s) => s.seg).filter(Boolean).slice(0, 3),
    locale: (data.segments?.locale ?? []).map((s) => s.seg).filter(Boolean).slice(0, 3),
    source: [] as string[],
  }

  return (
    // UNE SEULE COLONNE. L'ancienne page empilait des grilles de 2, 3 et 4
    // colonnes où tout avait le même poids : rien n'y disait ce qui comptait.
    // Ici la position dans la page EST la hiérarchie — et il n'y a rien à
    // réorganiser sur mobile.
    <div className="max-w-[1040px] mx-auto px-5 py-5">
      {/* ── Pilotage : période, base de lecture, segment ────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${VIZ.grid}` }}>
            {RANGES.map((r) => {
              const on = !useCustom && rangeMode === r.value
              return (
                <button key={String(r.value)} onClick={() => { setCustomActive(false); setRangeMode(r.value) }}
                  className="px-2.5 py-1 text-[12px] font-semibold transition-colors"
                  style={{ background: on ? VIZ.ink : 'transparent', color: on ? '#fff' : VIZ.ink2 }}>
                  {r.label}
                </button>
              )
            })}
            <button onClick={() => setCustomActive(true)}
              className="px-2.5 py-1 text-[12px] font-semibold transition-colors"
              style={{ background: useCustom ? VIZ.ink : 'transparent', color: useCustom ? '#fff' : VIZ.ink2 }}>
              Choisir
            </button>
          </div>
          {customActive && (
            <div className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1" style={{ border: `1px solid ${VIZ.grid}` }}>
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs outline-none" />
              <span className="text-xs" style={{ color: VIZ.muted }}>→</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="text-xs outline-none" />
            </div>
          )}
          {/* La base n'est pas un détail technique : elle vaut 11 % d'écart. */}
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${VIZ.grid}` }}>
            {([['cohorte', 'À la commande'], ['cash', 'À la livraison']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setBasis(v)}
                className="px-2.5 py-1 text-[12px] font-semibold transition-colors"
                style={{ background: basis === v ? VIZ.ink : 'transparent', color: basis === v ? '#fff' : VIZ.ink2 }}
                title={v === 'cohorte'
                  ? 'Daté au jour de la commande — pour juger ce que la publicité a produit.'
                  : 'Daté au jour de la livraison — ce qui est réellement rentré. Même base que le back-office.'}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="inline-flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: VIZ.good }} />
          <span className="text-[11px]" style={{ color: VIZ.ink2 }}>
            <b>{data.realtime.activeVisitors}</b> en direct · <b>{data.realtime.recentPageviews}</b> vues (5 min)
          </span>
        </div>
      </div>

      {(segOptions.device.length > 1 || segOptions.locale.length > 1) && (
        <div className="pb-4">
          <BarreSegment etat={segment} onChange={setSegment} options={segOptions} />
        </div>
      )}


      {/* ═══ DÉCISION ═══════════════════════════════════════════════════════
          Le niveau qui manquait. Trente cartes au même poids sur un seul
          défilement, c'est trente choses à lire et aucune décision à prendre.
          Ici : les quatre chiffres qui pilotent, et les deux seules questions
          qui comptent — où je perds, et d'où vient ce qui arrive vraiment.
          Le détail existant reste dessous, intact. */}
      {(() => {
        const jours = data.revenueByDay
        const serie = (k: 'revenue' | 'orders' | 'sessions') => jours.map((d) => Number(d[k]) || 0)

        // Le denouement, pas la commande : en paiement a la livraison, une
        // commande passee n'est pas une vente. Source unique = channelRoas,
        // qui compte les commandes LIVREES.
        const cr = data.channelRoas || []
        const placees = cr.reduce((s, c) => s + (c.placed || 0), 0)
        const livrees = cr.reduce((s, c) => s + (c.delivered || 0), 0)
        const caLivre = cr.reduce((s, c) => s + (c.deliveredRevenue || 0), 0)
        const tauxLivraison = placees > 0 ? Math.round((livrees / placees) * 100) : null
        const visiteurs = data.kpis.visitors || 0
        // Conversion REELLE : rapportee aux commandes livrees, pas passees.
        const cvrReel = visiteurs > 0 ? (livrees / visiteurs) * 100 : 0

        // ── LA CHAINE DE L'ARGENT ────────────────────────────────────────────
        // On valorise chaque fuite du tunnel en dirhams : « 861 visiteuses
        // perdues » ne declenche aucune decision, « ~2 400 MAD manques ici » si.
        // Regle de valorisation, volontairement prudente : les visiteuses
        // perdues a une etape auraient converti au taux MOYEN des etapes
        // suivantes, pas au taux de l'etape courante. On sous-estime plutot que
        // de promettre un gain qui n'existe pas.
        const pub = data.money?.adSpend ?? 0
        const marge = data.money?.margin ?? 0
        const margeParCommande = livrees > 0 ? marge / livrees : 0
        const f = data.funnel
        const cvrGlobale = f[0]?.sessions > 0 ? livrees / f[0].sessions : 0

        const maillons: Maillon[] = [
          { label: 'Publicité', value: pub, kind: 'mad', note: 'toutes plateformes' },
          {
            label: 'Visiteuses', value: visiteurs, kind: 'num',
            rendement: null, note: `${fmtMAD(visiteurs > 0 ? pub / visiteurs : 0)} par visiteuse`,
          },
          {
            label: 'Commandes passées', value: placees, kind: 'num',
            rendement: visiteurs > 0 ? (placees / visiteurs) * 100 : null,
            // Pas de seuil : 1 a 3 % est la norme en e-commerce. Le peindre en
            // rouge reviendrait a allumer l'alerte tous les jours de l'annee.
            // C'est la fuite du tunnel, plus bas, qui declenche une decision.
            perteMad: Math.round((visiteurs - placees) * cvrGlobale * margeParCommande),
          },
          {
            label: 'Livrées', value: livrees, kind: 'num',
            rendement: tauxLivraison,
            // 75 % est le plancher acceptable en paiement a la livraison.
            seuilBas: 75,
            // Un refus n'est pas un zero : il coute l'aller, le retour et
            // l'emballage. Estimation prudente a 60 MAD la commande refusee.
            perteMad: (placees - livrees) * 60,
            note: 'ce qui arrive vraiment',
          },
          {
            label: 'Marge dégagée', value: marge - pub, kind: 'mad',
            rendement: caLivre > 0 ? ((marge - pub) / caLivre) * 100 : null,
            // Le seul seuil qui compte ici : au-dessous de zero, on paie pour vendre.
            seuilBas: 0,
            note: `${fmtMAD(marge)} de marge − ${fmtMAD(pub)} de pub`,
          },
        ]

        // ── CE QUI A CHANGÉ ──────────────────────────────────────────────────
        // La detection remplace la recherche : les anomalies se presentent,
        // classees par impact, au lieu d'etre cherchees dans trente cartes.
        const signaux: Signal[] = []
        if (marge - pub < 0) {
          signaux.push({
            gravite: 'critique', titre: 'La période coûte plus qu\'elle ne rapporte',
            detail: `${fmtMAD(pub)} de publicité pour ${fmtMAD(marge)} de marge dégagée.`,
            impact: pub - marge,
          })
        }
        if (tauxLivraison != null && tauxLivraison < 75 && placees >= 5) {
          signaux.push({
            gravite: tauxLivraison < 65 ? 'critique' : 'attention',
            titre: `Seulement ${tauxLivraison} % des commandes arrivent`,
            detail: `${placees - livrees} refusées sur ${placees}. Chaque refus coûte l'aller, le retour et l'emballage.`,
            impact: (placees - livrees) * 60,
          })
        }
        // Le canal qui commande beaucoup mais se fait refuser : il consomme du
        // budget ET de la logistique pour rien.
        const pireCanal = [...cr]
          .filter((c) => c.placed >= 4 && c.deliveryRate < 70)
          .sort((a, b) => (b.placed - b.delivered) - (a.placed - a.delivered))[0]
        if (pireCanal) {
          signaux.push({
            gravite: 'attention',
            titre: `« ${pireCanal.channel || 'direct'} » : ${pireCanal.deliveryRate} % de livraison seulement`,
            detail: `${pireCanal.placed - pireCanal.delivered} commandes refusées sur ${pireCanal.placed}.`,
            impact: (pireCanal.placed - pireCanal.delivered) * 60,
          })
        }
        if (biggestLeak && biggestLeak.lost > 0) {
          signaux.push({
            gravite: biggestLeak.dropPct > 70 ? 'critique' : 'attention',
            titre: `${biggestLeak.from} → ${biggestLeak.to} : ${biggestLeak.dropPct.toFixed(0)} % s'arrêtent`,
            detail: `${fmtNum(biggestLeak.lost)} visiteuses perdues à cette marche — la plus grosse fuite du tunnel.`,
            impact: Math.round(biggestLeak.lost * cvrGlobale * margeParCommande),
          })
        }
        if (signaux.length === 0 && marge > 0) {
          signaux.push({
            gravite: 'bon', titre: 'Rien d\'anormal sur la période',
            detail: `${fmtMAD(marge - pub)} dégagés après publicité.`,
          })
        }

        // ── LE COMPTE DE RÉSULTAT ────────────────────────────────────────────
        // Marge de contribution − publicité − charges. `OperatingExpense` est
        // vide à ce jour : on l'affiche à 0 AVEC la mention, jamais un zéro muet
        // qui se lirait comme « pas de charges ».
        const opex = data.money?.opex ?? 0
        const opexSaisi = (data.money?.opexEntries ?? 0) > 0
        const resultat = marge - pub - opex
        const dec = data.decomposition
        const mat = data.maturite

        // ── LE PARAGRAPHE D'OUVERTURE ────────────────────────────────────────
        // Trois phrases écrites à partir de la décomposition, pas rédigées à la
        // main : ce qui s'est passé, ce qui l'explique, quoi regarder.
        const phrases: string[] = []
        phrases.push(
          resultat >= 0
            ? `La période laisse ${fmtMAD(resultat)} après publicité${opexSaisi ? ' et charges' : ''}.`
            : `La période coûte ${fmtMAD(-resultat)} de plus qu'elle ne rapporte.`
        )
        if (dec?.exploitable) {
          const majeur = [...dec.facteurs].sort((a, b) => Math.abs(b.effet) - Math.abs(a.effet))[0]
          const frein = [...dec.facteurs].filter((f) => f.effet < 0).sort((a, b) => a.effet - b.effet)[0]
          phrases.push(
            `Par rapport à la période précédente, ${dec.ecart >= 0 ? 'le gain' : 'la perte'} vient surtout ` +
            `de « ${majeur.label.toLowerCase()} » (${majeur.effet >= 0 ? '+' : '−'}${fmtMAD(Math.abs(majeur.effet))}).`
          )
          if (frein && frein.cle !== majeur.cle) {
            phrases.push(`Le principal frein est « ${frein.label.toLowerCase()} » : ${fmtMAD(-frein.effet)} perdus (${frein.de} → ${frein.a}).`)
          }
        }

        return (
          <>
            {/* ═══ NIVEAU 0 — LE RÉSULTAT ═══════════════════════════════════ */}
            <section className="pb-6">
              <p className={T.label} style={{ color: VIZ.muted }}>
                Ce que la période a laissé · {BASIS_LABEL[basis].titre.toLowerCase()}
              </p>
              <p className={T.hero} style={{ color: resultat >= 0 ? VIZ.ink : VIZ.critical }}>
                {fmtMAD(resultat)}
              </p>
              <p className={`${T.note} mt-1`} style={{ color: VIZ.muted }}>
                {BASIS_LABEL[basis].explication}
              </p>

              {mat && <div className="mt-3"><Maturite enVol={mat.enVol} total={mat.total} pctResolu={mat.pctResolu} /></div>}

              {phrases.length > 0 && (
                <p className={`${T.body} mt-3 max-w-[68ch]`} style={{ color: VIZ.ink2 }}>
                  {phrases.join(' ')}
                </p>
              )}
            </section>

            <section className="pb-6">
              <MoneyChain maillons={maillons} />
            </section>

            {/* La cascade : « la marge a bougé de X » ne dit rien ; nommer le
                facteur responsable, en dirhams, désigne l'endroit où agir. */}
            {dec?.exploitable && (
              <section className="pb-6">
                <p className={T.label} style={{ color: VIZ.muted }}>D&apos;où vient l&apos;écart avec la période précédente</p>
                <div className="mt-3">
                  <Cascade
                    depart={dec.depart} arrivee={dec.arrivee}
                    facteurs={dec.facteurs}
                    labelDepart="Marge nette période précédente"
                    labelArrivee="Marge nette période courante"
                  />
                </div>
              </section>
            )}

            <section className="pb-6">
              <p className={T.label} style={{ color: VIZ.muted }}>Compte de résultat</p>
              <div className="mt-2 max-w-[520px]">
                <Tableau
                  lignes={[
                    { l: 'CA livré', v: caLivre, fort: false },
                    { l: 'Marge de contribution', v: marge, fort: false },
                    { l: 'Publicité', v: -pub, fort: false },
                    { l: opexSaisi ? 'Charges d\'exploitation' : 'Charges d\'exploitation (aucune saisie)', v: -opex, fort: false },
                    { l: 'Résultat', v: resultat, fort: true },
                  ]}
                  colonnes={[
                    { cle: 'l', titre: '', rendu: (r) => <span className={r.fort ? 'font-bold' : ''}>{r.l}</span> },
                    {
                      cle: 'v', titre: '', align: 'right', largeur: '140px',
                      rendu: (r) => (
                        <span className={r.fort ? 'font-black' : ''} style={{ color: r.v < 0 ? VIZ.critical : VIZ.ink }}>
                          {fmtMAD(r.v)}
                        </span>
                      ),
                    },
                  ]}
                />
                {(data.money?.pendingRevenue ?? 0) > 0 && (
                  <p className={`${T.note} mt-2`} style={{ color: VIZ.muted }}>
                    + {fmtMAD(data.money!.pendingRevenue)} encaissables, en cours de livraison — pas encore comptés ici.
                  </p>
                )}
              </div>
            </section>

            {/* ═══ NIVEAU 1 — LES TROIS LEVIERS ═════════════════════════════
                Une carte = une question = un chiffre = une action. Le titre est
                la question, pas le nom de la table. */}
            {(() => {
              const pubCanaux = cr.filter((c) => /Ads$/.test(c.channel))
              const margePub = pubCanaux.reduce((s, c) => s + (c.margin || 0), 0)
              const cmdPub = pubCanaux.reduce((s, c) => s + c.delivered, 0)
              const netPub = margePub - pub
              const cac = cmdPub > 0 ? pub / cmdPub : null
              return (
                <Levier
                  question="La publicité paie-t-elle ?"
                  ton={pub === 0 ? 'neutre' : netPub > 0 ? 'bon' : 'alerte'}
                  reponse={
                    pub === 0
                      ? 'Aucune dépense publicitaire sur la période'
                      : `${netPub >= 0 ? '+' : '−'}${fmtMAD(Math.abs(netPub))} après dépense`
                  }
                  detail={pub > 0 && (
                    <>
                      {fmtMAD(margePub)} de marge issue des publicités pour {fmtMAD(pub)} dépensés
                      {cac != null && <> · {fmtMAD(cac)} pour acquérir une commande livrée</>}
                    </>
                  )}
                >
                  <Tableau
                    lignes={cr.filter((c) => c.placed > 0)}
                    max={6}
                    colonnes={[
                      { cle: 'c', titre: 'Canal d\'acquisition', rendu: (c) => c.channel },
                      {
                        cle: 'l', titre: 'Livrées', align: 'right', largeur: '112px',
                        // Le garde-fou : un « 67 % » sur 3 commandes n'est pas un
                        // constat. Le rapport brut, lui, reste vrai — et il porte
                        // déjà le nombre de commandes passées, d'où la colonne
                        // « Passées » retirée : elle affichait deux fois la même
                        // chose, et repoussait la marge hors de l'écran mobile.
                        rendu: (c) => <Taux pct={c.placed >= 30 ? (c.delivered / c.placed) * 100 : null} n={c.delivered} d={c.placed} />,
                      },
                      { cle: 'm', titre: 'Marge', align: 'right', largeur: '96px', rendu: (c) => fmtMAD(c.margin) },
                      {
                        cle: 'r', titre: 'Rachat', align: 'right', largeur: '82px',
                        rendu: (c) => (c.buyers > 0
                          ? <span style={{ color: VIZ.ink2 }}>{c.repeatBuyers}/{c.buyers}</span>
                          : <span style={{ color: VIZ.muted }}>—</span>),
                      },
                    ]}
                  />
                  <p className={`${T.note} mt-2`} style={{ color: VIZ.muted }}>
                    Le canal se juge à sa marge, pas à son chiffre d&apos;affaires. « Rachat » compte les clientes
                    qui ont commandé plus d&apos;une fois — un canal qui en amène vaut plus que son ROAS immédiat.
                  </p>
                </Levier>
              )
            })()}

            <Levier
              question="Où le parcours perd-il le plus d'argent ?"
              ton={biggestLeak && biggestLeak.dropPct > 70 ? 'alerte' : 'neutre'}
              reponse={biggestLeak
                ? `${biggestLeak.from} → ${biggestLeak.to} : ${biggestLeak.dropPct.toFixed(0)} % s'arrêtent`
                : 'Parcours sans fuite marquée'}
              detail={biggestLeak && (
                <>
                  {fmtNum(biggestLeak.lost)} visiteuses perdues à cette marche ·
                  {' '}≈ {fmtMAD(Math.round(biggestLeak.lost * cvrGlobale * margeParCommande))} de marge non réalisée
                </>
              )}
            >
              <FunnelChart stages={data.funnel} />
              {(data.abandonValue?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className={T.label} style={{ color: VIZ.muted }}>
                    Paniers abandonnés — {fmtMAD(data.abandonValue!.reduce((s, a) => s + a.value, 0))} laissés en route
                  </p>
                  <div className="mt-2">
                    <Tableau
                      lignes={data.abandonValue!}
                      max={5}
                      // « Panier moyen » retiré : c'est Valeur ÷ Abandons, déjà
                      // sous les yeux. Une colonne dérivable d'une autre remplit
                      // la largeur sans rien apprendre.
                      colonnes={[
                        { cle: 's', titre: 'Étape', rendu: (a) => a.step },
                        { cle: 'r', titre: 'Raison', rendu: (a) => <span style={{ color: VIZ.ink2 }}>{a.reason}</span> },
                        { cle: 'n', titre: 'Abandons', align: 'right', largeur: '78px', rendu: (a) => fmtNum(a.abandons) },
                        { cle: 'v', titre: 'Valeur', align: 'right', largeur: '104px', rendu: (a) => fmtMAD(a.value) },
                      ]}
                    />
                  </div>
                </div>
              )}
            </Levier>

            <Levier
              question="Que coûtent les refus à la livraison ?"
              ton={tauxLivraison != null && tauxLivraison < 75 ? 'alerte' : 'bon'}
              reponse={tauxLivraison != null
                ? `${tauxLivraison} % des commandes arrivent`
                : 'Trop peu de commandes pour conclure'}
              detail={
                <>
                  {fmtNum(placees - livrees)} refusées sur {fmtNum(placees)} — chaque refus coûte l&apos;aller,
                  le retour et l&apos;emballage.
                </>
              }
            >
              <Tableau
                lignes={data.cityRefusals.filter((c) => c.total > 0)}
                max={6}
                vide="Aucun refus enregistré sur la période."
                // « Commandes » retiré pour la même raison : c'est le
                // dénominateur affiché dans « Refus ».
                colonnes={[
                  { cle: 'v', titre: 'Ville', rendu: (c) => c.city },
                  {
                    cle: 'r', titre: 'Refus', align: 'right', largeur: '118px',
                    rendu: (c) => <Taux pct={c.total >= 30 ? c.rate : null} n={c.cancelled} d={c.total} />,
                  },
                ]}
              />
            </Levier>
          </>
        )
      })()}

      {/* ═══ NIVEAU 2 — LES PREUVES ══════════════════════════════════════════
          Rien n'est supprimé : tout le détail existant vit ici, replié. On en
          montre six lignes de résumé au lieu de vingt-neuf cartes ouvertes, et
          on n'ouvre que le tiroir vers lequel un levier renvoie. */}
      <div className="mt-8 pt-2">
        <p className={T.label} style={{ color: VIZ.muted }}>Les preuves — le détail derrière les leviers</p>
      </div>

      <Repli titre="Ventes & tendance" resume="l'argent qui rentre, jour par jour">
      {/* Metric trend */}
      {(() => {
        const metric = METRICS.find((m) => m.key === chartMetric)!
        const daysArr = data.revenueByDay
        const vals = daysArr.map((d) => metricValue(d, chartMetric))
        const rawMax = Math.max(0, ...vals)
        const total = vals.reduce((a, b) => a + b, 0)
        const avg = daysArr.length ? total / daysArr.length : 0
        const scale = niceScale(rawMax)
        const niceMax = scale.max
        const n = daysArr.length
        const px = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
        const py = (v: number) => (niceMax > 0 ? (1 - v / niceMax) * 100 : 100)
        const lineD = daysArr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(metricValue(d, chartMetric))}`).join(' ')
        const areaD = n >= 2 ? `${lineD} L ${px(n - 1)} 100 L ${px(0)} 100 Z` : ''
        const lastVal = vals[n - 1] ?? 0
        const dLabel = (s: string) => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
        const tickLabel = (v: number) => (metric.kind === 'pct' ? `${Math.round(v)}%` : compactNum(v))
        return (
          <Card title={`${metric.label} par jour`} hint={`${data.period.start} → ${data.period.end}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap mt-1 mb-4">
              <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                {METRICS.map((m) => (
                  <button key={m.key} onClick={() => setChartMetric(m.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${chartMetric === m.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-500">
                {metric.kind === 'pct' ? 'Moy' : 'Total'} <b className="text-gray-800">{fmtMetric(metric.kind === 'pct' ? avg : total, metric.kind)}</b>
                <span className="text-gray-300"> · </span>Max <b className="text-gray-800">{fmtMetric(rawMax, metric.kind)}</b>
              </div>
            </div>
            {daysArr.length === 0 ? <Empty /> : (
              <>
                {/* Plot: 40px Y-axis gutter on the left, plot area to the right */}
                <div className="relative" style={{ height: 200 }}>
                  {/* Y-axis ticks + full-width gridlines */}
                  {scale.ticks.map((t) => (
                    <div key={t} className="absolute left-0 right-0 flex items-center" style={{ top: `${py(t)}%`, transform: 'translateY(-50%)' }}>
                      <span className="w-9 pr-1.5 text-right text-[10px] text-gray-400 tabular-nums shrink-0">{tickLabel(t)}</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  ))}
                  {/* Plot area, offset past the axis gutter */}
                  <div className="absolute left-10 right-1 top-0 bottom-0">
                    <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ROSE} stopOpacity={0.18} />
                          <stop offset="100%" stopColor={ROSE} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {areaD && <path d={areaD} fill="url(#areaGradient)" />}
                      <path d={lineD} fill="none" stroke={ROSE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    {/* Static dots — round because they're HTML, not stretched SVG. Sparse ranges show all; dense ranges only the endpoint. */}
                    {daysArr.map((d, i) => {
                      const v = metricValue(d, chartMetric)
                      const isLast = i === n - 1
                      if (n > 14 && !isLast) return null
                      return (
                        <div key={d.date} className="absolute rounded-full bg-white"
                          style={{ left: `${px(i)}%`, top: `${py(v)}%`, width: isLast ? 10 : 8, height: isLast ? 10 : 8,
                            transform: 'translate(-50%,-50%)', boxShadow: `0 0 0 2px ${ROSE}`, background: isLast ? ROSE : '#fff' }} />
                      )
                    })}
                    {/* Endpoint value label — the "where are we now" number */}
                    {n >= 2 && (
                      <div className="absolute z-10" style={{ left: `${px(n - 1)}%`, top: `${py(lastVal)}%`, transform: 'translate(-100%,-140%)' }}>
                        <span className="whitespace-nowrap rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-gray-800 shadow-sm ring-1 ring-gray-100">
                          {fmtMetric(lastVal, metric.kind)}
                        </span>
                      </div>
                    )}
                    {/* Hover columns: crosshair + emphasized dot + tooltip, per day */}
                    {daysArr.map((d, i) => {
                      const v = metricValue(d, chartMetric)
                      return (
                        <div key={d.date} className="group absolute top-0 bottom-0" style={{ left: `${px(i)}%`, width: `${100 / Math.max(1, n)}%`, minWidth: 12, transform: 'translateX(-50%)' }}>
                          <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute left-1/2 h-2.5 w-2.5 rounded-full opacity-0 group-hover:opacity-100" style={{ top: `${py(v)}%`, background: ROSE, boxShadow: '0 0 0 2px #fff', transform: 'translate(-50%,-50%)' }} />
                          <div className="pointer-events-none absolute left-1/2 z-20 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-center text-[10px] text-white shadow-lg group-hover:block" style={{ top: `${py(v)}%`, transform: 'translate(-50%, calc(-100% - 10px))' }}>
                            <span className="text-gray-300">{dLabel(d.date)}</span><br />{fmtMetric(v, metric.kind)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {/* X-axis, aligned under the plot (past the gutter) */}
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 pl-10 pr-1">
                  <span>{dLabel(daysArr[0].date)}</span>
                  {n > 2 && <span>{dLabel(daysArr[Math.floor((n - 1) / 2)].date)}</span>}
                  <span>{dLabel(daysArr[n - 1].date)}</span>
                </div>
              </>
            )}
          </Card>
        )
      })()}

      </Repli>

      <Repli titre="Friction" resume="ce qui bloque, une fois la fuite identifiée plus haut">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <Card title="Commandes par statut" hint="toutes commandes">
          <div className="space-y-2 mt-2">
            {data.ordersByStatus.length === 0 ? <Empty /> : data.ordersByStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[s.status] || '#9CA3AF' }} />
                <span className="text-sm text-gray-700 capitalize flex-1">{s.status.toLowerCase()}</span>
                <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                <span className="text-xs text-gray-400 w-28 text-right">{fmtMAD(s.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Checkout detail: where they drop + abandoned carts to call back */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Abandons checkout" hint="où ça décroche & pourquoi">
          {data.checkoutAbandon.length === 0 ? <Empty /> : (() => {
            const total = data.checkoutAbandon.reduce((s, a) => s + a.count, 0) || 1
            const stepLabel = (s: string) => ({ delivery: 'Livraison', summary: 'Récapitulatif', payment: 'Paiement', confirmed: 'Confirmé' }[s] || s)
            const reasonLabel = (r: string) => ({
              beforeunload: 'a quitté la page', pagehide: 'a fermé l\'onglet', visibility_hidden: 'onglet masqué',
              unmount: 'navigation interne', reached_payment: 'arrivé au paiement',
            }[r] || r)
            return (
              <Paged items={data.checkoutAbandon} pageSize={8}>{(rows) => (
                <div className="space-y-2 mt-3">
                  {rows.map((a, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="text-gray-700 truncate"><b>{stepLabel(a.step)}</b> <span className="text-gray-400">· {reasonLabel(a.reason)}</span></span>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">{a.count}<span className="text-gray-400 font-normal"> · {a.sessions}s</span></span>
                      </div>
                      <div className="h-1.5 rounded bg-gray-100 overflow-hidden"><div className="h-full rounded bg-amber-400" style={{ width: `${(a.count / total) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}</Paged>
            )
          })()}
        </Card>

        <Card title="Paniers abandonnés" hint={`${data.abandonedCarts.length} leads à rappeler`}>
          {data.abandonedCarts.length === 0 ? <Empty /> : (
            <Paged items={data.abandonedCarts} pageSize={6}>{(rows, start) => (
              <div className="space-y-2 mt-3">
                {rows.map((c, i) => (
                  <div key={start + i} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{c.name || 'Sans nom'}</span>
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{fmtMAD(c.total)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 min-w-0">
                        {c.phone && <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline whitespace-nowrap">📱 {c.phone}</a>}
                        {c.city && <span className="truncate">{c.city}</span>}
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{c.lastStep || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}</Paged>
          )}
        </Card>
      </div>

      {/* Rapatrié de la page « Parcours » (supprimée : son entonnoir doublait celui
          d'ici). Ces deux données n'existaient nulle part ailleurs. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Taux d'abandon" hint="part des sessions qui n'aboutissent pas">
          {/* Une jauge par ratio (forme « meter ») : la couleur porte un SENS
              (attention / critique) et vient toujours avec une icône + un libellé,
              jamais seule. Les valeurs sont écrites, pas seulement au survol. */}
          <div className="space-y-4 mt-3">
            {([
              { label: 'Panier abandonné', r: data.abandonRates.cart, help: 'ont mis au panier sans lancer le checkout' },
              { label: 'Checkout abandonné', r: data.abandonRates.checkout, help: 'ont lancé le checkout sans commander' },
            ] as const).map(({ label, r, help }) => {
              const tone = r.rate >= 70 ? VIZ.critical : r.rate >= 40 ? VIZ.warning : VIZ.s1
              const severe = r.rate >= 70
              return (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {severe && <span aria-hidden="true">⚠ </span>}{label}
                    </span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: tone }}>
                      {r.rate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ background: '#f3f4f6' }}>
                    <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, r.rate)}%`, background: tone }} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {fmtNum(r.abandoned)} sur {fmtNum(r.total)} {help}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Conversion par appareil" hint="visiteurs → commandes">
          {data.deviceConversion.length === 0 ? <Empty /> : (
            <div className="space-y-3 mt-3">
              {(() => {
                const max = Math.max(...data.deviceConversion.map((d) => d.rate), 0.01)
                const best = data.deviceConversion.reduce((b, d) => (d.rate > b.rate ? d : b), data.deviceConversion[0])
                return data.deviceConversion.map((d) => {
                  const isBest = d.device === best.device && data.deviceConversion.length > 1
                  return (
                    <div key={d.device}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm text-gray-800 capitalize">{d.device}</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          <b className="text-gray-900">{d.rate.toFixed(2)}%</b> · {fmtNum(d.orders)}/{fmtNum(d.visitors)}
                        </span>
                      </div>
                      {/* Une seule teinte : c'est une série unique. La meilleure ligne
                          est simplement plus opaque — pas une couleur de statut. */}
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${Math.max((d.rate / max) * 100, 2)}%`, background: VIZ.s1, opacity: isBest ? 1 : 0.55 }} />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </Card>
      </div>

      {/* Vérification du numéro : le dernier obstacle avant la commande. */}
      <Card title="Vérification du numéro (OTP)" hint="le dernier obstacle avant de commander">
        {data.otpFunnel.requested === 0 ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-xs text-sky-900 font-medium">Mesure tout juste activée</p>
            <p className="text-[11px] text-sky-700 mt-0.5 leading-relaxed">
              Les 8 événements OTP étaient <b>rejetés avant d&apos;être enregistrés</b> (nom absent du contrat
              d&apos;événements) : 0 en base, alors que {' '}
              <b>68 codes</b> partaient réellement sur 30 jours. Corrigé — cette vue se remplit
              à partir de maintenant, et expliquera enfin où se perdent les {' '}
              <b>{data.abandonRates.checkout.rate.toFixed(0)} %</b> d&apos;abandon au checkout.
            </p>
          </div>
        ) : (() => {
          const f = data.otpFunnel
          const steps = [
            { l: 'Code demandé', v: f.requested, help: 'ont atteint la vérification' },
            { l: 'Code envoyé', v: f.sent, help: 'envoi accepté par WhatsApp' },
            { l: 'Code saisi', v: f.submitted, help: 'ont tapé un code' },
            { l: 'Vérifié', v: f.verified, help: 'ont passé l’étape' },
          ]
          const pct = (n: number) => (f.requested > 0 ? (n / f.requested) * 100 : 0)
          const lost = f.requested - f.verified
          return (
            <div className="mt-3">
              <div className="space-y-2.5">
                {steps.map((s, i) => {
                  const isLast = i === steps.length - 1
                  return (
                    <div key={s.l}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm text-gray-800">{s.l}</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          <b className="text-gray-900">{fmtNum(s.v)}</b> · {pct(s.v).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${Math.max(pct(s.v), s.v > 0 ? 2 : 0)}%`, background: isLast ? VIZ.good : VIZ.s1 }} />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{s.help}</p>
                    </div>
                  )
                })}
              </div>
              {lost > 0 && (
                <p className="mt-3 text-[11px] rounded-lg px-2.5 py-1.5"
                  style={{ color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <span aria-hidden="true">⚠ </span>
                  <b>{fmtNum(lost)} clientes</b> ont demandé un code sans jamais passer l&apos;étape
                  {f.failed > 0 && <> — dont <b>{fmtNum(f.failed)}</b> pour un échec d&apos;envoi/livraison du code</>}
                  {f.invalid > 0 && <>, <b>{fmtNum(f.invalid)}</b> avec un code refusé</>}.
                </p>
              )}
            </div>
          )
        })()}
      </Card>

      {/* Session Duration */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-gray-900">⏱️ Durée des sessions</h3>
            <p className="text-xs text-gray-600 mt-0.5">Engagement & temps passé par visiteur</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-purple-900">{Math.floor(data.sessionDuration.avgSeconds / 60)}:{String(Math.floor(data.sessionDuration.avgSeconds % 60)).padStart(2, '0')}</div>
            <div className="text-xs text-gray-600 flex items-center gap-1.5 justify-end mt-0.5">
              <span>durée moyenne</span>
              <Delta value={data.sessionDuration.delta} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {/* Distribution */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Distribution par durée</h4>
            <div className="space-y-2">
              {data.sessionDuration.distribution.map((d) => {
                const maxSessions = Math.max(...data.sessionDuration.distribution.map(x => x.sessions), 1)
                const pct = (d.sessions / maxSessions) * 100
                return (
                  <div key={d.bucket}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{d.bucket}</span>
                      <span className="text-gray-500">{fmtNum(d.sessions)} sessions</span>
                    </div>
                    <div className="h-4 rounded bg-gray-100 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #8B5CF6, #A78BFA)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top sessions */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-bold text-gray-900 mb-3">Top sessions (les plus engagées)</h4>
            <div className="space-y-2">
              {data.sessionDuration.topSessions.slice(0, 8).map((s, i) => (
                <div key={s.sessionId} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-gray-400 font-mono w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-gray-900 font-medium truncate">{Math.floor(s.totalSec / 60)}min {s.totalSec % 60}s</p>
                      <p className="text-gray-400 text-[10px]">{s.pages} pages · {s.city} · {s.source}</p>
                    </div>
                  </div>
                  <span className="text-gray-500 ml-2">{s.device}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Time by page */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-sm font-bold text-gray-900 mb-3">Temps moyen par page</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
            {data.sessionDuration.byPage.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-700 truncate flex-1 mr-2">{p.path}</span>
                <span className="text-purple-700 font-semibold whitespace-nowrap">{Math.floor(p.avgSeconds / 60)}:{String(Math.floor(p.avgSeconds % 60)).padStart(2, '0')}</span>
                <span className="text-gray-400 ml-2 w-12 text-right">{p.views} vues</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      </Repli>

      <Repli titre="Produits" resume="ce qui se vend, ce qui manque">
      {/* Top products + brands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top produits" hint="CA · conversion vue→achat">
          {(() => {
            const total = data.topProducts.reduce((s, p) => s + p.revenue, 0) || 1
            return <RankList rows={data.topProducts.map((p) => {
              const conv = p.views > 0 ? (p.units / p.views) * 100 : null
              const avg = p.units > 0 ? p.revenue / p.units : 0
              return {
                label: p.name, sub: p.brand, b: fmtMAD(p.revenue), w: p.revenue,
                extra: `${p.units} u. · ${fmtMAD(avg)}/u · ${((p.revenue / total) * 100).toFixed(0)}% du CA${conv != null ? ` · ${p.views} vues · ${conv.toFixed(0)}% conv` : ''}`,
              }
            })} />
          })()}
        </Card>
        <Card title="Top marques" hint="par CA">
          {(() => {
            const total = data.topBrands.reduce((s, b) => s + b.revenue, 0) || 1
            return <RankList rows={data.topBrands.map((b) => ({
              label: b.brand, sub: `${b.units} u.`, b: fmtMAD(b.revenue), w: b.revenue,
              extra: `${((b.revenue / total) * 100).toFixed(0)}% du CA · ${fmtMAD(b.units > 0 ? b.revenue / b.units : 0)}/u`,
            }))} />
          })()}
        </Card>
      </div>

      </Repli>

      <Repli titre="Acquisition" resume="d'où viennent les commandes">
      {/* Channels + cities + sources */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Canaux de vente" hint="type de commande · acquisition">
          {(() => {
            const total = data.channels.reduce((s, c) => s + c.revenue, 0) || 1
            // TYPE (où la commande a été passée) et ACQUISITION (d'où vient la cliente)
            // sont deux choses différentes : une vente issue d'une pub Instagram reste
            // une commande Site. On montre d'abord la répartition par type, puis le détail.
            const byType = ['Site', 'Manuel'].map((t) => {
              const rows = data.channels.filter((c) => c.type === t)
              return { type: t, orders: rows.reduce((s, c) => s + c.orders, 0), revenue: rows.reduce((s, c) => s + c.revenue, 0) }
            }).filter((x) => x.orders > 0)
            const paidRevenue = data.channels.filter((c) => c.paid).reduce((s, c) => s + c.revenue, 0)
            return (
              <>
                <div className="flex gap-2 mt-3 mb-3">
                  {byType.map((t) => (
                    <div key={t.type} className="flex-1 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-gray-900 tabular-nums">{fmtNum(t.orders)}</span>
                        <span className="text-[11px] text-gray-400">cmd</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {t.type === 'Site' ? 'Passées sur le site' : 'Saisies manuellement'} · {fmtMAD(t.revenue)}
                      </p>
                    </div>
                  ))}
                </div>
                {paidRevenue > 0 && (
                  <p className="text-[11px] text-gray-500 mb-2">
                    Dont <b className="text-gray-900">{fmtMAD(paidRevenue)}</b> attribuables à de la <b>publicité payante</b>.
                  </p>
                )}
                <RankList rows={data.channels.map((c) => ({
                  label: c.paid ? `${c.channel} 💰` : c.channel,
                  sub: `${c.orders} cmd · ${c.type}`,
                  b: fmtMAD(c.revenue), w: c.revenue,
                  extra: `AOV ${fmtMAD(c.orders > 0 ? c.revenue / c.orders : 0)} · ${((c.revenue / total) * 100).toFixed(0)}% du CA`,
                }))} />
              </>
            )
          })()}
        </Card>
        <Card title="Villes" hint="CA · AOV · part">
          {(() => {
            const total = data.cities.reduce((s, c) => s + c.revenue, 0) || 1
            return <RankList rows={data.cities.map((c) => ({
              label: c.city, sub: `${c.orders} cmd`, b: fmtMAD(c.revenue), w: c.revenue,
              extra: `AOV ${fmtMAD(c.orders > 0 ? c.revenue / c.orders : 0)} · ${((c.revenue / total) * 100).toFixed(0)}% du CA`,
            }))} />
          })()}
        </Card>
        <Card title="Sources de trafic" hint="visiteurs · conversion">
          {(() => {
            const total = data.trafficSources.reduce((s, x) => s + x.visitors, 0) || 1
            return <RankList rows={data.trafficSources.map((s) => ({
              label: s.source, sub: `${s.visitors} vis · ${s.orders} cmd`, b: fmtMAD(s.revenue), w: s.visitors,
              extra: `${s.visitors > 0 ? ((s.orders / s.visitors) * 100).toFixed(1) : '0'}% conv · AOV ${fmtMAD(s.orders > 0 ? s.revenue / s.orders : 0)} · ${((s.visitors / total) * 100).toFixed(0)}% du trafic`,
            }))} />
          })()}
        </Card>
      </div>

      {/* Où atterrit le trafic, et est-ce que ça vend ? Une page qui reçoit des
          visiteuses sans générer une seule commande, c'est du CA laissé sur la
          table — et souvent de la pub déjà payée. */}
      <Card title="Pages d'entrée sur le site" hint="1re page de la visite · a-t-elle mené à un achat ?">
        {data.landingPages.length === 0 ? <Empty /> : (() => {
          const dead = data.landingPages.filter((p) => p.orders === 0)
          const wasted = dead.reduce((s, p) => s + p.visitors, 0)
          const max = Math.max(...data.landingPages.map((p) => p.visitors), 1)
          const pretty = (p: string) =>
            p === '/' ? 'Accueil' : decodeURIComponent(p).replace(/^\/(products|marques|categorie)\//, '')
          return (
            <>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Se lit : « les visiteuses dont la visite a <b>commencé</b> ici ont-elles acheté ? »
                {' '}Un produit peut très bien se vendre à des clientes entrées ailleurs (accueil,
                Instagram) — ici on juge <b>la page comme porte d&apos;entrée</b>, pas le produit.
              </p>
              {wasted > 0 && (
                <div className="mt-2 rounded-lg px-3 py-2"
                  style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p className="text-xs" style={{ color: '#78350f' }}>
                    <span aria-hidden="true">⚠ </span>
                    <b>{fmtNum(wasted)} visiteuses</b> ont commencé leur visite sur <b>{dead.length} page{dead.length > 1 ? 's' : ''}</b>
                    {' '}sans qu&apos;<b>aucune</b> n&apos;aboutisse à une commande.
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-2">
                {data.landingPages.map((p) => {
                  const isDead = p.orders === 0
                  return (
                    <div key={p.page}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <a href={p.page} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-gray-800 truncate hover:underline" title={p.page}>
                          {isDead && <span aria-hidden="true">⚠ </span>}{pretty(p.page)}
                        </a>
                        {/* On montre aussi les ajouts au panier : ça distingue « la page
                            n'accroche pas » (peu de paniers) de « ça bloque au checkout »
                            (beaucoup de paniers, zéro commande). */}
                        <span className="text-xs whitespace-nowrap tabular-nums"
                          style={{ color: isDead ? VIZ.warning : '#6b7280' }}>
                          {isDead
                            ? <b>0 achat</b>
                            : <><b className="text-gray-900">{p.rate.toFixed(2)}%</b> · {fmtNum(p.orders)} achat{p.orders > 1 ? 's' : ''}</>}
                          <span className="text-gray-400"> · {fmtNum(p.carts)} panier{p.carts > 1 ? 's' : ''} / {fmtNum(p.visitors)} vis.</span>
                        </span>
                      </div>
                      {/* Série unique → une seule teinte ; les pages qui ne vendent
                          rien passent en couleur d'alerte, toujours avec un libellé. */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${Math.max((p.visitors / max) * 100, 2)}%`, background: isDead ? VIZ.warning : VIZ.s1 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </Card>

      {/* LE clivage du site : une visite d'une seule page n'achète jamais, alors qu'à
          partir de la 2e page le taux est le même quel que soit le point d'entrée.
          Le levier n'est donc pas « quelle page d'entrée » mais « déclencher le 2e clic ». */}
      <Card title="Profondeur de visite" hint="le 2ᵉ clic décide de tout">
        {data.visitDepth.length === 0 ? <Empty /> : (() => {
          const total = data.visitDepth.reduce((s, v) => s + v.sessions, 0) || 1
          const single = data.visitDepth.filter((v) => v.singlePage)
          const multi = data.visitDepth.filter((v) => !v.singlePage)
          const singleSessions = single.reduce((s, v) => s + v.sessions, 0)
          const singleOrders = single.reduce((s, v) => s + v.orders, 0)
          const multiSessions = multi.reduce((s, v) => s + v.sessions, 0)
          const multiOrders = multi.reduce((s, v) => s + v.orders, 0)
          const multiRate = multiSessions > 0 ? (multiOrders / multiSessions) * 100 : 0
          const blocks = [
            { l: 'Une seule page vue', s: singleSessions, o: singleOrders, tone: VIZ.warning },
            { l: 'A navigué (2 pages ou plus)', s: multiSessions, o: multiOrders, tone: VIZ.good },
          ]
          return (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {blocks.map((b) => {
                  const rate = b.s > 0 ? (b.o / b.s) * 100 : 0
                  return (
                    <div key={b.l} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                      <p className="text-[11px] text-gray-500">{b.l}</p>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl font-bold" style={{ color: b.tone }}>{rate.toFixed(2)}%</span>
                        <span className="text-[11px] text-gray-400">achètent</span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {fmtNum(b.s)} visites ({((b.s / total) * 100).toFixed(0)}%) · {fmtNum(b.o)} commande{b.o > 1 ? 's' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
              {singleOrders === 0 && singleSessions > 0 && (
                <p className="mt-3 text-xs rounded-lg px-3 py-2" style={{ color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <span aria-hidden="true">⚠ </span>
                  <b>{fmtNum(singleSessions)} visites</b> se sont arrêtées à la 1ʳᵉ page et
                  {' '}<b>aucune n&apos;a acheté</b>. Dès la 2ᵉ page, le taux monte à <b>{multiRate.toFixed(2)}%</b>.
                  {' '}Le levier n&apos;est pas la page d&apos;entrée : c&apos;est de déclencher le 2ᵉ clic.
                </p>
              )}
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Détail par type d&apos;entrée</p>
                {data.visitDepth.map((v) => (
                  <div key={`${v.entry}-${v.singlePage}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm text-gray-800 truncate">
                        {v.entry} <span className="text-gray-400">· {v.singlePage ? '1 page' : 'a navigué'}</span>
                      </span>
                      <span className="text-xs tabular-nums whitespace-nowrap text-gray-500">
                        <b style={{ color: v.rate > 0 ? VIZ.good : VIZ.warning }}>{v.rate.toFixed(2)}%</b>
                        <span className="text-gray-400"> · {fmtNum(v.sessions)} visites</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                      <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max((v.sessions / total) * 100, 2)}%`, background: v.singlePage ? '#d1d5db' : VIZ.s1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </Card>

      {/* L'accueil concentre les 2/3 des entrées : ce que les visiteuses font juste
          après y détermine l'essentiel des ventes. On compare le VOLUME de chaque
          chemin et son TAUX de transformation — les deux comptent. */}
      <Card title="Après l'accueil, où vont-elles ?" hint="2e page de la visite · conversion du chemin">
        {data.homeFlow.length === 0 ? <Empty /> : (() => {
          const total = data.homeFlow.reduce((s, f) => s + f.sessions, 0) || 1
          const bounce = data.homeFlow.find((f) => f.step === 'Repart sans 2e page')
          // On compare les chemins entre eux, hors rebond (qui n'est pas un chemin).
          const paths = data.homeFlow.filter((f) => f.step !== 'Repart sans 2e page')
          const best = paths.reduce((b, f) => (f.rate > (b?.rate ?? -1) ? f : b), paths[0])
          const maxRate = Math.max(...paths.map((f) => f.rate), 0.01)
          return (
            <>
              {bounce && (
                <div className="mt-3 rounded-lg px-3 py-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <p className="text-xs" style={{ color: '#78350f' }}>
                    <span aria-hidden="true">⚠ </span>
                    <b>{((bounce.sessions / total) * 100).toFixed(0)}%</b> ({fmtNum(bounce.sessions)} visiteuses) repartent
                    {' '}<b>sans voir une 2ᵉ page</b> — aucune n&apos;achète.
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-2.5">
                {data.homeFlow.map((f) => {
                  const share = (f.sessions / total) * 100
                  const isBounce = f.step === 'Repart sans 2e page'
                  const isBest = !isBounce && best && f.step === best.step && f.rate > 0
                  return (
                    <div key={f.step}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm text-gray-800">
                          {isBounce && <span aria-hidden="true">⚠ </span>}{f.step}
                        </span>
                        <span className="text-xs tabular-nums whitespace-nowrap text-gray-500">
                          <b className="text-gray-900">{share.toFixed(0)}%</b> des visites
                          <span className="text-gray-400"> · </span>
                          <b style={{ color: isBounce ? VIZ.warning : f.rate > 0 ? VIZ.good : VIZ.warning }}>
                            {f.rate.toFixed(2)}% achètent
                          </b>
                        </span>
                      </div>
                      {/* Deux lectures : la barre pleine = volume du chemin ; le trait
                          sous-jacent = sa transformation, à la même échelle pour tous. */}
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${Math.max(share, 2)}%`, background: isBounce ? '#d1d5db' : VIZ.s1, opacity: isBounce ? 1 : 0.55 }} />
                      </div>
                      {!isBounce && (
                        <div className="h-1 rounded-full overflow-hidden mt-0.5" style={{ background: '#f9fafb' }}>
                          <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                            style={{ width: `${Math.max((f.rate / maxRate) * 100, f.rate > 0 ? 3 : 0)}%`, background: isBest ? VIZ.good : VIZ.s3 }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {best && best.rate > 0 && (
                <p className="mt-3 text-[11px] text-gray-500">
                  Le chemin qui transforme le mieux : <b className="text-gray-900">{best.step.toLowerCase()}</b>
                  {' '}({best.rate.toFixed(2)}%). Pousser les visiteuses de l&apos;accueil vers ce chemin
                  {' '}est le levier le plus direct.
                </p>
              )}
            </>
          )
        })()}
      </Card>

      {/* Delivered ROAS by channel (COD reality) */}
      <Card title="💰 ROAS & livraison par canal" hint="CA = commandes livrées uniquement">
        {data.roas && (() => {
          const autoSpend = data.roas.metaSpendPeriod
          const override = parseFloat(metaSpend)
          const spend = Number.isFinite(override) && override > 0 ? override : autoSpend
          const rev = data.roas.metaRevenue
          const roas = spend > 0 ? rev / spend : null
          const realMargin = data.roas.metaMargin - spend // after ad spend (COGS+delivery already netted)
          return (
            <>
              <div className="text-[11px] text-gray-500 mb-2">
                {autoSpend > 0
                  ? <>Spend Meta <b>auto</b> (sync journalier) — modifiable. </>
                  : <>Pas encore de spend synchronisé pour cette période — <b>saisis-le</b>. </>}
                ROAS = CA livré FB+IG ÷ spend · Marge réelle = marge livrée − spend pub.
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-blue-50 p-3 text-center">
                  <div className="text-[11px] text-blue-700 font-semibold uppercase">Spend Meta</div>
                  <div className="flex items-baseline justify-center gap-1">
                    <input
                      type="number" inputMode="decimal" value={metaSpend}
                      onChange={(e) => onSpendChange(e.target.value)}
                      placeholder={autoSpend > 0 ? String(Math.round(autoSpend)) : 'ex: 500'}
                      className="w-20 text-lg font-bold text-blue-900 bg-transparent border-b border-blue-300 text-center focus:outline-none focus:border-blue-600"
                    />
                    <span className="text-xs text-blue-700">DH</span>
                  </div>
                  <div className="text-[10px] text-blue-400 mt-1">{autoSpend > 0 ? `auto: ${fmtMAD(autoSpend)}` : 'saisie manuelle'}</div>
                </div>
                <div className="rounded-lg bg-green-50 p-3 text-center">
                  <div className="text-[11px] text-green-700 font-semibold uppercase">CA livré FB+IG</div>
                  <div className="text-lg font-bold text-green-900">{fmtMAD(rev)}</div>
                  <div className="text-[10px] text-green-400 mt-1">sur la période</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${roas == null ? 'bg-gray-50' : roas >= 2 ? 'bg-emerald-50' : roas >= 1 ? 'bg-amber-50' : 'bg-red-50'}`}>
                  <div className="text-[11px] text-gray-700 font-semibold uppercase">ROAS Meta</div>
                  <div className={`text-lg font-bold ${roas == null ? 'text-gray-400' : roas >= 2 ? 'text-emerald-700' : roas >= 1 ? 'text-amber-700' : 'text-red-700'}`}>
                    {roas == null ? '—' : `${roas.toFixed(2)}×`}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center ${spend <= 0 ? 'bg-gray-50' : realMargin >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="text-[11px] text-gray-700 font-semibold uppercase">Marge réelle</div>
                  <div className={`text-lg font-bold ${spend <= 0 ? 'text-gray-400' : realMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {spend <= 0 ? '—' : fmtMAD(realMargin)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">après pub · marge livrée {fmtMAD(data.roas.metaMargin)}</div>
                </div>
              </div>
            </>
          )
        })()}
        <div className="text-[11px] text-gray-400 mb-2 mt-1">Tableau par canal : sur la période sélectionnée.</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Canal</th>
                <th className="py-2 text-right">Posées</th>
                <th className="py-2 text-right">Livrées</th>
                <th className="py-2 text-right">Taux</th>
                <th className="py-2 text-right">CA livré</th>
                <th className="py-2 text-right">AOV</th>
              </tr>
            </thead>
            <tbody>
              {(data.channelRoas ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-gray-400">Aucune commande sur la période.</td></tr>
              )}
              {(data.channelRoas ?? []).map((c, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 font-semibold capitalize">{c.channel}</td>
                  <td className="py-2 text-right">{c.placed}</td>
                  <td className="py-2 text-right">{c.delivered}</td>
                  <td className={`py-2 text-right font-semibold ${c.deliveryRate >= 80 ? 'text-green-600' : c.deliveryRate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{c.deliveryRate}%</td>
                  <td className="py-2 text-right font-bold text-green-600">{fmtMAD(c.deliveredRevenue)}</td>
                  <td className="py-2 text-right text-gray-500">{c.aov ? fmtMAD(c.aov) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      </Repli>

      <Repli titre="Comportement" resume="ce que font les visiteurs sur le site">
      {/* Searched queries + Bugs/errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Recherches" hint="par cliente — pas par frappe">
          {/* Entonnoir de la recherche : cherché → cliqué → commandé.
              Compté en sessions DISTINCTES : la recherche s'incrémente à chaque
              caractère tapé, donc compter les événements donnerait une demande fictive. */}
          {(() => {
            const f = data.searchFunnel
            const pct = (n: number) => (f.searched > 0 ? Math.round((n / f.searched) * 100) : 0)
            const steps = [
              { label: 'Ont cherché', v: f.searched, sub: '100%', tone: 'bg-gray-900' },
              { label: 'Ont cliqué un résultat', v: f.clicked, sub: `${pct(f.clicked)}%`, tone: 'bg-gray-500' },
              { label: 'Ont commandé', v: f.converted, sub: `${pct(f.converted)}%`, tone: 'bg-emerald-500' },
            ]
            return (
              <div className="mt-3">
                <div className="flex gap-2">
                  {steps.map((s) => (
                    <div key={s.label} className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtNum(s.v)}</span>
                        <span className="text-[11px] text-gray-400 tabular-nums">{s.sub}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${s.tone} transition-[width] duration-700`} style={{ width: `${Math.max(pct(s.v), s.v > 0 ? 3 : 0)}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 truncate">{s.label}</p>
                    </div>
                  ))}
                </div>
                {f.clicked > 0 && f.converted / f.clicked < 0.1 && (
                  <p className="mt-2.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    ⚠ {fmtNum(f.clicked)} clientes ont cliqué un résultat mais seulement {fmtNum(f.converted)} ont commandé — la recherche amène du monde, pas des ventes.
                  </p>
                )}
                {f.deadEnd > 0 && (
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {fmtNum(f.deadEnd)} clientes ({pct(f.deadEnd)}%) sont tombées sur <b className="text-rose-600">aucun résultat</b>.
                  </p>
                )}
              </div>
            )
          })()}

          {/* Demande manquante = argent laissé sur la table. Variantes de frappe
              regroupées par racine, classées par clientes distinctes. */}
          {data.searchMissing.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Demande non satisfaite <span className="font-normal normal-case text-gray-400">— cherché, jamais trouvé</span>
              </p>
              <div className="space-y-1">
                {data.searchMissing.slice(0, 6).map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm py-1">
                    <span className="text-gray-800 truncate flex-1" title={m.term}>{m.term}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-medium whitespace-nowrap">
                      {m.customers} cliente{m.customers > 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top recherches par intention validée (SEARCH_SUBMIT). */}
          {data.searchQueries.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Le plus recherché <span className="font-normal normal-case text-gray-400">— clientes distinctes</span>
              </p>
              <Paged items={data.searchQueries} pageSize={8}>{(rows, start) => (
                <div className="space-y-1">
                  {rows.map((q, i) => (
                    <div key={start + i} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-300 text-[11px] tabular-nums w-5">{start + i + 1}.</span>
                      <span className="text-gray-800 truncate flex-1">{q.query}</span>
                      {q.zero > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 font-medium whitespace-nowrap">{q.zero} sans rés.</span>}
                      <span className="text-xs text-gray-400 w-14 text-right">{q.avgResults} rés.</span>
                      <span className="text-sm font-semibold text-gray-900 w-10 text-right tabular-nums">{q.customers}</span>
                    </div>
                  ))}
                </div>
              )}</Paged>
            </div>
          )}
        </Card>

        <Card title="Bugs & erreurs détectés" hint={`${data.errors.total} événements`}>
          {data.errors.total === 0 ? (
            <p className="text-sm text-emerald-600 py-6 text-center">✓ Aucune erreur détectée sur la période.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mt-3 mb-3">
                {data.errors.byType.map((e) => (
                  <span key={e.name} className="text-xs px-2 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
                    {e.name.replace(/_/g, ' ').toLowerCase()} · <b>{e.count}</b>
                  </span>
                ))}
              </div>
              <div className="space-y-1 max-h-44 overflow-auto">
                {data.errors.recent.map((e, i) => (
                  <button key={i} onClick={() => setActiveSession(e.sessionId)} className="w-full text-left flex items-center gap-2 text-xs py-1 hover:bg-gray-50 rounded px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                    <span className="text-gray-700 font-medium whitespace-nowrap">{e.name.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className="text-gray-500 truncate flex-1">{e.error || '—'}</span>
                    <span className="text-gray-400 whitespace-nowrap">{new Date(e.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Top actions */}
      <Card title="Actions des visiteurs" hint={`${data.topActions.length} types d'événements`}>
        {data.topActions.length === 0 ? <Empty /> : (
          <Paged items={data.topActions} pageSize={12}>{(rows) => (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
              {rows.map((a) => {
                const meta = getEventMeta(a.name)
                const tone = TONE_CLASSES[meta.tone]
                return (
                  <div key={a.name} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                      <p className="text-[10px] text-gray-600 truncate" title={a.name}>{meta.label}</p>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{fmtNum(a.count)}</p>
                    <p className="text-[10px] text-gray-400">{a.sessions} sessions</p>
                  </div>
                )
              })}
            </div>
          )}</Paged>
        )}
      </Card>

      {/* Page-elements tracking: what customers click, and where */}
      <Card title="Éléments cliqués par page" hint="ce que les visiteurs cliquent, et où">
        {data.pageElements.length === 0 ? <Empty /> : (() => {
          const byPage = new Map<string, StoreData['pageElements']>()
          for (const e of data.pageElements) {
            const arr = byPage.get(e.path) || []
            arr.push(e); byPage.set(e.path, arr)
          }
          const pages = [...byPage.entries()]
            .map(([path, els]) => ({ path, els, total: els.reduce((s, x) => s + x.clicks, 0) }))
            .sort((a, b) => b.total - a.total)
          const prettyPath = (p: string) => p === '/' ? 'Accueil' : p.length > 44 ? p.slice(0, 44) + '…' : p
          return (
            <Paged items={pages} pageSize={4}>{(shownPages) => (
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                {shownPages.map((pg) => {
                  const top = [...pg.els].sort((a, b) => b.clicks - a.clicks).slice(0, 6)
                  const max = Math.max(1, ...top.map((e) => e.clicks))
                  return (
                    <div key={pg.path} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-800 truncate" title={pg.path}>{prettyPath(pg.path)}</p>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtNum(pg.total)} clics</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {top.map((e, i) => (
                          <div key={i} className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] text-gray-700 truncate" title={`${e.element}${e.id ? ` · ${e.id}` : ''}`}>{e.element}</p>
                              <span className="text-[11px] font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                                {fmtNum(e.clicks)}<span className="text-gray-400 font-normal"> · {e.sessions}s</span>
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-gray-200 overflow-hidden mt-0.5">
                              <div className="h-full rounded-full" style={{ width: `${(e.clicks / max) * 100}%`, background: ROSE }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}</Paged>
          )
        })()}
      </Card>

      {/* Per-visitor sessions */}
      <Card title="Visiteurs récents" hint="cliquez pour voir le parcours">
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
          <select value={sessionSource} onChange={(e) => setSessionSource(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
            {sessionSources.map((source) => <option key={source} value={source}>{source === 'all' ? 'Toutes sources' : source}</option>)}
          </select>
          <select value={sessionDevice} onChange={(e) => setSessionDevice(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
            {sessionDevices.map((device) => <option key={device} value={device}>{device === 'all' ? 'Tous appareils' : device}</option>)}
          </select>
          <select value={sessionIssue} onChange={(e) => setSessionIssue(e.target.value as typeof sessionIssue)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
            <option value="all">Tous parcours</option>
            <option value="with_errors">Avec friction</option>
            <option value="converted">Avec commande</option>
            <option value="no_action">Sans action</option>
          </select>
          <input
            value={sessionSearch}
            onChange={(e) => setSessionSearch(e.target.value)}
            placeholder="Session, ville, source..."
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400"
          />
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Affiche {fmtNum(filteredSessions.length)} / {fmtNum(data.recentSessions.length)} sessions recentes. Actions = events utiles, hors session/duree/scroll.
        </p>
        {filteredSessions.length === 0 ? <Empty /> : (
          <Paged items={filteredSessions} pageSize={15}>{(rows) => (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Visiteur</th>
                  <th className="py-2 px-2">Source</th>
                  <th className="py-2 px-2">Appareil · Ville</th>
                  <th className="py-2 px-2 text-right">Actions</th>
                  <th className="py-2 px-2 text-right">Durée</th>
                  <th className="py-2 px-2 text-right">Vues prod.</th>
                  <th className="py-2 px-2 text-right">Paniers</th>
                  <th className="py-2 px-2 text-right">Erreurs</th>
                  <th className="py-2 px-2 text-center">Cmd</th>
                  <th className="py-2 pl-2 text-right">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.sessionId} onClick={() => setActiveSession(s.sessionId)} className="border-b border-gray-50 hover:bg-rose-50/40 cursor-pointer">
                    <td className="py-2 pr-3">
                      {s.visitorName ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          {s.hasAccount && <span title="Compte client" className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                          <span className="text-gray-800 font-medium truncate max-w-[130px]" title={s.visitorPhone || s.sessionId}>{s.visitorName}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-gray-400">{s.sessionId.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-700">{s.source}</td>
                    <td className="py-2 px-2 text-gray-500 text-xs">{s.device} · {s.city}</td>
                    <td className="py-2 px-2 text-right font-semibold">{s.actions}</td>
                    <td className="py-2 px-2 text-right text-gray-500 text-xs">{fmtDuration(s.durationSec)}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{s.productViews}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{s.carts}</td>
                    <td className="py-2 px-2 text-right">{s.errors > 0 ? <span className="text-rose-600 font-semibold">{s.errors}</span> : <span className="text-gray-300">0</span>}</td>
                    <td className="py-2 px-2 text-center">{s.ordered ? '✅' : ''}</td>
                    <td className="py-2 pl-2 text-right text-gray-400 text-xs">{new Date(s.lastSeen).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}</Paged>
        )}
      </Card>

      {activeSession && <SessionDrawer sessionId={activeSession} onClose={() => setActiveSession(null)} />}

      {/* Le lien manquant entre marketing et stock : on envoie du monde (et de la pub)
          vers des étagères dont une grande partie n'est pas achetable. C'est la façon
          la plus silencieuse de perdre des ventes — invisible sur toutes les autres cartes. */}
      <Card title="Ce que le trafic trouve en rayon" hint="pages marque & catégorie · part réellement achetable">
        {data.shelfAvailability.length === 0 ? <Empty /> : (() => {
          const worst = data.shelfAvailability.filter((s) => s.unavailableRate >= 40)
          const lostViews = worst.reduce((s, x) => s + x.sessions, 0)
          return (
            <>
              {worst.length > 0 && (
                <div className="mt-3 rounded-lg px-3 py-2" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p className="text-xs" style={{ color: '#7f1d1d' }}>
                    <span aria-hidden="true">⚠ </span>
                    <b>{fmtNum(lostViews)} visites</b> sur des pages où <b>plus de 40 %</b> des produits
                    affichés ne sont <b>pas achetables</b> — la visiteuse voit surtout « Prévenez-moi ».
                  </p>
                </div>
              )}
              <div className="mt-3 space-y-2.5">
                {data.shelfAvailability.map((s) => {
                  const severe = s.unavailableRate >= 40
                  const tone = severe ? VIZ.critical : s.unavailableRate >= 20 ? VIZ.warning : VIZ.good
                  return (
                    <div key={s.page}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm text-gray-800 truncate">
                          {severe && <span aria-hidden="true">⚠ </span>}{s.label}
                          <span className="text-gray-400 text-[11px]"> · {s.page.startsWith('brand') ? 'marque' : 'catégorie'}</span>
                        </span>
                        <span className="text-xs tabular-nums whitespace-nowrap text-gray-500">
                          <b style={{ color: tone }}>{s.buyable}/{s.displayed} achetables</b>
                          <span className="text-gray-400"> · {fmtNum(s.sessions)} visites</span>
                        </span>
                      </div>
                      {/* Part achetable : la barre se remplit de ce qui est VRAIMENT
                          disponible, le reste du rail montre ce qui manque. */}
                      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: '#fee2e2' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${(s.buyable / Math.max(s.displayed, 1)) * 100}%`, background: VIZ.good }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Barre verte = produits achetables, fond rouge = indisponibles. Remettre en stock
                une marque très visitée rapporte plus vite que d&apos;acheter du trafic supplémentaire.
              </p>
            </>
          )
        })()}
      </Card>

      </Repli>

      <Repli titre="Fidélité & livraison" resume="ce qui se passe après la première vente">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sur des cosmétiques (produits qu'on rachète), le réachat est le levier le
            moins cher. Calculé sur TOUT l'historique, pas sur la période : personne
            ne recommande en 30 jours, un taux sur la fenêtre courante serait faux. */}
        <Card title="Fidélité" hint="tout l'historique — pas la période sélectionnée">
          {data.loyalty.customers === 0 ? <Empty /> : (() => {
            const l = data.loyalty
            const bars = [
              { l: '1 seule commande', v: l.once, tone: '#d1d5db' },
              { l: '2 commandes', v: l.twice, tone: VIZ.s1 },
              { l: '3 et plus', v: l.loyal, tone: VIZ.good },
            ]
            return (
              <>
                <div className="flex items-baseline gap-3 mt-3">
                  <span className="text-3xl font-bold" style={{ color: l.repeatRate < 20 ? VIZ.warning : VIZ.good }}>
                    {l.repeatRate.toFixed(0)}%
                  </span>
                  <div>
                    <p className="text-sm text-gray-800">de clientes qui recommandent</p>
                    <p className="text-[11px] text-gray-500">
                      {fmtNum(l.repeat)} sur {fmtNum(l.customers)} · {l.avgOrders.toFixed(2)} commande/cliente
                    </p>
                  </div>
                </div>
                {l.repeatRate < 20 && (
                  <p className="mt-2 text-[11px] rounded-lg px-2.5 py-1.5" style={{ color: '#78350f', background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <span aria-hidden="true">⚠ </span>
                    Faible pour des cosmétiques, qui sont des produits <b>consommables</b> : ramener une
                    cliente existante coûte bien moins cher que d&apos;acheter un nouveau visiteur.
                  </p>
                )}
                <div className="mt-4 space-y-2">
                  {bars.map((b) => (
                    <div key={b.l}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-700">{b.l}</span>
                        <span className="text-xs tabular-nums text-gray-500">
                          <b className="text-gray-900">{fmtNum(b.v)}</b> · {l.customers > 0 ? ((b.v / l.customers) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${l.customers > 0 ? Math.max((b.v / l.customers) * 100, b.v > 0 ? 2 : 0) : 0}%`, background: b.tone }} />
                      </div>
                    </div>
                  ))}
                </div>
                {l.medianDays > 0 && (
                  <p className="mt-3 text-[11px] text-gray-500">
                    Celles qui reviennent le font au bout de <b className="text-gray-900">{fmtNum(l.medianDays)} jours</b> (médiane)
                    {' '}— la bonne fenêtre pour une relance.
                  </p>
                )}
              </>
            )
          })()}
        </Card>

        {/* Refus à la livraison (COD annulé). Fenêtre fixe de 180 jours, annoncée
            dans le titre : sur 30 jours chaque ville aurait 2-3 commandes. */}
        <Card title="Refus à la livraison par ville" hint="180 derniers jours · commandes annulées">
          {data.cityRefusals.length === 0 ? <Empty /> : (
            <div className="mt-3 space-y-2">
              {data.cityRefusals.map((c) => {
                const severe = c.rate >= 25
                const tone = severe ? VIZ.critical : c.rate >= 15 ? VIZ.warning : VIZ.s1
                return (
                  <div key={c.city}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm text-gray-800 truncate">
                        {severe && <span aria-hidden="true">⚠ </span>}{c.city}
                      </span>
                      <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: tone }}>
                        <b>{c.rate.toFixed(0)}%</b>
                        <span className="text-gray-400"> · {fmtNum(c.cancelled)}/{fmtNum(c.total)} cmd</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
                      <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.max(c.rate, c.cancelled > 0 ? 2 : 0)}%`, background: tone }} />
                    </div>
                  </div>
                )
              })}
              <p className="text-[11px] text-gray-500 pt-1">
                Chaque refus coûte l&apos;aller-retour du colis. Les villes les plus hautes sont
                celles où confirmer la commande par téléphone avant expédition rapporte le plus.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Quand les clientes commandent — deux séries lisibles plutôt qu'une grille
          7×24 qui serait quasi vide à ce volume. Teinte unique, emphase sur le pic. */}
      <Card title="Quand tes clientes commandent" hint="sur la période sélectionnée">
        {data.orderTiming.length === 0 ? <Empty /> : (() => {
          const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
          const byDow = Array.from({ length: 7 }, (_, i) => ({
            label: JOURS[i], v: data.orderTiming.filter((t) => t.dow === i).reduce((s, t) => s + t.orders, 0),
          }))
          const byHour = Array.from({ length: 24 }, (_, h) => ({
            label: `${h}h`, v: data.orderTiming.filter((t) => t.hour === h).reduce((s, t) => s + t.orders, 0),
          }))
          const maxD = Math.max(...byDow.map((d) => d.v), 1)
          const maxH = Math.max(...byHour.map((d) => d.v), 1)
          const peakD = byDow.reduce((b, d) => (d.v > b.v ? d : b), byDow[0])
          const peakH = byHour.reduce((b, d) => (d.v > b.v ? d : b), byHour[0])
          return (
            <>
              <p className="text-xs text-gray-600 mt-3">
                Pic le <b className="text-gray-900">{peakD.label.toLowerCase()}</b> et à{' '}
                <b className="text-gray-900">{peakH.label}</b> — c&apos;est là que tes pubs et tes posts
                travaillent le mieux.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">Par jour</p>
                  <div className="space-y-1.5">
                    {byDow.map((d) => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 w-16 shrink-0">{d.label}</span>
                        <div className="h-3 rounded-[3px] flex-1 overflow-hidden" style={{ background: '#f3f4f6' }}>
                          <div className="h-full rounded-r-[3px] transition-[width] duration-700 ease-out"
                            style={{ width: `${(d.v / maxD) * 100}%`, background: VIZ.s1, opacity: d.label === peakD.label ? 1 : 0.5 }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-gray-600 w-6 text-right">{d.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-2">Par heure</p>
                  <div className="flex items-end gap-[3px] h-28">
                    {byHour.map((h) => (
                      <div key={h.label} className="flex-1 flex flex-col justify-end h-full" title={`${h.label} — ${h.v} commande${h.v > 1 ? 's' : ''}`}>
                        <div className="rounded-t-[3px] transition-[height] duration-700 ease-out"
                          style={{ height: `${Math.max((h.v / maxH) * 100, h.v > 0 ? 4 : 0)}%`, background: VIZ.s1, opacity: h.label === peakH.label ? 1 : 0.5 }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </Card>

      {/* Low stock */}
      {data.lowStock.length > 0 && (
        <Card title="Stock faible" hint="≤ 5 unités">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {data.lowStock.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="min-w-0"><p className="text-xs font-medium text-gray-900 truncate">{p.name}</p><p className="text-[10px] text-gray-500">{p.brand}</p></div>
                <span className="text-sm font-bold text-amber-600 ml-2">{p.stock}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      </Repli>
    </div>
  )
}

/**
 * Titre de groupe — c'est ce qui remplace les onglets : la page garde TOUTES ses
 * cartes visibles, mais gagne des points de repère quand on la balaye. Masquer
 * n'est pas organiser ; le rythme et la hiérarchie, si.
 */
function SectionTitle({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pt-3 border-t border-gray-200">
      <span className="text-[11px] font-bold tabular-nums" style={{ color: VIZ.s1 }}>{n}</span>
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      <span className="text-xs text-gray-400 truncate">{sub}</span>
    </div>
  )
}

function Kpi({ label, value, hint, delta, accent }: { label: string; value: string; hint?: string; delta?: number | null; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: accent ? ROSE : '#111827' }}>{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
      {delta !== undefined && <div className="mt-1"><Delta value={delta ?? null} /></div>}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Compact page-number pager with ‹ › and ellipses. */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 1 && i <= page + 1)) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  return (
    <div className="flex items-center justify-center gap-1 mt-3">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="px-2 py-1 rounded text-xs text-gray-500 disabled:opacity-40 hover:bg-gray-100">‹</button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
        : <button key={n} onClick={() => onPage(n)} className={`min-w-[26px] px-2 py-1 rounded text-xs font-medium ${n === page ? 'bg-rose-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{n}</button>)}
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} className="px-2 py-1 rounded text-xs text-gray-500 disabled:opacity-40 hover:bg-gray-100">›</button>
    </div>
  )
}

/** Generic paginated wrapper (render-prop) — manages its own page state + pager. */
function Paged<T>({ items, pageSize, children }: { items: T[]; pageSize: number; children: (slice: T[], startIndex: number) => React.ReactNode }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, pages)
  const start = (safePage - 1) * pageSize
  return (
    <>
      {children(items.slice(start, start + pageSize), start)}
      <Pager page={safePage} pages={pages} onPage={setPage} />
    </>
  )
}

function RankList({ rows, pageSize = 6 }: { rows: Array<{ label: string; sub: string; b: string; w: number; extra?: string }>; pageSize?: number }) {
  const [page, setPage] = useState(1)
  if (rows.length === 0) return <Empty />
  const max = Math.max(1, ...rows.map((r) => r.w))
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pages)
  const start = (safePage - 1) * pageSize
  return (
    <>
      <div className="space-y-2.5 mt-3">
        {rows.slice(start, start + pageSize).map((r, i) => (
          <div key={start + i}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm text-gray-800 truncate flex-1">
                <span className="text-gray-300 text-[11px] mr-1 tabular-nums">{start + i + 1}.</span>
                {r.label}{r.sub && <span className="text-gray-400 text-xs ml-1">· {r.sub}</span>}
              </span>
              <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{r.b}</span>
            </div>
            {r.extra && <div className="text-[10px] text-gray-400 mb-1 -mt-0.5 truncate" title={r.extra}>{r.extra}</div>}
            <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
              <div className="h-full rounded" style={{ width: `${(r.w / max) * 100}%`, background: ROSE }} />
            </div>
          </div>
        ))}
      </div>
      <Pager page={safePage} pages={pages} onPage={setPage} />
    </>
  )
}

function Empty() {
  return <p className="text-sm text-gray-400 py-6 text-center">Aucune donnée sur la période.</p>
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
    </div>
  )
}

function SessionDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [detailState, setDetailState] = useState<{ sessionId: string; detail: SessionDetail | null; loading: boolean }>({
    sessionId,
    detail: null,
    loading: true,
  })
  const detail = detailState.sessionId === sessionId ? detailState.detail : null
  const loading = detailState.sessionId !== sessionId || detailState.loading

  useEffect(() => {
    let active = true
    fetch(`/api/ops/analytics/session?id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (active) setDetailState({ sessionId, detail: j.error ? null : j, loading: false })
      })
      .catch(() => {
        if (active) setDetailState({ sessionId, detail: null, loading: false })
      })
    return () => { active = false }
  }, [sessionId])

  const timeline = detail ? timelineForDisplay(detail.timeline) : []
  const summary = detail ? sessionSummary(detail.timeline) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{detail?.identity?.name || 'Parcours du visiteur'}</p>
            <p className="text-xs text-gray-400 font-mono">{sessionId.slice(0, 16)}…</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Chargement…</div>
        ) : !detail ? (
          <div className="p-10 text-center text-sm text-gray-400">Aucune donnée.</div>
        ) : (
          <div className="p-5 space-y-4">
            {/* WHO — identity */}
            {(() => {
              const idn = detail.identity
              const badge = idn.kind === 'account'
                ? (idn.priorSessions > 0
                    ? { label: `Client · ${idn.priorSessions + 1} visites`, cls: 'bg-violet-100 text-violet-700' }
                    : { label: 'Client (compte)', cls: 'bg-emerald-100 text-emerald-700' })
                : idn.kind === 'guest'
                  ? { label: 'Invité (a commandé)', cls: 'bg-emerald-100 text-emerald-700' }
                  : { label: 'Anonyme', cls: 'bg-gray-100 text-gray-500' }
              return (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{idn.name || 'Visiteur anonyme'}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                    {idn.phone && <a href={`https://wa.me/${idn.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">📱 {idn.phone}</a>}
                    {idn.email && <span className="truncate" title={idn.email}>✉️ {idn.email}</span>}
                    <span>📍 {idn.city || detail.session?.city || '—'}{detail.session?.country ? `, ${detail.session.country}` : ''}</span>
                    {idn.memberSince && <span>🗓️ depuis {new Date(idn.memberSince).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
              )
            })()}

            {/* Acquisition + tech */}
            {detail.session && (
              <div className="rounded-lg bg-gray-50 p-3 space-y-1.5 text-[11px] text-gray-600">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-400">Source</span>
                  <span className="font-medium text-gray-800">{detail.session.utmSource || 'Direct'}</span>
                  {detail.session.utmMedium && <span className="text-gray-400">· {detail.session.utmMedium}</span>}
                  {detail.session.utmCampaign && <span className="text-gray-400">· {detail.session.utmCampaign}</span>}
                  {detail.session.paid && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">PAYANT · {detail.session.paidSource}</span>}
                </div>
                {detail.session.landingReferrer && (
                  <div className="truncate" title={detail.session.landingReferrer}><span className="text-gray-400">Referrer </span>{detail.session.landingReferrer}</div>
                )}
                <div className="flex items-center gap-3 flex-wrap pt-0.5">
                  <span>🖥️ {parseUserAgent(detail.session.userAgent).browser} · {parseUserAgent(detail.session.userAgent).os}</span>
                  <span>{detail.session.device || '—'}</span>
                </div>
                {(() => { const j = pageJourney(detail.timeline); return j.entry ? (
                  <div className="pt-0.5 text-gray-500">
                    <span className="text-gray-400">Entrée </span><span className="font-mono text-[10px]">{j.entry}</span>
                    {j.exit && j.exit !== j.entry && <><span className="text-gray-400"> → sortie </span><span className="font-mono text-[10px]">{j.exit}</span></>}
                    <span className="text-gray-400"> · {j.count} page{j.count > 1 ? 's' : ''}</span>
                  </div>
                ) : null })()}
              </div>
            )}
            {summary && (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Pages" value={summary.pages.size} />
                <MiniStat label="Produits" value={summary.products} />
                <MiniStat label="Panier" value={summary.carts} />
                <MiniStat label="Checkout" value={summary.checkouts} />
                <MiniStat label="Search" value={summary.searches} />
                <MiniStat label="Temps" value={fmtDuration(summary.duration)} />
              </div>
            )}
            {summary && summary.frictions > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-rose-700">Friction detectee</p>
                  <span className="text-xs font-bold text-rose-700">{summary.frictions}</span>
                </div>
                <p className="text-[11px] text-rose-600 mt-1">Regarde les points rouges dans la timeline pour comprendre ou le visiteur bloque.</p>
              </div>
            )}
            {detail.orders.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                {detail.orders.map((o) => (
                  <div key={o.id} className="flex justify-between text-xs">
                    <span className="font-medium text-gray-800">Commande #{o.id} · {o.status.toLowerCase()}</span>
                    <span className="font-semibold text-emerald-700">{fmtMAD(o.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="relative pl-4">
              {timeline.map((e, i) => {
                const meta = getEventMeta(e.name)
                const tone = TONE_CLASSES[meta.tone]
                const detailText = eventDetail(e)
                return (
                  <div key={`${e.name}-${e.at}-${i}`} className="relative pb-3">
                    <span className={`absolute -left-4 top-1.5 w-2 h-2 rounded-full ${tone.dot}`} />
                    {i < timeline.length - 1 && <span className="absolute -left-[11px] top-3 w-px h-full bg-gray-100" />}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={`text-xs font-semibold truncate ${tone.text}`}>{meta.label}</span>
                        <span className={`text-[9px] uppercase border rounded-full px-1.5 py-0.5 ${tone.badge}`}>{meta.tone}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    {detailText && <p className="text-[10px] text-gray-400 truncate mt-0.5">{detailText}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
