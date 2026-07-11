import { z } from 'zod'
import { normalizePaymentMethod } from '@/lib/order-utils'

/**
 * Phone number validation and formatting
 * Morocco format: 06XXXXXXXX or 07XXXXXXXX (10 digits)
 * Sendit requires: +212XXXXXXXXX or 0XXXXXXXXX
 */
export const MoroccoPhoneSchema = z.string()
  .trim()
  .transform(phone => phone.replace(/\s+/g, '')) // Remove all spaces
  .refine(
    phone => /^(06|07)\d{8}$/.test(phone),
    'Phone must be 10 digits starting with 06 or 07 (e.g., 0612345678)'
  )

/**
 * Sendit phone format: Must be 06/07 + 8 digits
 */
export const SenditPhoneSchema = MoroccoPhoneSchema

/**
 * Numeric fields that must be positive numbers
 * Prevents string concatenation bugs
 */
export const PositiveNumberSchema = z.union([
  z.number().positive(),
  z.string().regex(/^\d+(\.\d+)?$/).transform(Number)
]).transform(n => Number(n))

export const NonNegativeNumberSchema = z.union([
  z.number().min(0),
  z.string().regex(/^\d+(\.\d+)?$/).transform(Number)
]).transform(n => Number(n))

/**
 * Order creation validation
 */
export const CreateOrderSchema = z.object({
  sourceChannel: z.string().min(1),

  // Delivery info
  deliveryName: z.string().min(2, 'Name must be at least 2 characters'),
  deliveryPhone: MoroccoPhoneSchema,
  deliveryCity: z.string().min(2),
  deliveryAddress: z.string().optional(),
  deliveryNotes: z.string().optional(),
  senditDistrictId: z.number().int().positive().optional(), // Sendit district chosen by customer

  // Payment
  paymentMethod: z.preprocess(
    normalizePaymentMethod,
    z.enum(['COD', 'VIREMENT', 'CARD'])
  ),
  paidAmount: NonNegativeNumberSchema.optional(),
  paidAt: z.string().date().optional(),
  paymentReference: z.string().trim().max(120).optional(),

  // Items
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive().max(100),
    unitPrice: PositiveNumberSchema,
  })),

  // Pricing (CRITICAL: Must be numbers, not strings!)
  discountTotal: NonNegativeNumberSchema.default(0),
  deliveryFeeCharged: NonNegativeNumberSchema.default(0),
  estimatedDeliveryCost: NonNegativeNumberSchema.default(0),

  // Optional
  promoCode: z.string().optional(),
  notes: z.string().optional(),
  confirmImmediately: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.paymentMethod === 'VIREMENT') {
    if (!(Number(data.paidAmount) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAmount'], message: 'Bank transfer amount is required' })
    }
    if (!data.paidAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAt'], message: 'Bank transfer date is required' })
    }
  }
}).transform(data => {
  // Calculate total server-side to prevent manipulation
  const productsTotal = data.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
  const revenue = productsTotal - data.discountTotal
  const total = revenue + data.deliveryFeeCharged

  return {
    ...data,
    productsTotal,
    revenue,
    total,
  }
})

/**
 * Sendit shipment validation
 * Prevents API 422 errors
 */
export const SenditShipmentSchema = z.object({
  reference: z.string().min(1),
  recipient_name: z.string().min(2),
  recipient_phone: SenditPhoneSchema,
  recipient_city: z.string().min(2),
  recipient_address: z.string().min(5),

  // CRITICAL: Sendit amount rules
  cod_amount: z.number()
    .int('Amount must be integer (no decimals)')
    .min(0)
    .max(5000, 'Sendit maximum is 5000 DH')
    .optional(),

  package_weight: z.number().positive().max(50).optional(),
  package_description: z.string().optional(),
  notes: z.string().optional(),
}).transform(data => ({
  ...data,
  // Ensure amount is integer
  cod_amount: data.cod_amount ? Math.round(data.cod_amount) : undefined,
}))

/**
 * Update order validation (only allows specific fields)
 */
export const UpdateOrderSchema = z.object({
  deliveryName: z.string().min(2).optional(),
  deliveryPhone: MoroccoPhoneSchema.optional(),
  deliveryCity: z.string().min(2).optional(),
  deliveryAddress: z.string().optional(),
  deliveryNotes: z.string().optional(),
  deliveryFeeCharged: NonNegativeNumberSchema.optional(),
  estimatedDeliveryCost: NonNegativeNumberSchema.optional(),
  discountTotal: NonNegativeNumberSchema.optional(),
  notes: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED']).optional(),
}).strict() // Reject unknown fields
