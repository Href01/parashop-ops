'use client'

import { useEffect, useState } from 'react'
import { Star, CheckCircle, XCircle, Image as ImageIcon, ShoppingBag, User, Eye } from 'lucide-react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'

interface Review {
  id: number
  userId: number
  userName: string | null
  userPhone: string | null
  productId: number
  productName: string
  rating: number
  comment: string | null
  images: string[] | null
  approved: boolean | null
  pointsAwarded: boolean
  orderId: number | null
  createdAt: string
}

export default function AvisPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'published' | 'all'>('pending')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  useEffect(() => {
    fetchReviews()
  }, [])

  async function fetchReviews() {
    try {
      const res = await fetch('/api/ops/avis')
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch (err) {
      console.error('Failed to fetch reviews:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(reviewId: number) {
    if (actionLoading) return
    setActionLoading(reviewId)
    try {
      const res = await fetch(`/api/ops/avis/${reviewId}/approve`, { method: 'POST' })
      if (res.ok) {
        await fetchReviews()
      }
    } catch (err) {
      console.error('Approve failed:', err)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(reviewId: number) {
    if (actionLoading) return
    if (!confirm('Retirer cet avis de la boutique ? Il ne sera plus visible publiquement.')) return
    setActionLoading(reviewId)
    try {
      const res = await fetch(`/api/ops/avis/${reviewId}/reject`, { method: 'POST' })
      if (res.ok) {
        await fetchReviews()
      }
    } catch (err) {
      console.error('Reject failed:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // The schema stores a boolean `approved` (default false) — there is no separate
  // "rejected" state. So: true = Publié, anything else (false/null) = En attente.
  const filtered = reviews.filter(r => {
    if (filter === 'pending') return r.approved !== true
    if (filter === 'published') return r.approved === true
    return true
  })

  const counts = {
    pending: reviews.filter(r => r.approved !== true).length,
    published: reviews.filter(r => r.approved === true).length,
  }

  return (
    <BosShell active="customers" title="Avis Clientes" crumb="Avis">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Modération des avis</h1>
          <p className="text-sm text-gray-500">
            Publiez les avis de vos clientes (visibles sur la boutique une fois publiés)
          </p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setFilter('pending')}
            className={`btn-modern btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-subtle'}`}
          >
            À publier <span className="ml-1 badge-modern badge-warning badge-sm">{counts.pending}</span>
          </button>
          <button
            onClick={() => setFilter('published')}
            className={`btn-modern btn-sm ${filter === 'published' ? 'btn-primary' : 'btn-subtle'}`}
          >
            Publiés <span className="ml-1 badge-modern badge-success badge-sm">{counts.published}</span>
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`btn-modern btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-subtle'}`}
          >
            Tous <span className="ml-1 badge-modern badge-neutral badge-sm">{reviews.length}</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-3"></div>
              <p className="text-sm">Chargement des avis...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {filter === 'pending' ? 'Aucun avis en attente' : `Aucun avis ${filter}`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((review) => (
                <div key={review.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                      {review.userName ? review.userName.charAt(0).toUpperCase() : '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">{review.userName || 'Cliente'}</p>
                            {review.approved === true ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                                ✓ Publié
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                                ⏳ À publier
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {review.userPhone && <span>{review.userPhone}</span>}
                            {review.userId && (
                              <Link href={`/customers/${review.userId}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                <User className="w-3 h-3" />
                                Fiche cliente
                              </Link>
                            )}
                            {review.orderId && (
                              <Link href={`/orders/${review.orderId}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3" />
                                Commande #{review.orderId}
                              </Link>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      </div>

                      <div className="mb-2">
                        <p className="text-sm font-semibold text-gray-700 mb-1">{review.productName}</p>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className="w-4 h-4"
                              fill={s <= review.rating ? '#F59E0B' : 'none'}
                              stroke={s <= review.rating ? '#F59E0B' : '#D1D5DB'}
                            />
                          ))}
                          <span className="text-xs text-gray-500 ml-2">({review.rating}/5)</span>
                        </div>
                      </div>

                      {review.comment && (
                        <p className="text-sm text-gray-600 mb-3 leading-relaxed">{review.comment}</p>
                      )}

                      {review.images && review.images.length > 0 && (
                        <div className="flex gap-2 mb-3">
                          {review.images.map((img, idx) => (
                            <a
                              key={idx}
                              href={img}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:opacity-75 transition-opacity"
                            >
                              <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {review.approved !== true ? (
                          <button
                            onClick={() => handleApprove(review.id)}
                            disabled={actionLoading === review.id}
                            className="btn-modern btn-sm btn-success inline-flex items-center gap-1.5"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Publier l'avis
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReject(review.id)}
                            disabled={actionLoading === review.id}
                            className="btn-modern btn-sm btn-secondary inline-flex items-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" />
                            Retirer de la boutique
                          </button>
                        )}
                        {review.pointsAwarded && (
                          <span className="text-xs text-green-600 font-semibold ml-2">
                            Points déjà crédités
                          </span>
                        )}
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
