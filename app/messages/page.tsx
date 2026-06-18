'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Send, CheckCheck, Clock, AlertCircle, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'

interface Message {
  id: number
  userId: number | null
  userName: string | null
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

interface Conversation {
  phone: string
  userId: number | null
  userName: string | null
  lastMessage: Message
  unreadCount: number
  messageCount: number
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    fetchConversations()
  }, [])

  async function fetchConversations() {
    try {
      const res = await fetch('/api/ops/messages/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'unread'
    ? conversations.filter(c => c.unreadCount > 0)
    : conversations

  const statusIcon = (status: string | null, direction: string) => {
    if (direction === 'in') return <MessageCircle className="w-4 h-4 text-blue-500" />
    if (!status) return <Clock className="w-4 h-4 text-gray-400" />
    if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-500" />
    if (status === 'read') return <CheckCheck className="w-4 h-4 text-green-500" />
    if (status === 'delivered') return <CheckCheck className="w-4 h-4 text-gray-500" />
    if (status === 'sent') return <Send className="w-4 h-4 text-gray-400" />
    return <Clock className="w-4 h-4 text-gray-400" />
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const hours = diff / (1000 * 60 * 60)

    if (hours < 24) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    if (hours < 24 * 7) {
      return d.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <BosShell active="customers" title="Messages WhatsApp" crumb="Messages">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Messages WhatsApp</h1>
          <p className="text-sm text-gray-500">
            Conversations avec vos clientes — envois et réponses
          </p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`btn-modern btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-subtle'}`}
          >
            Toutes <span className="ml-1 badge-modern badge-neutral badge-sm">{conversations.length}</span>
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`btn-modern btn-sm ${filter === 'unread' ? 'btn-primary' : 'btn-subtle'}`}
          >
            Réponses non lues <span className="ml-1 badge-modern badge-info badge-sm">{conversations.filter(c => c.unreadCount > 0).length}</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-3"></div>
              <p className="text-sm">Chargement des conversations...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {filter === 'unread' ? 'Aucune réponse non lue' : 'Aucune conversation pour le moment'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((conv) => (
                <Link
                  key={conv.phone}
                  href={`/messages/${encodeURIComponent(conv.phone)}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                    {conv.userName ? conv.userName.charAt(0).toUpperCase() : conv.phone.slice(-2)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900">
                        {conv.userName || 'Cliente'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-1">{conv.phone}</p>

                    <div className="flex items-center gap-2">
                      {statusIcon(conv.lastMessage.status, conv.lastMessage.direction)}
                      <p className="text-sm text-gray-600 truncate flex-1">
                        {conv.lastMessage.direction === 'out' && <span className="text-gray-400 mr-1">Vous:</span>}
                        {conv.lastMessage.body || `[${conv.lastMessage.type}]`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <p className="text-xs text-gray-400">{formatTime(conv.lastMessage.createdAt)}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {conv.messageCount} msg
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </BosShell>
  )
}
