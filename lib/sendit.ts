// Sendit API Integration
// Docs: https://app.sendit.ma/api/documentation
// API Base: https://app.sendit.ma/api/v1

import { formatPhoneForSendit } from './utils/phone'
import { toInteger } from './utils/numbers'

const SENDIT_API_URL = 'https://app.sendit.ma/api/v1'
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || ''
const PRIVATE_KEY = process.env.SENDIT_PRIVATE_KEY || ''
const PICKUP_DISTRICT_ID = parseInt(process.env.SENDIT_PICKUP_DISTRICT_ID || '1') // Default: Casablanca

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
async function getAuthToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  console.log('🔐 Logging in to Sendit API...')

  try {
    const response = await fetch(`${SENDIT_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_key: PUBLIC_KEY,
        secret_key: PRIVATE_KEY,
      }),
    })

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
    console.log('✅ Sendit login successful')

    return cachedToken
  } catch (error: any) {
    console.error('❌ Sendit login error:', error)
    throw new Error(`Failed to authenticate with Sendit: ${error.message}`)
  }
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
    } catch (error: any) {
      throw new Error(`Invalid phone number: ${shipment.recipient_phone}. ${error.message}`)
    }

    // Get auth token
    const token = await getAuthToken()

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

    const response = await fetch(`${SENDIT_API_URL}/deliveries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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

  } catch (error: any) {
    console.error('❌ Create shipment error:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
    })
    throw new Error(`Sendit shipment creation failed: ${error.message}`)
  }
}

/**
 * Get shipment tracking info
 */
export async function getShipmentTracking(trackingId: string): Promise<SenditTrackingResponse> {
  console.log('🔍 Getting tracking for:', trackingId)

  try {
    const token = await getAuthToken()

    const response = await fetch(`${SENDIT_API_URL}/deliveries/${trackingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

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

  } catch (error: any) {
    console.error('❌ Get tracking error:', error)
    throw new Error(`Failed to get tracking: ${error.message}`)
  }
}

/**
 * Cancel a shipment
 */
export async function cancelShipment(trackingId: string): Promise<{ success: boolean; message: string }> {
  try {
    const token = await getAuthToken()

    const response = await fetch(`${SENDIT_API_URL}/deliveries/${trackingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to cancel: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    return data

  } catch (error: any) {
    console.error('❌ Cancel shipment error:', error)
    throw new Error(`Failed to cancel shipment: ${error.message}`)
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

/**
 * List ALL deliveries from Sendit (paginated). Read-only — used by the
 * reconciliation lab to compare Sendit (source of truth for delivered + COD)
 * against the BOS.
 */
export async function listAllSenditDeliveries(maxPages = 60): Promise<SenditDeliveryListItem[]> {
  const token = await getAuthToken()
  const all: SenditDeliveryListItem[] = []
  let page = 1
  let lastPage = 1
  do {
    const res = await fetch(`${SENDIT_API_URL}/deliveries?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
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
    page++
  } while (page <= lastPage && page <= maxPages)
  return all
}

/**
 * Get all districts (cities/neighborhoods) from Sendit
 */
export async function getAllDistricts(): Promise<SenditDistrict[]> {
  console.log('🏙️  Fetching Sendit districts...')

  try {
    const token = await getAuthToken()
    const allDistricts: SenditDistrict[] = []
    let currentPage = 1
    let lastPage = 1

    // Fetch all pages
    do {
      const response = await fetch(`${SENDIT_API_URL}/districts?page=${currentPage}&pickup-district=${PICKUP_DISTRICT_ID}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

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

  } catch (error: any) {
    console.error('❌ Get districts error:', error)
    throw new Error(`Failed to get districts: ${error.message}`)
  }
}
