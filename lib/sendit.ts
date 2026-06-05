// Sendit API Integration
// Docs: https://sendit.ma/api-docs

const SENDIT_API_URL = 'https://api.sendit.ma/v1'
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || ''
const PRIVATE_KEY = process.env.SENDIT_PRIVATE_KEY || ''
const USE_MOCK = !PUBLIC_KEY || !PRIVATE_KEY || process.env.SENDIT_MOCK_MODE === 'true'

if (USE_MOCK) {
  console.warn('⚠️  Sendit API running in MOCK MODE - set SENDIT_PUBLIC_KEY and SENDIT_PRIVATE_KEY to use real API')
}

interface SenditShipment {
  reference: string // Your internal order number
  recipient_name: string
  recipient_phone: string
  recipient_city: string
  recipient_address: string
  recipient_zip_code?: string
  cod_amount?: number // Cash on delivery amount
  package_weight?: number // In kg
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

/**
 * Create a new Sendit shipment
 */
export async function createSenditShipment(shipment: SenditShipment): Promise<SenditShipmentResponse> {
  // MOCK MODE: Return fake shipment data for development
  if (USE_MOCK) {
    console.log('🧪 MOCK: Creating Sendit shipment:', shipment)
    const mockTrackingId = `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
    const mockBarcode = Math.floor(100000000000 + Math.random() * 900000000000).toString()

    return {
      success: true,
      tracking_id: mockTrackingId,
      barcode: mockBarcode,
      status: 'PENDING_PICKUP',
      estimated_delivery_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      shipping_cost: estimateDeliveryCostManual(shipment.recipient_city),
      message: 'Mock shipment created (DEVELOPMENT MODE)',
    }
  }

  // REAL MODE: Call actual Sendit API
  try {
    const response = await fetch(`${SENDIT_API_URL}/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': PUBLIC_KEY,
        'X-Private-Key': PRIVATE_KEY,
      },
      body: JSON.stringify({
        ...shipment,
        package_weight: shipment.package_weight || 0.5, // Default 500g
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create shipment')
    }

    const data = await response.json()
    return data
  } catch (error: any) {
    console.error('Sendit API error:', error)
    throw new Error(`Sendit shipment creation failed: ${error.message}`)
  }
}

/**
 * Get shipment tracking info
 */
export async function getShipmentTracking(trackingId: string): Promise<SenditTrackingResponse> {
  // MOCK MODE: Return fake tracking data
  if (USE_MOCK || trackingId.startsWith('MOCK-')) {
    console.log('🧪 MOCK: Getting tracking for:', trackingId)
    return {
      tracking_id: trackingId,
      status: 'IN_TRANSIT',
      status_history: [
        {
          status: 'PENDING_PICKUP',
          location: 'Casablanca Hub',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          note: 'Shipment created',
        },
        {
          status: 'PICKED_UP',
          location: 'Casablanca Hub',
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          note: 'Package collected',
        },
        {
          status: 'IN_TRANSIT',
          location: 'En route',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          note: 'In transit to destination',
        },
      ],
      estimated_delivery: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      actual_delivery: undefined,
    }
  }

  // REAL MODE: Call actual Sendit API
  try {
    const response = await fetch(`${SENDIT_API_URL}/shipments/${trackingId}`, {
      headers: {
        'X-Public-Key': PUBLIC_KEY,
        'X-Private-Key': PRIVATE_KEY,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to get tracking info')
    }

    const data = await response.json()
    return data
  } catch (error: any) {
    console.error('Sendit tracking error:', error)
    throw new Error(`Failed to get tracking: ${error.message}`)
  }
}

/**
 * Cancel a shipment
 */
export async function cancelShipment(trackingId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${SENDIT_API_URL}/shipments/${trackingId}/cancel`, {
      method: 'POST',
      headers: {
        'X-Public-Key': PUBLIC_KEY,
        'X-Private-Key': PRIVATE_KEY,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to cancel shipment')
    }

    return await response.json()
  } catch (error: any) {
    console.error('Sendit cancel error:', error)
    throw new Error(`Failed to cancel shipment: ${error.message}`)
  }
}

/**
 * Get delivery cost estimate
 */
export async function getDeliveryCostEstimate(city: string, weight: number = 0.5): Promise<number> {
  try {
    const response = await fetch(`${SENDIT_API_URL}/estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': PUBLIC_KEY,
      },
      body: JSON.stringify({ city, weight }),
    })

    if (!response.ok) {
      // Fallback to manual estimation if API fails
      return estimateDeliveryCostManual(city)
    }

    const data = await response.json()
    return data.cost || estimateDeliveryCostManual(city)
  } catch (error) {
    // Fallback to manual estimation
    return estimateDeliveryCostManual(city)
  }
}

/**
 * Manual delivery cost estimation (fallback)
 */
function estimateDeliveryCostManual(city: string): number {
  const cityLower = city.toLowerCase()

  // Casablanca - cheapest
  if (cityLower.includes('casa')) return 25

  // Major cities
  const majorCities = ['rabat', 'marrakech', 'tanger', 'fes', 'agadir', 'meknes', 'oujda', 'kenitra', 'tetouan', 'sale']
  if (majorCities.some(c => cityLower.includes(c))) return 35

  // Remote cities
  return 45
}
