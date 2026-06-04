// Sendit API Integration
// Docs: https://sendit.ma/api-docs

const SENDIT_API_URL = 'https://api.sendit.ma/v1'
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY!
const PRIVATE_KEY = process.env.SENDIT_PRIVATE_KEY!

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
