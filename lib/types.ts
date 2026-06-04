// Shared types for BOS

export type SourceChannel = 'Website' | 'WhatsApp' | 'Instagram' | 'TikTok' | 'Manual'

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'FAILED' | 'RETURNED'

export type ConfirmationStatus = 'NEEDS_CONFIRMATION' | 'CONFIRMED' | 'REJECTED'

export type DeliveryStatus =
  | 'NOT_CREATED'
  | 'SENDIT_CREATED'
  | 'IN_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED'

export type PaymentMethod = 'COD' | 'PREPAID' | 'OTHER'

export interface Product {
  id: number
  name: string
  brand: string
  category: string
  price: number
  costPrice?: number
  stock: number
  lowStockThreshold?: number
  sku?: string
  image?: string
  active: boolean
}

export interface OrderItem {
  id: number
  orderId: number
  productId?: number
  sku?: string
  productName: string
  quantity: number
  unitPrice: number
  unitCost?: number
  totalPrice: number
  totalCost?: number
}

export interface Order {
  id: number
  orderNumber?: string
  sourceChannel?: SourceChannel
  sourceOrderId?: string
  sourcePayload?: any

  // Customer
  userId?: number
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  deliveryAddress?: string
  deliveryNotes?: string

  // Financial
  productsTotal?: number
  discountTotal?: number
  total: number
  revenue?: number
  deliveryFeeCharged?: number
  estimatedDeliveryCost?: number
  actualDeliveryCost?: number
  codAmount?: number
  returnOrFailedFees?: number
  estimatedProfit?: number
  finalProfit?: number
  marginPercent?: number

  // Status
  status: OrderStatus
  confirmationStatus?: ConfirmationStatus
  deliveryStatus?: DeliveryStatus

  // Sendit
  senditShipmentId?: string
  senditTrackingNumber?: string

  // Metadata
  paymentMethod?: PaymentMethod
  promoCode?: string
  pointsEarned?: number
  pointsUsed?: number
  needsReview?: boolean
  notes?: string
  sessionId?: string

  createdAt: Date

  // Relations
  items?: OrderItem[]
}

export interface SenditShipment {
  id: number
  orderId: number
  senditShipmentId?: string
  trackingNumber?: string
  status?: string
  rawRequest?: any
  rawResponse?: any
  lastWebhookPayload?: any
  lastSyncedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Campaign {
  id: number
  name: string
  type?: string
  startDate?: Date
  endDate?: Date
  revenueTarget?: number
  actualRevenue?: number
  status?: string
  checklist?: any
  createdAt: Date
  updatedAt: Date
}

export interface ContentItem {
  id: number
  title: string
  type?: string
  platform?: string
  owner?: string
  status?: string
  productId?: number
  campaignId?: number
  hook?: string
  caption?: string
  assetLink?: string
  dueDate?: Date
  scheduledAt?: Date
  publishedAt?: Date
  reach?: number
  views?: number
  clicks?: number
  attributedOrders?: number
  salesImpact?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: number
  title: string
  owner?: string
  status?: string
  priority?: string
  dueDate?: Date
  linkedType?: string
  linkedId?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface DashboardKPIs {
  revenue: {
    today: number
    week: number
    month: number
  }
  profit: {
    estimated: number
    final: number
  }
  margin: {
    average: number
  }
  orders: {
    total: number
    pending: number
    confirmed: number
    inDelivery: number
    delivered: number
    failed: number
    returned: number
    cancelled: number
  }
  alerts: {
    needsConfirmation: number
    noSenditShipment: number
    lowStock: number
    outOfStock: number
    failedDeliveries: number
    tasksDueToday: number
    contentDueToday: number
  }
}
