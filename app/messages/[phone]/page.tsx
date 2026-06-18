'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send, CheckCheck, Clock, AlertCircle, MessageCircle, ShoppingBag, User } from 'lucide-react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'

interface Message {
  id: number
  userId: number | null
  phone: string
  direction: 'out' | 'in'
  type: string
  category: string | null
  templateName: string | null
  body: string | null
  status: string | null
  waMessageId: string | null
  orderId: number | null
  createdAt: string
}

interface ThreadData {
  phone: string
  userId: number | null
  userName: string | null
  messages: Message[]
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const phone = decodeURIComponent(params.phone as string)

  const [data, setData] = useState<ThreadData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchThread()
  }, [phone])

  async function fetchThread() {
    try {
      const res = await fetch(`/api/ops/messages/thread?phone=${encodeURIComponent(phone)}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Failed to fetch thread:', err)
    } finally {
      setLoading(false)
    }
  }

  const statusIcon = (status: string | null, direction: string) => {
    if (direction === 'in') return null
    if (!status) return <Clock className="w-3 h-3 text-gray-400" />
    if (status === 'failed') return <AlertCircle className="w-3 h-3 text-red-500" />
    if (status === 'read') return <CheckCheck className="w-3 h-3 text-green-500" />
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-gray-500" />
    if (status === 'sent') return <Send className="w-3 h-3 text-gray-400" />
    return <Clock className="w-3 h-3 text-gray-400" />
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <BosShell active="customers" title="Conversation" crumb="Messages / Conversation">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Retour aux conversations</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-xl">
              {data?.userName ? data.userName.charAt(0).toUpperCase() : phone.slice(-2)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{data?.userName || 'Cliente'}</h1>
              <p className="text-sm text-gray-500">{phone}</p>
              {data?.userId && (
                <Link
                  href={`/clients/${data.userId}`}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                >
                  <User className="w-3 h-3" />
                  Voir la fiche cliente
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {loading ? (
            <div className="py-12 text-center text-gray-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-3"></div>
              <p className="text-sm">Chargement de la conversation...</p>
            </div>
          ) : !data || data.messages.length === 0 ? (
            <div className="py-12 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Aucun message</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.direction === 'out'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs opacity-75 font-medium">
                        {msg.type === 'otp' ? '🔐 OTP' :
                         msg.type === 'review' ? '⭐ Demande d\'avis' :
                         msg.type === 'reply' ? '💬 Réponse' :
                         msg.type}
                      </span>
                      {msg.orderId && (
                        <Link
                          href={`/orders/${msg.orderId}`}
                          className={`text-xs font-medium underline ${
                            msg.direction === 'out' ? 'text-white/90' : 'text-blue-600'
                          }`}
                        >
                          <ShoppingBag className="w-3 h-3 inline mr-1" />
                          Commande #{msg.orderId}
                        </Link>
                      )}
                    </div>

                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.body || `[${msg.templateName || msg.type}]`}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs opacity-75">{formatTime(msg.createdAt)}</span>
                      {statusIcon(msg.status, msg.direction)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-sm text-blue-900">
            <strong>Phase 1 (lecture seule).</strong> Les réponses sont tracées. La fenêtre de service 24h
            et l'envoi de messages libres arrivent en Phase 4.
          </p>
        </div>
      </div>
    </BosShell>
  )
}
