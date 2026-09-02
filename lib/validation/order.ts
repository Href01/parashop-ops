import { z } from 'zod'
import { normalizePaymentMethod } from '@/lib/order-utils'

const MARKETPLACE_CHANNELS = new Set(['Jumia', 'Marjane Mall'])

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
  /* Optionnel au niveau du schema, EXIGE plus bas pour tout ce qui n'est pas
     une place de marche : Jumia ne communique pas le numero de la cliente, et
     un champ obligatoire rendait la saisie tout simplement impossible.
     Consequence assumee : ces ventes ne comptent pas dans « clientes », qui
     denombre les numeros distincts. C'est exact — on ne sait pas qui elles
     sont — plutot que de gonfler le compte avec un numero invente. */
  deliveryPhone: MoroccoPhoneSchema.optional(),
  deliveryCity: z.string().min(2),
  deliveryAddress: z.string().trim().optional(),
  deliveryNotes: z.string().optional(),
  senditDistrictId: z.number().int().positive().optional(), // Sendit district chosen by customer

  /**
   * REMISE EN MAIN PROPRE — le produit change de mains, sans transporteur.
   *
   * Les districts viennent de l'API Sendit : ce sont tous des zones de livraison
   * FACTUREES, il n'en existe aucune a 0 MAD. Une vente donnee de la main a la
   * main n'avait donc aucune facon d'etre saisie, et finissait en ajustement de
   * stock — le produit disparaissait de l'inventaire sans recette en face, ce
   * qui se lit comme de la demarque et non comme une vente.
   *
   * Quand ce drapeau est leve : pas de district, frais forces a 0, et la
   * commande naît DELIVERED puisque la marchandise est deja partie.
   */
  handToHand: z.boolean().default(false),

  /** Vrai pour Jumia, Marjane Mall… : elles livrent, facturent leur commission
   *  et ne transmettent pas le numero de la cliente. */
  marketplace: z.boolean().default(false),

  /**
   * COMMISSION DE PLACE DE MARCHE, en MAD, figee a la vente.
   *
   * Jumia et Marjane Mall vendent NOTRE stock a LEUR prix et prelevent leur
   * part. Sans elle, une vente marketplace paraitrait plus rentable qu'elle ne
   * l'est — et on deplacerait son effort dans la mauvaise direction avec des
   * chiffres qui ont l'air justes.
   */
  channelCommission: NonNegativeNumberSchema.default(0),

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
  })).min(1, 'Ajoute au moins un produit'),

  // Pricing (CRITICAL: Must be numbers, not strings!)
  discountTotal: NonNegativeNumberSchema.default(0),
  deliveryFeeCharged: NonNegativeNumberSchema.default(0),
  estimatedDeliveryCost: NonNegativeNumberSchema.default(0),

  // Optional
  promoCode: z.string().optional(),
  notes: z.string().optional(),
  confirmImmediately: z.boolean().default(false),
}).superRefine((data, ctx) => {
  const produits = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const total = produits - Number(data.discountTotal) + Number(data.deliveryFeeCharged)
  const marketplaceExpected = MARKETPLACE_CHANNELS.has(data.sourceChannel)

  if (data.marketplace !== marketplaceExpected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['marketplace'],
      message: 'Le mode marketplace ne correspond pas au canal sélectionné',
    })
  }

  const duplicateProduct = data.items.find((item, index) =>
    data.items.findIndex((candidate) => candidate.productId === item.productId) !== index
  )
  if (duplicateProduct) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['items'],
      message: 'Un produit ne peut apparaître qu’une seule fois',
    })
  }

  if (Number(data.discountTotal) > produits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['discountTotal'],
      message: `La remise ne peut pas dépasser ${produits.toFixed(2)} MAD`,
    })
  }

  /* Le district reste obligatoire pour tout ce qui part en livraison : sans lui
     on ne sait ni ou envoyer, ni combien facturer. La remise en main propre est
     la seule dispense, et elle exige en retour des frais nuls — accepter des
     frais sur une remise en main propre serait accepter une incoherence. */
  if (!data.handToHand && !data.marketplace && !data.senditDistrictId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['senditDistrictId'],
      message: 'Choisis une destination de livraison, ou coche « remise en main propre »',
    })
  }
  if ((data.handToHand || data.marketplace) && Number(data.deliveryFeeCharged) !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['deliveryFeeCharged'],
      message: 'Une vente sans transporteur ne peut pas porter de frais de livraison',
    })
  }

  if (!data.handToHand && !data.marketplace && (!data.deliveryAddress || data.deliveryAddress.length < 5)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['deliveryAddress'],
      message: 'L’adresse de livraison Sendit doit contenir au moins 5 caractères',
    })
  }

  /* Le numero reste OBLIGATOIRE partout ailleurs : c'est par lui qu'on rappelle
     une cliente, qu'on la reconnait d'une commande a l'autre et qu'on lui
     envoie sa demande d'avis. Seule une place de marche en dispense, parce
     qu'elle ne le donne pas. */
  if (!data.marketplace && !data.deliveryPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['deliveryPhone'],
      message: 'Le numéro est obligatoire (sauf vente sur une place de marché)',
    })
  }

  /* La commission ne peut pas depasser ce que la vente rapporte : au-dela, la
     saisie est fausse (un taux pris pour un montant, par exemple), et la laisser
     passer creerait une marge negative silencieuse dans le tableau de bord. */
  if (Number(data.channelCommission) > produits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['channelCommission'],
      message: `La commission (${data.channelCommission} MAD) dépasse le total des produits (${produits} MAD)`,
    })
  }

  if (data.paymentMethod === 'VIREMENT' || data.paymentMethod === 'CARD') {
    if (!(Number(data.paidAmount) > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAmount'], message: 'Le montant encaissé est obligatoire' })
    }
    if (!data.paidAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAt'], message: 'La date d’encaissement est obligatoire' })
    }
    if (Number(data.paidAmount) > total + 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['paidAmount'],
        message: `Le montant encaissé dépasse le total client (${total.toFixed(2)} MAD)`,
      })
    }
    if (data.paymentMethod === 'CARD' && Math.abs(Number(data.paidAmount) - total) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['paidAmount'],
        message: `Un paiement carte doit correspondre au total client (${total.toFixed(2)} MAD)`,
      })
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
