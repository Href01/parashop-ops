export type OrderPaymentMethod = 'COD' | 'VIREMENT' | 'CARD'

type OrderEconomicsInput = {
  productsTotal: number
  discountTotal: number
  deliveryFeeCharged: number
  paymentMethod: string | null
  paidAmount: number | null
  currentCodAmount: number | null
  hasSenditShipment: boolean
  currentPaymentStatus: string | null
}

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
}

export function calculateEditedOrderEconomics(input: OrderEconomicsInput) {
  const productsTotal = Math.max(0, money(input.productsTotal))
  const discountTotal = Math.min(productsTotal, Math.max(0, money(input.discountTotal)))
  const deliveryFeeCharged = Math.max(0, money(input.deliveryFeeCharged))
  const revenue = money(productsTotal - discountTotal)
  const total = money(revenue + deliveryFeeCharged)
  const paymentMethod = String(input.paymentMethod || 'COD').toUpperCase() as OrderPaymentMethod
  const prepaid = paymentMethod === 'VIREMENT' || paymentMethod === 'CARD'

  // codAmount is a carrier collection amount, not a generic cash field. A
  // hand-to-hand COD order therefore keeps it null and uses Order.total.
  const codAmount = !prepaid && (input.hasSenditShipment || input.currentCodAmount != null)
    ? total
    : null

  let paymentStatus = input.currentPaymentStatus
  if (prepaid) {
    const paidAmount = Math.max(0, money(input.paidAmount || 0))
    paymentStatus = paidAmount <= 0
      ? 'UNVERIFIED'
      : paidAmount + 0.01 >= total
        ? 'PAID'
        : 'PARTIAL'
  }

  return {
    productsTotal,
    discountTotal,
    revenue,
    total,
    codAmount,
    paymentStatus,
    overpaidAmount: prepaid ? Math.max(0, money((input.paidAmount || 0) - total)) : 0,
  }
}
