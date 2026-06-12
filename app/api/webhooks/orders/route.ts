import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Order webhook sync is disabled',
      reason: 'The storefront and BOS share the same database, so webhook order creation would duplicate orders.',
    },
    { status: 410 }
  )
}
