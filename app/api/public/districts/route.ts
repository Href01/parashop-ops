import { NextResponse } from 'next/server'
import { getAllDistricts } from '@/lib/sendit'

// Cache districts for 1 hour (they don't change often)
let cachedDistricts: any[] | null = null
let cacheExpiry = 0

/**
 * GET /api/public/districts
 *
 * Public endpoint (no auth) for main site to fetch Sendit districts
 * Used during checkout to let customers pick their exact district
 */
export async function GET() {
  try {
    // Return cached if still valid
    if (cachedDistricts && Date.now() < cacheExpiry) {
      return NextResponse.json({
        districts: cachedDistricts,
        cached: true,
      })
    }

    // Fetch from Sendit
    const districts = await getAllDistricts()

    // Transform to simpler format for frontend
    const simplified = districts.map(d => ({
      id: d.id,
      name: d.name,
      ville: d.ville,
      price: d.price,
      delais: d.delais,
      // Include Arabic name if available
      nameAr: d.arabic_name || d.name,
    }))

    // Sort by ville then name
    simplified.sort((a, b) => {
      if (a.ville !== b.ville) return a.ville.localeCompare(b.ville)
      return a.name.localeCompare(b.name)
    })

    // Cache for 1 hour
    cachedDistricts = simplified
    cacheExpiry = Date.now() + 3600000

    return NextResponse.json({
      districts: simplified,
      cached: false,
      count: simplified.length,
    })

  } catch (error: any) {
    console.error('❌ Failed to fetch districts:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch districts',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
