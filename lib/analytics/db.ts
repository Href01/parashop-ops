import type { QueryResult, QueryResultRow } from 'pg'
import pool from '@/lib/db'

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  return String((error as { code?: unknown }).code ?? '')
}

/** Read-only analytics queries get one short retry for transient connection failures. */
export async function analyticsQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, values ? [...values] : undefined)
  } catch (error) {
    const code = codeOf(error)
    if (!TRANSIENT_CODES.has(code)) throw error
    await sleep(250)
    return pool.query<T>(text, values ? [...values] : undefined)
  }
}

export function analyticsError(error: unknown): { code: string; message: string } {
  const code = codeOf(error) || 'UNKNOWN'
  const message = error instanceof Error && error.message ? error.message : 'Database request failed'
  return { code, message }
}
