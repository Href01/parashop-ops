/**
 * Safe number operations
 * Prevents string concatenation bugs
 */

/**
 * Convert to number safely
 * Throws if value is not a valid number
 */
export function toNumber(value: unknown, fieldName: string = 'value'): number {
  const num = Number(value)

  if (!Number.isFinite(num)) {
    throw new Error(`${fieldName} must be a valid number, got: ${value} (${typeof value})`)
  }

  return num
}

/**
 * Convert to positive number
 */
export function toPositiveNumber(value: unknown, fieldName: string = 'value'): number {
  const num = toNumber(value, fieldName)

  if (num <= 0) {
    throw new Error(`${fieldName} must be positive, got: ${num}`)
  }

  return num
}

/**
 * Convert to non-negative number
 */
export function toNonNegativeNumber(value: unknown, fieldName: string = 'value'): number {
  const num = toNumber(value, fieldName)

  if (num < 0) {
    throw new Error(`${fieldName} cannot be negative, got: ${num}`)
  }

  return num
}

/**
 * Convert to integer
 */
export function toInteger(value: unknown, fieldName: string = 'value'): number {
  const num = toNumber(value, fieldName)
  return Math.round(num)
}

/**
 * Safe addition (prevents string concatenation)
 */
export function safeAdd(...values: unknown[]): number {
  return values.reduce((sum: number, val) => sum + toNumber(val), 0)
}

/**
 * Calculate order total safely
 */
export function calculateOrderTotal(
  productsTotal: unknown,
  discountTotal: unknown,
  deliveryFee: unknown
): number {
  const products = toNonNegativeNumber(productsTotal, 'productsTotal')
  const discount = toNonNegativeNumber(discountTotal, 'discountTotal')
  const delivery = toNonNegativeNumber(deliveryFee, 'deliveryFee')

  const total = products - discount + delivery

  if (total < 0) {
    throw new Error(`Order total cannot be negative: ${products} - ${discount} + ${delivery} = ${total}`)
  }

  return total
}
