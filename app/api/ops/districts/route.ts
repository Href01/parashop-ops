import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getAllDistricts } from '@/lib/sendit'

// Cache districts for 24 hours
let cachedDistricts: any[] | null = null
let cacheExpiry = 0

// GET /api/ops/districts - Get all Sendit districts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return cached data if still valid
    if (cachedDistricts && Date.now() < cacheExpiry) {
      console.log('✅ Returning cached districts')
      return NextResponse.json(cachedDistricts)
    }

    // Fetch fresh data from Sendit
    console.log('🔄 Fetching fresh districts from Sendit...')
    const districts = await getAllDistricts()

    // Cache for 24 hours
    cachedDistricts = districts
    cacheExpiry = Date.now() + 24 * 60 * 60 * 1000

    return NextResponse.json(districts)
  } catch (error: any) {
    console.error('Get districts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch districts', details: error.message },
      { status: 500 }
    )
  }
}
