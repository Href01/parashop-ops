import pool from './db'

const tableCache = new Map<string, Promise<boolean>>()
const columnCache = new Map<string, Promise<boolean>>()

export async function tableExists(tableName: string) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) return false

  if (!tableCache.has(tableName)) {
    tableCache.set(
      tableName,
      pool
        .query(
          `
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
            LIMIT 1
          `,
          [tableName]
        )
        .then((result) => (result.rowCount ?? 0) > 0)
    )
  }

  return tableCache.get(tableName)!
}

export async function columnExists(tableName: string, columnName: string) {
  if (!/^[A-Za-z0-9_]+$/.test(tableName) || !/^[A-Za-z0-9_]+$/.test(columnName)) {
    return false
  }

  const cacheKey = `${tableName}.${columnName}`

  if (!columnCache.has(cacheKey)) {
    columnCache.set(
      cacheKey,
      pool
        .query(
          `
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
            LIMIT 1
          `,
          [tableName, columnName]
        )
        .then((result) => (result.rowCount ?? 0) > 0)
    )
  }

  return columnCache.get(cacheKey)!
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'campaign'
}

export function emptyCampaignMetrics() {
  return {
    totalOrders: 0,
    totalRevenue: 0,
    totalCOGS: 0,
    totalAdSpend: 0,
    totalOtherCosts: 0,
    totalCosts: 0,
    grossProfit: 0,
    netProfit: 0,
    roi: 0,
    roas: 0,
    profitMargin: 0,
    totalUnits: 0,
    avgOrderValue: 0,
  }
}

export function emptyEventMetrics() {
  return {
    totalOrders: 0,
    totalRevenue: 0,
    totalUnits: 0,
    avgOrderValue: 0,
    revenueIncrease: 0,
    ordersIncrease: 0,
    topCategory: null,
    topProduct: null,
  }
}
