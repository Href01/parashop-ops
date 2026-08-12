export type AnalyticsEventName =
  | 'SESSION_START'
  | 'PAGE_VIEW'
  | 'PRODUCT_IMPRESSION'
  | 'PRODUCT_CLICK'
  | 'PRODUCT_VIEW_DETAIL'
  | 'PRODUCT_CONTENT_SECTION_CLICK'
  | 'PRODUCT_ADD_TO_CART'
  | 'PRODUCT_REMOVE_FROM_CART'
  | 'CART_CLEAR'
  | 'VIEW_CART'
  | 'DELIVERY_CITY_SELECTED'
  | 'BEGIN_CHECKOUT'
  | 'CLICK_CHECKOUT_FROM_CART'
  | 'CHECKOUT_STEP'
  | 'CHECKOUT_CART_EMPTY'
  | 'CHECKOUT_VALIDATION_FAILED'
  | 'CHECKOUT_ABANDONED'
  | 'ADD_PAYMENT_INFO'
  | 'USE_POINTS'
  | 'PLACE_ORDER'
  | 'PURCHASE_SUCCESS'
  | 'PURCHASE_FAILED'
  | 'SEARCH_QUERY'
  | 'SEARCH_SUBMIT'
  | 'SEARCH_RESULT_CLICK'
  | 'SEARCH_ABANDONED'
  | 'SEARCH_ZERO_RESULTS'
  | 'SEARCH_FILTER_APPLIED'
  | 'PROMO_CODE_APPLIED'
  | 'PROMO_CODE_FAILED'
  | 'PRODUCT_ADD_TO_WISHLIST'
  | 'PRODUCT_REMOVE_FROM_WISHLIST'
  | 'WHATSAPP_ORDER'
  | 'WHATSAPP_SHARE'
  | 'CLICK_WHATSAPP'
  | 'RECOMMENDATIONS_SHOWN'
  | 'RECOMMENDATION_CLICKED'
  | 'VIEW_LOYALTY_CARD'
  | 'CLICK_LOYALTY_HISTORY'
  | 'BUY_NOW_CLICK'
  | 'CLICK_BRAND'
  | 'BRAND_VIEW'
  | 'PAGE_VIEW_DURATION'
  | 'SCROLL_DEPTH'
  | 'CLICK_UI'
  | 'SESSION_END'
  // Vérification du numéro au checkout. Ces 8 noms étaient ÉMIS par le checkout
  // mais absents d'ici : normalizeAnalyticsEventName() renvoyait null et
  // /api/events les jetait en silence (0 événement OTP en base sur 30 jours,
  // alors que MessageLog comptait 68 envois). Le plus gros point de friction du
  // tunnel — 80 % d'abandon au checkout — était donc totalement invisible.
  | 'OTP_REQUESTED'
  | 'OTP_SENT'
  | 'OTP_SUBMITTED'
  | 'OTP_VERIFIED'
  | 'OTP_INVALID'
  | 'OTP_RESENT'
  | 'OTP_SEND_FAILED'
  | 'OTP_DELIVERY_FAILED'

  // Leviers de conversion propres a la cosmetique : avant d'acheter une creme,
  // une cliente lit les avis et regarde les photos. Aucun des deux n'etait
  // mesure — on ne savait donc pas ce qui declenche vraiment la decision.
  | 'PRODUCT_REVIEWS_OPENED'
  | 'PRODUCT_GALLERY_BROWSED'

  // Vitesse percue (Core Web Vitals). Sur 87 % de trafic mobile marocain, la
  // performance EST un facteur de conversion — et elle etait invisible.
  | 'WEB_VITALS'

  // Denouement des commandes, emis par declencheur en base (migration 036).
  // Declares ici pour que le tableau de bord les nomme correctement ; ils
  // n'empruntent pas /api/events.
  | 'ORDER_CONFIRMED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'

  // ── Ce qui casse sans que personne ne le sache ────────────────────────────
  // Le clic de rage (trois fois le meme element en moins d'une seconde) et le
  // clic mort (un element qui ne repond pas) sont les deux signatures d'une
  // interface cassee. Le crash du panier serait remonte ici tout seul, au lieu
  // d'etre decouvert par une cliente.
  | 'RAGE_CLICK'
  | 'DEAD_CLICK'

  // ── Ou exactement le checkout perd la cliente ─────────────────────────────
  // CHECKOUT_ABANDONED dit l'etape (« delivery »), jamais le CHAMP. Sur
  // 63 492 MAD de paniers abandonnes en 30 jours, savoir que c'est le telephone
  // ou le quartier change la correction a apporter.
  | 'CHECKOUT_FIELD_ERROR'
  | 'CHECKOUT_FIELD_ABANDON'
  // Le moment ou les frais de livraison apparaissent est un point de rupture
  // classique en paiement a la livraison — et il etait aveugle.
  | 'DELIVERY_FEE_SHOWN'

  // ── Mobile : le chemin d'achat reel ───────────────────────────────────────
  // 87 % du trafic est mobile et le bouton collant est le principal chemin
  // d'ajout au panier. On ne savait ni s'il s'affichait, ni s'il servait.
  | 'STICKY_CTA_SHOWN'
  | 'STICKY_CTA_CLICKED'

  // Monter la quantite est un signal de valeur, la baisser un signal de prix.
  | 'PRODUCT_QTY_CHANGED'

  // Premiere visite ou retour — la dimension qui manque le plus. Derivee du
  // cookie visiteur `_vid`, pose depuis le 2026-08-06.
  | 'SESSION_RETURNING'

  // Demande captee sur un produit indisponible : l'intention de reassort.
  | 'RESTOCK_NOTIFY_SUBMITTED'

export const ANALYTICS_EVENT_ALIASES: Record<string, AnalyticsEventName> = {
  VIEW_PRODUCT: 'PRODUCT_VIEW_DETAIL',
  PRODUCT_VIEW: 'PRODUCT_VIEW_DETAIL',
  VIEW_PRODUCT_DETAIL: 'PRODUCT_VIEW_DETAIL',
  ADD_TO_CART: 'PRODUCT_ADD_TO_CART',
  CART_ADD: 'PRODUCT_ADD_TO_CART',
  REMOVE_FROM_CART: 'PRODUCT_REMOVE_FROM_CART',
  CART_REMOVE: 'PRODUCT_REMOVE_FROM_CART',
  CART_REMOVE_ITEM: 'PRODUCT_REMOVE_FROM_CART',
  PRODUCT_CARD_IMPRESSION: 'PRODUCT_IMPRESSION',
  WISHLIST_ADD: 'PRODUCT_ADD_TO_WISHLIST',
  WISHLIST_REMOVE: 'PRODUCT_REMOVE_FROM_WISHLIST',
  FILTER_APPLIED: 'SEARCH_FILTER_APPLIED',
  SEARCH: 'SEARCH_QUERY',
}

export const EVENT_CATEGORY_BY_NAME: Record<AnalyticsEventName, string> = {
  SESSION_START: 'navigation',
  PAGE_VIEW: 'navigation',
  PRODUCT_IMPRESSION: 'engagement',
  PRODUCT_CLICK: 'engagement',
  PRODUCT_VIEW_DETAIL: 'engagement',
  PRODUCT_CONTENT_SECTION_CLICK: 'engagement',
  PRODUCT_ADD_TO_CART: 'conversion',
  PRODUCT_REMOVE_FROM_CART: 'engagement',
  CART_CLEAR: 'engagement',
  VIEW_CART: 'navigation',
  DELIVERY_CITY_SELECTED: 'engagement',
  BEGIN_CHECKOUT: 'conversion',
  CLICK_CHECKOUT_FROM_CART: 'conversion',
  CHECKOUT_STEP: 'conversion',
  CHECKOUT_CART_EMPTY: 'error',
  CHECKOUT_VALIDATION_FAILED: 'error',
  CHECKOUT_ABANDONED: 'conversion',
  ADD_PAYMENT_INFO: 'conversion',
  USE_POINTS: 'engagement',
  PLACE_ORDER: 'conversion',
  PURCHASE_SUCCESS: 'conversion',
  PURCHASE_FAILED: 'error',
  SEARCH_QUERY: 'search',
  SEARCH_SUBMIT: 'search',
  SEARCH_RESULT_CLICK: 'search',
  SEARCH_ABANDONED: 'search',
  SEARCH_ZERO_RESULTS: 'search',
  SEARCH_FILTER_APPLIED: 'search',
  PROMO_CODE_APPLIED: 'conversion',
  PROMO_CODE_FAILED: 'error',
  // Vérification du numéro (voir la note sur le type) : 'conversion' pour les
  // étapes du tunnel, 'error' pour les échecs, qui remontent ainsi dans la carte
  // « Bugs & erreurs » comme les autres frictions.
  OTP_REQUESTED: 'conversion',
  OTP_SENT: 'conversion',
  OTP_SUBMITTED: 'conversion',
  OTP_VERIFIED: 'conversion',
  OTP_INVALID: 'error',
  OTP_RESENT: 'conversion',
  OTP_SEND_FAILED: 'error',
  OTP_DELIVERY_FAILED: 'error',
  PRODUCT_ADD_TO_WISHLIST: 'engagement',
  PRODUCT_REMOVE_FROM_WISHLIST: 'engagement',
  WHATSAPP_ORDER: 'conversion',
  WHATSAPP_SHARE: 'engagement',
  CLICK_WHATSAPP: 'engagement',
  RECOMMENDATIONS_SHOWN: 'engagement',
  RECOMMENDATION_CLICKED: 'engagement',
  VIEW_LOYALTY_CARD: 'engagement',
  CLICK_LOYALTY_HISTORY: 'engagement',
  BUY_NOW_CLICK: 'conversion',
  CLICK_BRAND: 'navigation',
  BRAND_VIEW: 'navigation',
  PAGE_VIEW_DURATION: 'engagement',
  SCROLL_DEPTH: 'engagement',
  CLICK_UI: 'engagement',
  SESSION_END: 'navigation',
  PRODUCT_REVIEWS_OPENED: 'engagement',
  PRODUCT_GALLERY_BROWSED: 'engagement',
  WEB_VITALS: 'performance',
  // Le denouement est une CONVERSION, pas un simple changement d'etat : en
  // paiement a la livraison, c'est le seul moment ou l'argent existe vraiment.
  ORDER_CONFIRMED: 'conversion',
  ORDER_DELIVERED: 'conversion',
  ORDER_CANCELLED: 'conversion',
  // Une interface qui ne repond pas est une erreur, pas un « comportement » :
  // ces deux-la doivent remonter dans la carte « Bugs & erreurs ».
  RAGE_CLICK: 'error',
  DEAD_CLICK: 'error',
  CHECKOUT_FIELD_ERROR: 'error',
  CHECKOUT_FIELD_ABANDON: 'conversion',
  DELIVERY_FEE_SHOWN: 'conversion',
  STICKY_CTA_SHOWN: 'engagement',
  STICKY_CTA_CLICKED: 'conversion',
  PRODUCT_QTY_CHANGED: 'engagement',
  SESSION_RETURNING: 'navigation',
  RESTOCK_NOTIFY_SUBMITTED: 'engagement',
}

export const CONVERSION_EVENTS = new Set<AnalyticsEventName>([
  'PRODUCT_ADD_TO_CART',
  'BEGIN_CHECKOUT',
  'CLICK_CHECKOUT_FROM_CART',
  'CHECKOUT_STEP',
  'ADD_PAYMENT_INFO',
  'PLACE_ORDER',
  'PURCHASE_SUCCESS',
  'PROMO_CODE_APPLIED',
  'WHATSAPP_ORDER',
  'BUY_NOW_CLICK',
])

export function normalizeAnalyticsEventName(name: string): AnalyticsEventName | null {
  const normalized = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 64)

  if (!normalized) return null

  const canonical = ANALYTICS_EVENT_ALIASES[normalized] ?? normalized
  return canonical in EVENT_CATEGORY_BY_NAME
    ? (canonical as AnalyticsEventName)
    : null
}
