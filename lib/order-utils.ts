import type { Order, OrderItem, Product } from '@/lib/types'

/**
 * Check if order has all required data for profit calculation
 */
export interface OrderCompleteness {
  isComplete: boolean
  score: number // 0-100
  missing: string[]
  canCalculateProfit: boolean
}

export function checkOrderCompleteness(
  order: Order,
  items: OrderItem[],
  products: Product[]
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

  if (!order.deliveryAddress) missing.push('Customer address')
  else completedFields++

  // Products (1 field)
  if (!items || items.length === 0) {
    missing.push('Products')
  } else {
    completedFields++
  }

  // Product costs (1 field)
  const itemsWithoutCost = items.filter(item => !item.unitCost || item.unitCost === 0)
  if (itemsWithoutCost.length > 0) {
    missing.push(`Product cost prices (${itemsWithoutCost.length} items)`)
  } else if (items.length > 0) {
    completedFields++
  }

  // Delivery fees (2 fields)
  if (!order.deliveryFeeCharged && order.deliveryFeeCharged !== 0) {
    missing.push('Delivery fee charged to customer')
  } else {
    completedFields++
  }

  if (!order.estimatedDeliveryCost && order.estimatedDeliveryCost !== 0) {
    missing.push('Estimated delivery cost')
  } else {
    completedFields++
  }

  // Payment method (1 field)
  if (!order.paymentMethod) {
    missing.push('Payment method')
  } else {
    completedFields++
  }

  // Source channel (1 field)
  if (!order.sourceChannel) {
    missing.push('Source channel')
  } else {
    completedFields++
  }

  const score = Math.round((completedFields / totalFields) * 100)
  const isComplete = missing.length === 0

  // Can calculate profit if we have product costs and delivery estimates
  const canCalculateProfit =
    items.length > 0 &&
    items.every(item => item.unitCost && item.unitCost > 0) &&
    (order.estimatedDeliveryCost !== null && order.estimatedDeliveryCost !== undefined)

  return {
    isComplete,
    score,
    missing,
    canCalculateProfit,
  }
}

/**
 * Calculate order totals and profit
 */
export interface OrderTotals {
  productsTotal: number
  revenue: number
  totalCost: number
  estimatedProfit: number
  finalProfit?: number
  marginPercent: number
}

export function calculateOrderTotals(
  order: Order,
  items: OrderItem[]
): OrderTotals | null {
  if (items.length === 0) return null

  // Products total
  const productsTotal = items.reduce((sum, item) => {
    return sum + (item.unitPrice * item.quantity)
  }, 0)

  // Revenue (after discount)
  const revenue = productsTotal - (order.discountTotal || 0)

  // Total product cost
  const totalCost = items.reduce((sum, item) => {
    const unitCost = item.unitCost || 0
    return sum + (unitCost * item.quantity)
  }, 0)

  // Estimated profit
  const estimatedDeliveryCost = order.estimatedDeliveryCost || 0
  const estimatedProfit = revenue - totalCost - estimatedDeliveryCost

  // Final profit (if Sendit data available)
  let finalProfit: number | undefined
  if (order.actualDeliveryCost !== null && order.actualDeliveryCost !== undefined) {
    const codAmount = order.codAmount || revenue
    const actualDeliveryCost = order.actualDeliveryCost
    const returnFees = order.returnOrFailedFees || 0
    finalProfit = codAmount - totalCost - actualDeliveryCost - returnFees
  }

  // Margin %
  const profit = finalProfit !== undefined ? finalProfit : estimatedProfit
  const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0

  return {
    productsTotal,
    revenue,
    totalCost,
    estimatedProfit,
    finalProfit,
    marginPercent,
  }
}

/**
 * Generate unique order number
 */
export function generateOrderNumber(): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()

  return `ORD-${year}${month}${day}-${random}`
}

/**
 * Get products that need cost prices
 */
export function getProductsNeedingCosts(products: Product[]): Product[] {
  return products.filter(p => !p.costPrice || p.costPrice === 0)
}

/**
 * Estimate delivery cost based on city (Morocco)
 */
export function estimateDeliveryCost(city: string): number {
  const cityLower = city.toLowerCase()

  // Major cities (cheaper)
  const majorCities = ['casablanca', 'rabat', 'salé', 'kenitra', 'mohammedia']
  if (majorCities.some(c => cityLower.includes(c))) {
    return 25
  }

  // Medium cities
  const mediumCities = ['marrakech', 'fes', 'tanger', 'agadir', 'oujda', 'meknes']
  if (mediumCities.some(c => cityLower.includes(c))) {
    return 35
  }

  // Default (remote areas)
  return 45
}
