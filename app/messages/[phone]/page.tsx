'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send, Check, CheckCheck, Clock, AlertCircle, MessageCircle, ShoppingBag, User } from 'lucide-react'
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
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    fetchThread()
  }, [phone])

  // 24h service window: free-form replies allowed only within 24h of the
  // customer's last inbound message.
  const lastInbound = data?.messages.filter(m => m.direction === 'in').slice(-1)[0]
  const hoursSince = lastInbound
    ? (Date.now() - new Date(lastInbound.createdAt).getTime()) / (1000 * 60 * 60)
    : Infinity
  const windowOpen = hoursSince <= 24

  async function sendReply() {
    if (!reply.trim() || sending) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/ops/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text: reply.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSendError(json.error || 'Échec de l\'envoi')
        return
      }
      setReply('')
      await fetchThread()
    } catch {
      setSendError('Erreur réseau')
    } finally {
      setSending(false)
    }
  }

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

  // Explicit read-receipt badge (label + icon) for outbound messages.
  const statusBadge = (status: string | null, direction: string) => {
    if (direction === 'in') return null
    const map: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
      read: { label: 'Vu', cls: 'text-sky-200', Icon: CheckCheck },
      delivered: { label: 'Livré', cls: 'text-white/70', Icon: CheckCheck },
      sent: { label: 'Envoyé', cls: 'text-white/60', Icon: Check },
      failed: { label: 'Échec', cls: 'text-red-200', Icon: AlertCircle },
      queued: { label: 'En attente', cls: 'text-white/50', Icon: Clock },
    }
    const s = map[status || 'queued'] || map.queued
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${s.cls}`}>
        <s.Icon className="w-3.5 h-3.5" />
        {s.label}
      </span>
    )
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

  // Render message body with clickable links
  const renderBody = (text: string, outbound: boolean) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g)
    return parts.map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline font-medium break-all ${outbound ? 'text-white' : 'text-blue-600'}`}
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      )
    )
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
                      {msg.body ? renderBody(msg.body, msg.direction === 'out') : `[${msg.templateName || msg.type}]`}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs opacity-75">{formatTime(msg.createdAt)}</span>
                      {statusBadge(msg.status, msg.direction)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reply box (24h service window) */}
        <div className="mt-4">
          {windowOpen ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-green-600">● Fenêtre ouverte</span>
                <span className="text-xs text-gray-400">
                  · réponse gratuite jusqu'à {Math.max(0, Math.round(24 - hoursSince))}h
                </span>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply() }}
                  placeholder="Écrire une réponse… (Ctrl+Entrée pour envoyer)"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-500"
                />
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || sending}
                  className="btn-modern btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
              {sendError && <p className="text-xs text-red-500 mt-2">{sendError}</p>}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-900">
                <strong>Fenêtre de 24h fermée.</strong>{' '}
                {lastInbound
                  ? 'La cliente n\'a pas écrit dans les dernières 24h — la réponse libre (gratuite) n\'est plus possible. Pour la recontacter, il faut un template approuvé (payant).'
                  : 'La cliente ne vous a jamais écrit. Vous pourrez répondre librement (gratuit) dès qu\'elle vous envoie un message.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </BosShell>
  )
}
