'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Send, MousePointerClick, Star, Users, ShoppingBag } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Stats {
  // Totals
  totalSent: number
  totalClicked: number
  totalReviews: number
  totalCustomers: number

  // Rates
  clickRate: number
  reviewRate: number
  conversionRate: number

  // Recent (7 days)
  recentSent: number
  recentClicked: number
  recentReviews: number

  // Top products
  topProducts: Array<{
    productId: number
    productName: string
    reviewCount: number
    avgRating: number
  }>

  // Timeline (30 days)
  timeline: Array<{
    date: string
    sent: number
    clicked: number
    reviews: number
  }>
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')

  useEffect(() => {
    fetchStats()
  }, [period])

  async function fetchStats() {
    try {
      const res = await fetch(`/api/ops/stats?period=${period}`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !stats) {
    return (
      <BosShell active="customers" title="Statistiques" crumb="Stats">
        <div className="p-8 text-center text-gray-400">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </BosShell>
    )
  }

  const formatPercent = (n: number) => `${Math.round(n * 100)}%`

  return (
    <BosShell active="customers" title="Statistiques" crumb="Analytics / Avis">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics Avis</h1>
            <p className="text-sm text-gray-500">
              Performance des demandes d'avis WhatsApp
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPeriod('7d')}
              className={`btn-modern btn-sm ${period === '7d' ? 'btn-primary' : 'btn-subtle'}`}
            >
              7 jours
            </button>
            <button
              onClick={() => setPeriod('30d')}
              className={`btn-modern btn-sm ${period === '30d' ? 'btn-primary' : 'btn-subtle'}`}
            >
              30 jours
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Envoyées</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalSent}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {stats.recentSent} derniers {period === '7d' ? '7j' : '30j'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <MousePointerClick className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Clics</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalClicked}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-green-600">
              {formatPercent(stats.clickRate)} taux de clic
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Avis laissés</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalReviews}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-yellow-600">
              {formatPercent(stats.reviewRate)} taux d'avis
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Conversion</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPercent(stats.conversionRate)}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400">Envoi → Avis</p>
          </div>
        </div>

        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Entonnoir de conversion</h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Demandes envoyées</span>
                <span className="text-sm font-bold text-gray-900">{stats.totalSent} (100%)</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Clics sur le lien</span>
                <span className="text-sm font-bold text-gray-900">
                  {stats.totalClicked} ({formatPercent(stats.clickRate)})
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${stats.clickRate * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Avis complétés</span>
                <span className="text-sm font-bold text-gray-900">
                  {stats.totalReviews} ({formatPercent(stats.reviewRate)})
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${stats.reviewRate * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Top produits avisés</h2>
          {stats.topProducts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun avis encore</p>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map((p, idx) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-gray-600">#{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.productName}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">{p.reviewCount} avis</span>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 stroke-yellow-400" />
                        <span className="text-xs font-semibold text-gray-700">
                          {p.avgRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BosShell>
  )
}
