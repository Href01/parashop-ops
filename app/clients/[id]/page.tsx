'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ShoppingBag, MessageCircle, Star, Gift, Send, CheckCheck, Clock } from 'lucide-react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'

interface TimelineEvent {
  id: string
  type: 'order' | 'message' | 'review' | 'points'
  date: string
  icon: React.ReactNode
  title: string
  description: string
  link?: string
  status?: string
  amount?: number
}

interface ClientData {
  id: number
  name: string
  phone: string
  email: string | null
  points: number
  pointsDh: number
  createdAt: string
  orderCount: number
  totalRevenue: number
  reviewCount: number
  messageCount: number
}

export default function ClientPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = parseInt(params.id as string)

  const [client, setClient] = useState<ClientData | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClient()
  }, [clientId])

  async function fetchClient() {
    try {
      const res = await fetch(`/api/ops/clients/${clientId}/timeline`)
      const data = await res.json()
      setClient(data.client)
      setTimeline(data.timeline || [])
    } catch (err) {
      console.error('Failed to fetch client:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <BosShell active="customers" title="Cliente" crumb="Clients / Fiche">
        <div className="p-8 text-center text-gray-400">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      </BosShell>
    )
  }

  if (!client) {
    return (
      <BosShell active="customers" title="Cliente" crumb="Clients / Fiche">
        <div className="p-8 text-center">
          <p className="text-gray-500">Cliente introuvable</p>
        </div>
      </BosShell>
    )
  }

  const formatCurrency = (n: number) => `${Math.round(n)} MAD`

  return (
    <BosShell active="customers" title={client.name} crumb={`Clients / ${client.name}`}>
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Retour</span>
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">{client.name}</h1>
              <p className="text-green-100 text-sm mb-3">{client.phone}</p>
              {client.email && <p className="text-green-100 text-xs">{client.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-green-100 mb-1">Cagnotte fidélité</p>
              <p className="text-3xl font-bold">{client.pointsDh} DH</p>
              <p className="text-xs text-green-100 mt-1">{client.points} points</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <ShoppingBag className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{client.orderCount}</p>
            <p className="text-xs text-gray-500">Commandes</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(client.totalRevenue)}</p>
            <p className="text-xs text-gray-500">CA total</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <MessageCircle className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{client.messageCount}</p>
            <p className="text-xs text-gray-500">Messages</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <Star className="w-5 h-5 text-gray-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900">{client.reviewCount}</p>
            <p className="text-xs text-gray-500">Avis</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Timeline d'activité</h2>

          {timeline.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Aucune activité</p>
          ) : (
            <div className="space-y-4">
              {timeline.map((event, idx) => (
                <div key={event.id} className="flex gap-4 relative">
                  {idx !== timeline.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-px bg-gray-200" />
                  )}

                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 relative z-10">
                    {event.icon}
                  </div>

                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-semibold text-gray-900">{event.title}</p>
                      <span className="text-xs text-gray-400">
                        {new Date(event.date).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{event.description}</p>
                    {event.link && (
                      <Link href={event.link} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                        Voir les détails →
                      </Link>
                    )}
                    {event.amount && (
                      <p className="text-xs font-semibold text-green-600 mt-1">
                        {event.amount > 0 ? '+' : ''}{event.amount} pts
                      </p>
                    )}
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
