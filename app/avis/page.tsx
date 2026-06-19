'use client'

import { useEffect, useState } from 'react'
import { Star, CheckCircle, XCircle, ShoppingBag, User } from 'lucide-react'
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

// Deterministic avatar hue (same as Messages)
function avatarHue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}
function initials(name: string | null, fallback: string) {
  if (name) return name.trim().charAt(0).toUpperCase()
  return fallback.charAt(0).toUpperCase()
}

export default function AvisPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'published' | 'all'>('pending')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  useEffect(() => { void fetchReviews() }, [])

  async function fetchReviews() {
    try {
      const res = await fetch('/api/ops/avis')
      const data = await res.json()
      setReviews(data.reviews || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  async function handleApprove(reviewId: number) {
    if (actionLoading) return
    setActionLoading(reviewId)
    try {
      const res = await fetch(`/api/ops/avis/${reviewId}/approve`, { method: 'POST' })
      if (res.ok) await fetchReviews()
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

  async function handleReject(reviewId: number) {
    if (actionLoading) return
    if (!confirm('Retirer cet avis de la boutique ?')) return
    setActionLoading(reviewId)
    try {
      const res = await fetch(`/api/ops/avis/${reviewId}/reject`, { method: 'POST' })
      if (res.ok) await fetchReviews()
    } catch { /* ignore */ }
    finally { setActionLoading(null) }
  }

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
    <BosShell active="customers" title="Avis" crumb="Relation client / Avis">
      <div style={{ padding: '22px 24px 60px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h1 className="serif-display" style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--tx-hi)', marginBottom: 6 }}>
            Modération des avis
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--tx-lo)' }}>
            Publiez les avis de vos clientes — visibles sur la boutique une fois approuvés
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {(['pending', 'published', 'all'] as const).map(f => {
            const labels = { pending: 'À publier', published: 'Publiés', all: 'Tous' }
            const count = f === 'all' ? reviews.length : counts[f as 'pending' | 'published']
            return (
              <button key={f} onClick={() => setFilter(f)} className="btn-modern btn-sm"
                style={{
                  background: filter === f ? 'var(--green)' : 'var(--bg-2)',
                  color: filter === f ? '#fff' : 'var(--tx-mid)',
                  border: 'none', padding: '6px 14px', fontSize: 13,
                }}>
                {labels[f]} <span style={{ marginLeft: 5, opacity: 0.8 }}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Reviews */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--tx-faint)', marginTop: 40, fontSize: 13 }}>Chargement…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 50 }}>
            <Star style={{ width: 44, height: 44, margin: '0 auto 12px', color: 'var(--tx-faint)', opacity: 0.5 }} />
            <p style={{ fontSize: 14, color: 'var(--tx-faint)' }}>
              {filter === 'pending' ? 'Aucun avis en attente' : filter === 'published' ? 'Aucun avis publié' : 'Aucun avis'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {filtered.map(review => {
              const hue = avatarHue(review.userName || review.userPhone || String(review.userId))
              const name = review.userName || 'Cliente'
              const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
              const approved = review.approved === true

              return (
                <div key={review.id} className="card" style={{ padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start' }}>

                  {/* Avatar */}
                  <div style={{ width: 50, height: 50, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 19, background: `oklch(0.62 0.15 ${hue})` }}>
                    {initials(review.userName, 'C')}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>

                    {/* Header: name + status + date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-hi)' }}>{name}</span>
                          {approved ? (
                            <span className="badge-modern badge-success badge-sm">✓ Publié</span>
                          ) : (
                            <span className="badge-modern badge-warning badge-sm">⏳ À publier</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--tx-lo)' }}>
                          <Link href={`/customers/${review.userId}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                            <User style={{ width: 12, height: 12, display: 'inline', marginRight: 3 }} />
                            Fiche cliente
                          </Link>
                          {review.orderId && (
                            <Link href={`/orders/${review.orderId}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                              <ShoppingBag style={{ width: 12, height: 12, display: 'inline', marginRight: 3 }} />
                              Commande #{review.orderId}
                            </Link>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--tx-faint)', flexShrink: 0 }}>
                        {new Date(review.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Product + Rating */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 13, color: 'var(--tx-mid)', marginBottom: 4 }}>
                        Produit : <span style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{review.productName}</span>
                      </div>
                      <div style={{ fontSize: 18, color: 'var(--amber, #F59E0B)' }}>{stars}</div>
                    </div>

                    {/* Comment */}
                    {review.comment && (
                      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--tx-hi)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
                        {review.comment}
                      </p>
                    )}

                    {/* Images */}
                    {review.images && review.images.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                        {review.images.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noopener noreferrer"
                            style={{ width: 72, height: 72, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--line-soft)', flexShrink: 0 }}
                            className="hover:opacity-75">
                            <img src={img} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {!approved ? (
                        <button onClick={() => handleApprove(review.id)} disabled={actionLoading === review.id}
                          className="btn-modern btn-sm btn-success"
                          style={{ opacity: actionLoading === review.id ? 0.5 : 1 }}>
                          <CheckCircle style={{ width: 14, height: 14 }} /> Publier l'avis
                        </button>
                      ) : (
                        <button onClick={() => handleReject(review.id)} disabled={actionLoading === review.id}
                          className="btn-modern btn-sm btn-secondary"
                          style={{ opacity: actionLoading === review.id ? 0.5 : 1 }}>
                          <XCircle style={{ width: 14, height: 14 }} /> Retirer de la boutique
                        </button>
                      )}
                      {review.pointsAwarded && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                          🎁 Points déjà crédités
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </BosShell>
  )
}
