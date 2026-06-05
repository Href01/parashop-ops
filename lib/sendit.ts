// Sendit API Integration
// Docs: https://app.sendit.ma/api/documentation

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
  message?: string
}

interface SenditTrackingResponse {
  tracking_id: string
  status: string
  status_history: Array<{
    status: string
    location: string
    timestamp: string
    note?: string
  }>
  estimated_delivery?: string
  actual_delivery?: string
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
 * Get district ID from city name
 */
function getDistrictId(city: string): number {
  const cityLower = city.toLowerCase()

  // Map common city names to district IDs
  // TODO: Fetch from API /districts endpoint for complete list
  if (cityLower.includes('casa')) return 1
  if (cityLower.includes('rabat')) return 2
  if (cityLower.includes('marrakech')) return 3
  if (cityLower.includes('tanger')) return 4
  if (cityLower.includes('fes')) return 5

  // Default to Casablanca if unknown
  return 1
}

/**
 * Estimate delivery cost based on city
 */
function estimateDeliveryCost(city: string): number {
  const cityLower = city.toLowerCase()

  if (cityLower.includes('casa')) return 25
  if (['rabat', 'marrakech', 'tanger', 'fes', 'agadir'].some(c => cityLower.includes(c))) return 35
  return 45
}

/**
 * Create a new Sendit shipment
 */
export async function createSenditShipment(shipment: SenditShipment): Promise<SenditShipmentResponse> {
  console.log('🚀 Creating Sendit delivery...')
  console.log('📦 Shipment:', shipment)

  try {
    // Get auth token
    const token = await getAuthToken()

    // Get district ID from city name
    const districtId = getDistrictId(shipment.recipient_city)

    // Create delivery
    const deliveryData: SenditDelivery = {
      pickup_district_id: PICKUP_DISTRICT_ID,
      district_id: districtId,
      name: shipment.recipient_name,
      phone: shipment.recipient_phone,
      address: shipment.recipient_address,
      amount: shipment.cod_amount || 0,
      reference: shipment.reference,
      comment: shipment.notes,
      allow_open: 1,
      allow_try: 1,
    }

    console.log('📝 Delivery payload:', deliveryData)

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
      status_history: [], // TODO: Parse from audits if available
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
  // Use manual estimation for now
  return estimateDeliveryCost(city)
}
