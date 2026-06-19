'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, Send, Check, CheckCheck, Clock, AlertCircle, MessageCircle, ShoppingBag, Star, Gift, User, ArrowLeft } from 'lucide-react'
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
interface Context {
  points: number
  pointsDh: number
  email: string | null
  city: string | null
  orderCount: number
  totalSpent: number
  reviewCount: number
  lastOrderStatus: string | null
}
interface Thread {
  phone: string
  userId: number | null
  userName: string | null
  messages: Message[]
  context: Context | null
}

// Deterministic avatar hue from a seed (Discord-like colored avatars)
function avatarHue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}
function initials(name: string | null, phone: string) {
  if (name) return name.trim().charAt(0).toUpperCase()
  return phone.replace(/\D/g, '').slice(-2)
}
function typeLabel(m: Message) {
  if (m.type === 'otp') return '🔐 Code OTP'
  if (m.type === 'review') return '⭐ Demande d’avis'
  if (m.type === 'utility') return '🎁 Récompense 50 DH'
  if (m.type === 'marketing') return '📣 Marketing'
  if (m.type === 'reply') return m.direction === 'in' ? '💬 Réponse cliente' : '💬 Votre réponse'
  return 'Message'
}
function fmtTime(date: string, full = false) {
  const d = new Date(date)
  const h = (Date.now() - d.getTime()) / 3600000
  if (full) return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (h < 24) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (h < 24 * 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function StatusBadge({ status, light }: { status: string | null; light?: boolean }) {
  const map: Record<string, { label: string; color: string; Icon: typeof Check }> = {
    read: { label: 'Vu', color: light ? '#bae6fd' : 'var(--blue)', Icon: CheckCheck },
    delivered: { label: 'Livré', color: light ? 'rgba(255,255,255,.75)' : 'var(--tx-lo)', Icon: CheckCheck },
    sent: { label: 'Envoyé', color: light ? 'rgba(255,255,255,.6)' : 'var(--tx-faint)', Icon: Check },
    failed: { label: 'Échec', color: light ? '#fecaca' : 'var(--red)', Icon: AlertCircle },
    queued: { label: '…', color: light ? 'rgba(255,255,255,.5)' : 'var(--tx-faint)', Icon: Clock },
  }
  const s = map[status || 'queued'] || map.queued
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: s.color }}>
      <s.Icon style={{ width: 13, height: 13 }} /> {s.label}
    </span>
  )
}

function renderBody(text: string, outbound: boolean) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer"
        style={{ color: outbound ? '#fff' : 'var(--blue)', textDecoration: 'underline', wordBreak: 'break-all', fontWeight: 500 }}>
        {part}
      </a>
    ) : <span key={i}>{part}</span>
  )
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const [selected, setSelected] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [rewardMsg, setRewardMsg] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void fetchConversations() }, [])

  // Deep-link: read ?phone= on mount
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('phone')
    if (p) selectConv(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchConversations() {
    try {
      const res = await fetch('/api/ops/messages/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch { /* ignore */ }
    finally { setLoadingList(false) }
  }

  const selectConv = useCallback(async (phone: string) => {
    setSelected(phone)
    setThread(null)
    setReply(''); setSendError(''); setRewardMsg('')
    setLoadingThread(true)
    const url = new URL(window.location.href)
    url.searchParams.set('phone', phone)
    window.history.replaceState({}, '', url)
    try {
      const res = await fetch(`/api/ops/messages/thread?phone=${encodeURIComponent(phone)}`)
      const data = await res.json()
      setThread(data)
    } catch { /* ignore */ }
    finally { setLoadingThread(false) }
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread])

  const lastInbound = thread?.messages.filter(m => m.direction === 'in').slice(-1)[0]
  const hoursSince = lastInbound ? (Date.now() - new Date(lastInbound.createdAt).getTime()) / 3600000 : Infinity
  const windowOpen = hoursSince <= 24

  async function sendReply() {
    if (!reply.trim() || sending || !selected) return
    setSending(true); setSendError('')
    try {
      const res = await fetch('/api/ops/messages/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected, text: reply.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setSendError(json.error || 'Échec'); return }
      setReply('')
      await selectConv(selected)
    } catch { setSendError('Erreur réseau') }
    finally { setSending(false) }
  }

  async function sendReward() {
    if (!thread?.userId) return
    if (!confirm('Envoyer la confirmation WhatsApp des 50 DH ?')) return
    setRewardMsg('…')
    try {
      const res = await fetch(`/api/ops/customers/${thread.userId}/send-reward`, { method: 'POST' })
      const json = await res.json()
      setRewardMsg(res.ok ? 'Envoyé ✓' : (json.error || 'Échec'))
      if (res.ok && selected) await selectConv(selected)
    } catch { setRewardMsg('Erreur réseau') }
  }

  const filtered = conversations
    .filter(c => filter === 'unread' ? c.unreadCount > 0 : true)
    .filter(c => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (c.userName || '').toLowerCase().includes(q) || c.phone.includes(q)
    })

  const selectedConv = conversations.find(c => c.phone === selected)
  const headerName = thread?.userName || selectedConv?.userName || 'Cliente'
  const headerPhone = selected || ''

  return (
    <BosShell active="customers" title="Messages" crumb="Relation client / Messages">
      <div style={{ display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--bg-0)' }}>

        {/* ───────────── Left: conversations ───────────── */}
        <aside style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--line-soft)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line-soft)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', margin: '0 0 10px' }}>Conversations</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-2)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
              <Search style={{ width: 14, height: 14, color: 'var(--tx-faint)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--tx-hi)', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {(['all', 'unread'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="btn-modern btn-sm"
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: filter === f ? 'var(--green)' : 'var(--bg-2)',
                    color: filter === f ? '#fff' : 'var(--tx-mid)', border: 'none',
                  }}>
                  {f === 'all' ? `Toutes (${conversations.length})` : `Non lues (${conversations.filter(c => c.unreadCount > 0).length})`}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList ? (
              <p style={{ padding: 24, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Chargement…</p>
            ) : filtered.length === 0 ? (
              <p style={{ padding: 24, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucune conversation</p>
            ) : filtered.map(conv => {
              const active = conv.phone === selected
              const hue = avatarHue(conv.userName || conv.phone)
              return (
                <button key={conv.phone} onClick={() => selectConv(conv.phone)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: '11px 14px',
                    border: 'none', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer',
                    background: active ? 'var(--green-bg)' : 'transparent',
                    borderLeft: active ? '3px solid var(--green)' : '3px solid transparent',
                  }}
                  className={active ? '' : 'hover:bg-[var(--bg-2)]'}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, background: `oklch(0.62 0.15 ${hue})` }}>
                    {initials(conv.userName, conv.phone)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.userName || 'Cliente'}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx-faint)', flexShrink: 0 }}>{fmtTime(conv.lastMessage.createdAt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--tx-lo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {conv.lastMessage.direction === 'out' && <span style={{ color: 'var(--tx-faint)' }}>Vous: </span>}
                        {conv.lastMessage.body?.startsWith('[Image]') ? '🖼️ Image' :
                         conv.lastMessage.body?.startsWith('[Audio') ? '🎵 Audio' :
                         conv.lastMessage.body?.startsWith('[Document') ? '📄 Document' :
                         (conv.lastMessage.body || `[${conv.lastMessage.type}]`).replace(/https?:\/\/\S+/g, '🔗')}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span style={{ background: 'var(--blue)', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', flexShrink: 0 }}>{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ───────────── Center: thread ───────────── */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-faint)' }}>
              <MessageCircle style={{ width: 44, height: 44, marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontSize: 14 }}>Sélectionnez une conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: '1px solid var(--line-soft)', background: 'var(--bg-1)' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, background: `oklch(0.62 0.15 ${avatarHue(headerName)})` }}>
                  {initials(thread?.userName || null, headerPhone)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>{headerName}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx-lo)' }}>{headerPhone}</div>
                </div>
                {thread?.userId && (
                  <Link href={`/customers/${thread.userId}`} className="btn-modern btn-sm btn-secondary" style={{ flexShrink: 0 }}>
                    <User style={{ width: 14, height: 14 }} /> Fiche
                  </Link>
                )}
              </div>

              {/* Messages */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingThread ? (
                  <p style={{ textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13, marginTop: 30 }}>Chargement…</p>
                ) : !thread || thread.messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13, marginTop: 30 }}>Aucun message</p>
                ) : thread.messages.map(m => {
                  const out = m.direction === 'out'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '72%', borderRadius: 16, padding: '9px 13px',
                        background: out ? 'var(--green)' : 'var(--bg-1)',
                        color: out ? '#fff' : 'var(--tx-hi)',
                        border: out ? 'none' : '1px solid var(--line-soft)',
                        boxShadow: 'var(--shadow-1)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{typeLabel(m)}</span>
                          {m.orderId && (
                            <Link href={`/orders/${m.orderId}`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline', color: out ? 'rgba(255,255,255,.9)' : 'var(--blue)' }}>
                              <ShoppingBag style={{ width: 11, height: 11, display: 'inline', marginRight: 3 }} />#{m.orderId}
                            </Link>
                          )}
                        </div>
                        {m.body?.startsWith('[Image]') ? (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            background: out ? 'rgba(255,255,255,.15)' : 'var(--bg-2)',
                            border: out ? '1px solid rgba(255,255,255,.2)' : '1px solid var(--line-soft)'
                          }}>
                            <div style={{
                              width: 40, height: 40, borderRadius: 6,
                              background: out ? 'rgba(255,255,255,.2)' : 'var(--bg-3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 20
                            }}>🖼️</div>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 600, opacity: out ? 0.95 : 1 }}>Image envoyée</div>
                              {m.body.replace('[Image]', '').trim() && (
                                <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 2 }}>
                                  {m.body.replace('[Image]', '').trim()}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : m.body?.startsWith('[Audio') ? (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            background: out ? 'rgba(255,255,255,.15)' : 'var(--bg-2)',
                          }}>
                            <span style={{ fontSize: 20 }}>🎵</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Message vocal</span>
                          </div>
                        ) : m.body?.startsWith('[Document') ? (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', borderRadius: 8,
                            background: out ? 'rgba(255,255,255,.15)' : 'var(--bg-2)',
                          }}>
                            <span style={{ fontSize: 20 }}>📄</span>
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Document</div>
                              {m.body.includes(']') && (
                                <div style={{ fontSize: 11.5, opacity: 0.8 }}>
                                  {m.body.split(']')[1]?.trim() || 'Fichier'}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p style={{ fontSize: 13.5, lineHeight: 1.45, margin: 0, whiteSpace: 'pre-wrap' }}>
                            {m.body ? renderBody(m.body, out) : `[${m.templateName || m.type}]`}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 10.5, opacity: 0.7 }}>{fmtTime(m.createdAt, true)}</span>
                          {out && <StatusBadge status={m.status} light />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply box */}
              <div style={{ flexShrink: 0, borderTop: '1px solid var(--line-soft)', padding: 14, background: 'var(--bg-1)' }}>
                {windowOpen ? (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginBottom: 7 }}>
                      ● Fenêtre ouverte · réponse gratuite encore {Math.max(0, Math.round(24 - hoursSince))}h
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <textarea value={reply} onChange={e => setReply(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply() }}
                        placeholder="Écrire une réponse… (Ctrl+Entrée)" rows={2}
                        style={{ flex: 1, resize: 'none', borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', padding: '9px 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--tx-hi)', background: 'var(--bg-0)' }} />
                      <button onClick={sendReply} disabled={!reply.trim() || sending} className="btn-modern btn-primary" style={{ opacity: (!reply.trim() || sending) ? 0.5 : 1 }}>
                        <Send style={{ width: 15, height: 15 }} /> {sending ? 'Envoi…' : 'Envoyer'}
                      </button>
                    </div>
                    {sendError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{sendError}</p>}
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--tx-lo)', background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                    <strong style={{ color: 'var(--tx-mid)' }}>Fenêtre de 24h fermée.</strong>{' '}
                    {lastInbound ? 'Réponse libre indisponible — il faut un template (payant).' : 'La cliente pourra recevoir vos réponses libres dès qu’elle vous écrit.'}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* ───────────── Right: customer context ───────────── */}
        {selected && (
          <aside className="msg-context" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--line-soft)', background: 'var(--bg-1)', overflowY: 'auto', padding: 18 }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24, background: `oklch(0.62 0.15 ${avatarHue(headerName)})` }}>
                {initials(thread?.userName || null, headerPhone)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)' }}>{headerName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--tx-lo)', marginTop: 2 }}>{headerPhone}</div>
            </div>

            {thread?.context ? (
              <>
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-line)', borderRadius: 'var(--radius)', padding: 14, textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 3 }}>Cagnotte fidélité</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{thread.context.pointsDh} DH</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{thread.context.points} points</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <CtxStat icon={<ShoppingBag style={{ width: 14, height: 14 }} />} label="Commandes" value={String(thread.context.orderCount)} />
                  <CtxStat icon={<Star style={{ width: 14, height: 14 }} />} label="Avis" value={String(thread.context.reviewCount)} />
                  <CtxStat icon={<Gift style={{ width: 14, height: 14 }} />} label="Dépensé" value={`${Math.round(thread.context.totalSpent)} DH`} />
                  <CtxStat icon={<ShoppingBag style={{ width: 14, height: 14 }} />} label="Dernière" value={thread.context.lastOrderStatus === 'DELIVERED' ? 'Livrée' : thread.context.lastOrderStatus || '—'} />
                </div>

                <Link href={`/customers/${thread.userId}`} className="btn-modern btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                  <User style={{ width: 14, height: 14 }} /> Voir la fiche complète
                </Link>
                <button onClick={sendReward} className="btn-modern btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  <Gift style={{ width: 14, height: 14 }} /> Confirmer les 50 DH
                </button>
                {rewardMsg && <p style={{ fontSize: 12, textAlign: 'center', marginTop: 7, fontWeight: 600, color: rewardMsg.includes('✓') ? 'var(--green)' : 'var(--red)' }}>{rewardMsg}</p>}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--tx-faint)', textAlign: 'center' }}>
                Numéro non rattaché à une cliente enregistrée.
              </p>
            )}
          </aside>
        )}
      </div>
    </BosShell>
  )
}

function CtxStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--tx-lo)', marginBottom: 4 }}>{icon}<span style={{ fontSize: 11 }}>{label}</span></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>{value}</div>
    </div>
  )
}
