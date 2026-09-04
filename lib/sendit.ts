// Sendit API Integration
// Docs: https://app.sendit.ma/api/documentation
// API Base: https://app.sendit.ma/api/v1

import { formatPhoneForSendit } from './utils/phone'
import { toInteger } from './utils/numbers'

const SENDIT_API_URL = 'https://app.sendit.ma/api/v1'
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || ''
const PRIVATE_KEY = process.env.SENDIT_PRIVATE_KEY || ''
const PICKUP_DISTRICT_ID = parseInt(process.env.SENDIT_PICKUP_DISTRICT_ID || '1') // Default: Casablanca
const REQUEST_TIMEOUT_MS = 12_000
const MAX_RETRIES = 2

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface SenditRequestMetrics {
  httpCalls: number
  retries: number
  authCalls: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function requestWithRetry(
  url: string,
  init: RequestInit = {},
  metrics?: SenditRequestMetrics,
  options: { allowUnsafeRetry?: boolean } = {}
): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase()
  const idempotent = ['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(method)
  // Never replay a parcel-creation POST after a timeout: Sendit may have
  // accepted the first request even when its response never reached us.
  const maxRetries = idempotent || options.allowUnsafeRetry ? MAX_RETRIES : 0
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      if (metrics) {
        metrics.httpCalls++
        if (attempt > 0) metrics.retries++
      }
      const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal })
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === maxRetries) return response

      await response.body?.cancel().catch(() => {})
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 3000)
        : 300 * (attempt + 1))
    } catch (error) {
      lastError = error
      if (attempt === maxRetries) throw error
      await sleep(300 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Sendit request failed')
}

interface SenditLoginResponse {
  success: boolean
  message: string
  data: {
    token: string
    name: string
  }
}

interface SenditDelivery {
  pickup_district_id: number
  district_id: number
  name: string
  phone: string
  address: string
  amount: number
  reference?: string
  comment?: string
  allow_open?: number
  allow_try?: number
  products?: string
  products_from_stock?: number
}

interface SenditDeliveryResponse {
  success: boolean
  message: string
  data: {
    code: string
    status: string
    fee: number
    name: string
    phone: string
    address: string
    amount: number
    labelUrl: string
    last_action_at?: string
    audits?: Array<{
      event?: string
      user?: string
      created_at?: string
      data?: {
        status?: string
        district?: string | number
        comment?: string
      }
    }>
    district: {
      id: number
      ville: string
      name: string
      price: number
    }
  }
}

interface SenditShipment {
  reference: string
  recipient_name: string
  recipient_phone: string
  recipient_city: string
  recipient_address: string
  district_id: number
  cod_amount?: number
  package_weight?: number
  package_description?: string
  notes?: string
}

interface SenditShipmentResponse {
  success: boolean
  tracking_id: string
  barcode: string
  status: string
  estimated_delivery_date?: string
  shipping_cost: number
  destination_district_id?: number
  destination_district_name?: string
  message?: string
}

interface SenditTrackingResponse {
  tracking_id: string
  status: string
  amount: number
  fee: number
  last_action_at?: string
  destination_district_id?: number
  destination_district_name?: string
  status_history: Array<{
    status: string
    location: string
    timestamp: string
    note?: string
  }>
  estimated_delivery?: string
  actual_delivery?: string
}

interface SenditDistrict {
  id: number
  ville: string
  name: string
  arabic_name: string
  price: number
  delais: string
  pickup_district: number
}

interface SenditDistrictsResponse {
  success: boolean
  message: string
  data: SenditDistrict[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

// Cache token for 1 hour
let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Login to Sendit API and get Bearer token
 */
async function getAuthToken(metrics?: SenditRequestMetrics): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  if (!PUBLIC_KEY || !PRIVATE_KEY) throw new Error('SENDIT_PUBLIC_KEY / SENDIT_PRIVATE_KEY missing')

  try {
    if (metrics) metrics.authCalls++
    const response = await requestWithRetry(`${SENDIT_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_key: PUBLIC_KEY,
        secret_key: PRIVATE_KEY,
      }),
    }, metrics, { allowUnsafeRetry: true })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Sendit login failed:', errorText)
      throw new Error(`Login failed: ${response.status} ${errorText}`)
    }

    const data: SenditLoginResponse = await response.json()

    if (!data.success || !data.data.token) {
      throw new Error('Login response invalid')
    }

    cachedToken = data.data.token
    tokenExpiry = Date.now() + 3600000 // 1 hour
    return cachedToken
  } catch (error: unknown) {
    console.error('❌ Sendit login error:', error)
    throw new Error(`Failed to authenticate with Sendit: ${errorMessage(error)}`)
  }
}

async function senditRequest(path: string, init: RequestInit = {}, metrics?: SenditRequestMetrics): Promise<Response> {
  let token = await getAuthToken(metrics)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  let response = await requestWithRetry(`${SENDIT_API_URL}${path}`, { ...init, headers }, metrics)

  // A token can be revoked before our one-hour cache expires. Refresh it once;
  // retrying the same invalid token for every parcel only burns API calls.
  if (response.status === 401) {
    await response.body?.cancel().catch(() => {})
    cachedToken = null
    tokenExpiry = 0
    token = await getAuthToken(metrics)
    headers.set('Authorization', `Bearer ${token}`)
    response = await requestWithRetry(`${SENDIT_API_URL}${path}`, { ...init, headers }, metrics)
  }
  return response
}

/**
 * Create a new Sendit shipment
 */
export async function createSenditShipment(shipment: SenditShipment): Promise<SenditShipmentResponse> {
  console.log('🚀 Creating Sendit delivery...')
  console.log('📦 Shipment:', shipment)

  try {
    const districtId = Number(shipment.district_id)
    if (!Number.isInteger(districtId) || districtId <= 0) {
      throw new Error('Sendit district is required. Select the exact Sendit city/district before creating a shipment.')
    }

    // Validate and format phone BEFORE sending to API
    let formattedPhone: string
    try {
      formattedPhone = formatPhoneForSendit(shipment.recipient_phone)
      console.log('📱 Phone formatted:', {
        original: shipment.recipient_phone,
        formatted: formattedPhone
      })
    } catch (error: unknown) {
      throw new Error(`Invalid phone number: ${shipment.recipient_phone}. ${errorMessage(error)}`)
    }

    // Use the exact Sendit district selected by the operator/customer.
    console.log('📍 District:', {
      provided: shipment.district_id,
      final: districtId,
    })

    // Products description goes in products field (for Sendit UI "Produit" section)
    const productsDescription = shipment.package_description || ''

    // Notes go in comment field (separate from products)
    const comment = shipment.notes || undefined

    // Amount must be integer for Sendit - this should be the TOTAL (with shipping)
    // Sendit has a maximum limit of 5000 DH
    const totalAmount = shipment.cod_amount || 0
    const roundedAmount = toInteger(totalAmount)

    console.log('💰 Total Amount:', {
      original: totalAmount,
      type: typeof totalAmount,
      rounded: roundedAmount,
      exceedsLimit: roundedAmount > 5000
    })

    // Validate Sendit amount limit
    if (roundedAmount > 5000) {
      throw new Error(`Order amount (${roundedAmount} DH) exceeds Sendit maximum limit of 5000 DH. Please split the order or use alternative delivery method.`)
    }

    // Validate minimum requirements
    if (!shipment.recipient_name || shipment.recipient_name.length < 2) {
      throw new Error('Recipient name is required (min 2 characters)')
    }
    if (!shipment.recipient_address || shipment.recipient_address.length < 5) {
      throw new Error('Recipient address is required (min 5 characters)')
    }

    const deliveryData: SenditDelivery = {
      pickup_district_id: PICKUP_DISTRICT_ID,
      district_id: districtId,
      name: shipment.recipient_name,
      phone: formattedPhone,  // Use formatted phone!
      address: shipment.recipient_address,
      amount: roundedAmount,
      reference: shipment.reference,
      comment: comment,
      allow_open: 1,
      allow_try: 1,
      products: productsDescription,  // Products go here, NOT in comment
      products_from_stock: 0,
    }

    console.log('📝 Delivery payload:', JSON.stringify(deliveryData, null, 2))

    const response = await senditRequest('/deliveries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deliveryData),
    })

    console.log('📡 Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Sendit API error:', errorText)
      throw new Error(`API error ${response.status}: ${errorText}`)
    }

    const data: SenditDeliveryResponse = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to create delivery')
    }

    console.log('✅ Delivery created:', data.data.code)

    // Map to our response format
    return {
      success: true,
      tracking_id: data.data.code,
      barcode: data.data.code,
      status: data.data.status,
      shipping_cost: data.data.fee,
      destination_district_id: Number(data.data.district?.id) || undefined,
      destination_district_name: data.data.district?.name || undefined,
      message: data.message,
    }

  } catch (error: unknown) {
    console.error('❌ Create shipment error:', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: errorMessage(error),
      cause: error instanceof Error ? error.cause : undefined,
    })
    throw new Error(`Sendit shipment creation failed: ${errorMessage(error)}`)
  }
}

/**
 * Get shipment tracking info
 */
export async function getShipmentTracking(trackingId: string): Promise<SenditTrackingResponse> {
  console.log('🔍 Getting tracking for:', trackingId)

  try {
    const response = await senditRequest(`/deliveries/${encodeURIComponent(trackingId)}`)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get tracking: ${response.status} ${errorText}`)
    }

    const data: SenditDeliveryResponse = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to get tracking')
    }

    // Map to our tracking format
    return {
      tracking_id: data.data.code,
      status: data.data.status,
      amount: Number(data.data.amount) || 0,
      fee: Number(data.data.fee) || 0,
      last_action_at: data.data.last_action_at || undefined,
      destination_district_id: Number(data.data.district?.id) || undefined,
      destination_district_name: data.data.district?.name || undefined,
      status_history: (data.data.audits || []).map((audit) => ({
        status: audit.data?.status || audit.event || data.data.status,
        location: audit.data?.district ? String(audit.data.district) : '',
        timestamp: audit.created_at || data.data.last_action_at || '',
        note: [audit.event, audit.user, audit.data?.comment].filter(Boolean).join(' - ') || undefined,
      })),
    }

  } catch (error: unknown) {
    console.error('❌ Get tracking error:', error)
    throw new Error(`Failed to get tracking: ${errorMessage(error)}`)
  }
}

export type SenditParcelState =
  | { state: 'exists'; status: string }
  | { state: 'gone' }
  | { state: 'unknown'; detail: string }

/**
 * LE COLIS EXISTE-T-IL ENCORE CHEZ SENDIT ?
 *
 * Trois réponses, pas deux — et c'est tout l'intérêt de cette fonction.
 * `getShipmentTracking` lève la même exception qu'on lui rende un 404 (le colis a
 * été supprimé) ou un 500 (Sendit est en panne). Confondre les deux serait grave
 * dans un seul sens : conclure « supprimé » alors que Sendit est simplement
 * injoignable ferait recréer un colis qui existe encore, et la cliente en
 * recevrait deux.
 *
 * Donc : seul un 404 franc vaut `gone`. Toute autre panne rend `unknown`, et
 * l'appelant doit refuser d'agir plutôt que de deviner.
 */
export async function senditParcelState(trackingId: string): Promise<SenditParcelState> {
  try {
    const response = await senditRequest(`/deliveries/${encodeURIComponent(trackingId)}`)

    if (response.status === 404) {
      await response.body?.cancel().catch(() => {})
      return { state: 'gone' }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { state: 'unknown', detail: `HTTP ${response.status} ${detail}`.trim() }
    }

    const data: SenditDeliveryResponse = await response.json()

    /* Sendit répond parfois 200 avec `success: false` pour un colis absent. Ce
       n'est pas une panne : l'API a répondu, et elle dit qu'elle ne l'a pas. */
    if (!data.success || !data.data?.code) {
      return { state: 'gone' }
    }

    return { state: 'exists', status: String(data.data.status || '') }
  } catch (error: unknown) {
    // Réseau coupé, DNS, délai dépassé : on ne sait pas, et on l'assume.
    return { state: 'unknown', detail: errorMessage(error) }
  }
}

/**
 * Cancel a shipment
 */
export async function cancelShipment(trackingId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await senditRequest(`/deliveries/${encodeURIComponent(trackingId)}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to cancel: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    return data

  } catch (error: unknown) {
    console.error('❌ Cancel shipment error:', error)
    throw new Error(`Failed to cancel shipment: ${errorMessage(error)}`)
  }
}

/**
 * Get delivery cost estimate
 */
export async function getDeliveryCostEstimate(city: string, weight: number = 0.5): Promise<number> {
  void weight

  const normalizedCity = city.trim().toLowerCase()
  if (!normalizedCity) return 0

  const districts = await getAllDistricts()
  const district = districts.find((item) =>
    item.name.toLowerCase() === normalizedCity ||
    item.ville.toLowerCase() === normalizedCity
  )

  return district?.price || 0
}

export interface SenditDeliveryListItem {
  code: string
  status: string
  name: string
  phone: string
  amount: number
  fee: number
  city: string
  products: string | null
  comment: string | null
  reference: string | null
  createdAt: string | null
  lastActionAt: string | null
}

export interface SenditDeliverySnapshot {
  deliveries: SenditDeliveryListItem[]
  pages: number
  lastPage: number
  apiCalls: number
  retries: number
  authCalls: number
}

/**
 * List ALL deliveries from Sendit (paginated). Read-only — used by the
 * reconciliation lab to compare Sendit (source of truth for delivered + COD)
 * against the BOS.
 */
export async function listSenditDeliveriesSnapshot(maxPages = 60): Promise<SenditDeliverySnapshot> {
  const all: SenditDeliveryListItem[] = []
  const metrics: SenditRequestMetrics = { httpCalls: 0, retries: 0, authCalls: 0 }
  let page = 1
  let lastPage = 1
  do {
    const res = await senditRequest(`/deliveries?page=${page}`, {}, metrics)
    if (!res.ok) throw new Error(`Failed to list deliveries: ${res.status} ${await res.text()}`)
    const data = await res.json()
    for (const d of (data.data || [])) {
      all.push({
        code: d.code,
        status: d.status,
        name: d.name || '',
        phone: d.phone || '',
        amount: Number(d.amount) || 0,
        fee: Number(d.fee) || 0,
        city: d.district?.name || d.district?.ville || '',
        products: d.products || null,
        comment: d.comment || null,
        reference: d.reference || null,
        createdAt: d.created_at || null,
        lastActionAt: d.last_action_at || null,
      })
    }
    lastPage = data.last_page || 1
    if (lastPage > maxPages) {
      throw new Error(`Sendit history has ${lastPage} pages; safety limit is ${maxPages}. Refusing a truncated ledger.`)
    }
    page++
  } while (page <= lastPage)
  return {
    deliveries: all,
    pages: Math.max(0, page - 1),
    lastPage,
    apiCalls: metrics.httpCalls,
    retries: metrics.retries,
    authCalls: metrics.authCalls,
  }
}

export async function listAllSenditDeliveries(maxPages = 60): Promise<SenditDeliveryListItem[]> {
  return (await listSenditDeliveriesSnapshot(maxPages)).deliveries
}

/**
 * Get all districts (cities/neighborhoods) from Sendit
 */
export async function getAllDistricts(): Promise<SenditDistrict[]> {
  console.log('🏙️  Fetching Sendit districts...')

  try {
    const allDistricts: SenditDistrict[] = []
    let currentPage = 1
    let lastPage = 1

    // Fetch all pages
    do {
      const response = await senditRequest(`/districts?page=${currentPage}&pickup-district=${PICKUP_DISTRICT_ID}`)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch districts: ${response.status} ${errorText}`)
      }

      const data: SenditDistrictsResponse = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch districts')
      }

      allDistricts.push(...data.data)
      lastPage = data.last_page
      currentPage++

      console.log(`📄 Fetched page ${currentPage - 1}/${lastPage} (${data.data.length} districts)`)

    } while (currentPage <= lastPage)

    console.log(`✅ Total districts fetched: ${allDistricts.length}`)
    return allDistricts

  } catch (error: unknown) {
    console.error('❌ Get districts error:', error)
    throw new Error(`Failed to get districts: ${errorMessage(error)}`)
  }
}
