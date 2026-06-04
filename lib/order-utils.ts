/**
 * Order utility functions for BOS
 */

/**
 * Generate unique order number in format: ORD-YYMMDD-XXXX
 */
export function generateOrderNumber(): string {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')

  // Random 4-digit number
  const random = Math.floor(1000 + Math.random() * 9000)

  return `ORD-${year}${month}${day}-${random}`
}

/**
 * Estimate delivery cost based on city
 */
export function estimateDeliveryCost(city: string): number {
  const cityLower = city.toLowerCase()

  // Casablanca
  if (cityLower.includes('casa')) return 25

  // Major cities
  const majorCities = ['rabat', 'marrakech', 'tanger', 'fes', 'agadir', 'tangier', 'fez']
  if (majorCities.some(c => cityLower.includes(c))) return 35

  // Remote/other cities
  return 45
}

/**
 * Calculate order totals and profit
 */
export interface OrderTotals {
  subtotal: number
  total: number
  revenue: number
  estimatedCost: number
  estimatedProfit: number
  marginPercent: number
}

export function calculateOrderTotals(
  items: Array<{ quantity: number; price: number; costPrice?: number }>,
  deliveryFee: number,
  discount: number = 0
): OrderTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const revenue = subtotal - discount
  const total = revenue + deliveryFee

  const estimatedCost = items.reduce(
    (sum, item) => sum + (item.costPrice || 0) * item.quantity,
    0
  )

  const estimatedProfit = revenue - estimatedCost - deliveryFee
  const marginPercent = revenue > 0 ? (estimatedProfit / revenue) * 100 : 0

  return {
    subtotal,
    total,
    revenue,
    estimatedCost,
    estimatedProfit,
    marginPercent,
  }
}

/**
 * Check order completeness for data quality
 */
export interface OrderCompleteness {
  isComplete: boolean
  score: number // 0-100
  missing: string[]
  canCalculateProfit: boolean
}

export function checkOrderCompleteness(
  order: any,
  items: any[],
  products: any[]
): OrderCompleteness {
  const missing: string[] = []
  let completedFields = 0
  const totalFields = 10

  // Customer info (4 fields)
  if (!order.deliveryName) missing.push('Customer name')
  else completedFields++

  if (!order.deliveryPhone) missing.push('Customer phone')
  else completedFields++

  if (!order.deliveryCity) missing.push('Customer city')
  else completedFields++

  if (!order.deliveryAddress) missing.push('Delivery address')
  else completedFields++

  // Products (1 field)
  if (!items || items.length === 0) missing.push('Order items')
  else completedFields++

  // Product cost prices (1 field)
  const itemsWithCost = items.filter(item => {
    const product = products.find(p => p.id === item.productId)
    return product && product.costPrice && product.costPrice > 0
  })

  if (itemsWithCost.length !== items.length) {
    missing.push('Product cost prices')
  } else {
    completedFields++
  }

  // Delivery info (2 fields)
  if (!order.deliveryFeeCharged && order.deliveryFeeCharged !== 0) {
    missing.push('Delivery fee charged')
  } else {
    completedFields++
  }

  if (!order.estimatedDeliveryCost) missing.push('Estimated delivery cost')
  else completedFields++

  // Payment & source (2 fields)
  if (!order.paymentMethod) missing.push('Payment method')
  else completedFields++

  if (!order.sourceChannel) missing.push('Source channel')
  else completedFields++

  const score = (completedFields / totalFields) * 100
  const isComplete = missing.length === 0
  const canCalculateProfit = itemsWithCost.length === items.length

  return {
    isComplete,
    score,
    missing,
    canCalculateProfit,
  }
}
