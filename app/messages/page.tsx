'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, Send, Check, CheckCheck, Clock, AlertCircle, MessageCircle, ShoppingBag, Star, Gift, User, ArrowLeft, ImagePlus, X, RotateCcw, Zap, Package } from 'lucide-react'
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
  errorCode: number | null
  orderId: number | null
  mediaId: string | null
  createdAt: string
}
interface CustomerOrder {
  id: number
  orderNumber: string | null
  status: string
  deliveryStatus: string | null
  total: number
  senditTrackingNumber: string | null
  createdAt: string
}
interface Conversation {
  phone: string
  userId: number | null
  userName: string | null
  lastMessage: Message
  messageCount: number
  // "Non lu" ne voulait rien dire : tous les messages entrants arrivent en
  // 'delivered'. Ce qui compte est : attend-elle une reponse de notre part ?
  awaitingReply: boolean
  lastInboundAt: string | null
  /** Heures restantes pour repondre gratuitement. Negatif = fenetre fermee. */
  windowHoursLeft: number | null
  failedCount: number
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
  orders: CustomerOrder[]
}

/**
 * Reponses rapides — extraites des 44 vraies reponses deja envoyees depuis le
 * BOS, pas inventees. Le ton (francais/darija melanges, tutoiement chaleureux)
 * est celui de la boutique ; les inventer aurait sonne faux.
 * Elles remplissent le champ de saisie au lieu d'envoyer directement : on garde
 * toujours la main pour adapter avant d'envoyer.
 */
const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: '👋 Accueil', text: 'Bonjour comment pouvons-nous vous aider?' },
  { label: '🙏 Réponse tardive', text: 'Bonjour, désolé pour la réponse tardive. Comment pouvons-nous vous aider?' },
  { label: '💚 Avec plaisir', text: 'Avec plaisir. Si tu as besoin d’aide, nous sommes à ta disposition.' },
  { label: '⭐ Demander un avis', text: 'Merci de laisser votre avis sur les produits commandés dans le site, et vous recevrez un solde de 50 DH pour la prochaine commande.' },
  { label: '🎁 Solde utilisable', text: 'Le solde que vous avez est utilisable sans minimum d’achat, vous pouvez l’utiliser dans votre prochaine commande.' },
  { label: '📸 Demander une photo', text: 'Salam, momkin t3adi tsifte lina la photo? merci bcp!' },
  { label: '🔗 Demander le lien', text: 'Salam, sifte lia stp le lien li nti fih daba bach nchuf le problème.' },
  { label: '✅ Commande reçue', text: 'Super ! Commande bien reçue. Merci beaucoup !' },
  { label: '📦 Rupture Salerm', text: 'Ce produit est en rupture car le fournisseur Salerm a un problème de stock. Je vous préviens dès qu’il est de retour.' },
]

/**
 * Traduction des codes d'erreur WhatsApp en langage clair. Sans ca, un envoi
 * echoue en silence et rien n'indique s'il faut corriger le numero ou aller
 * regler la facturation Meta — les deux causes de tous nos echecs a ce jour.
 */
function errorLabel(code: number | null): string | null {
  if (!code) return null
  const map: Record<number, string> = {
    131026: 'Numéro non joignable sur WhatsApp',
    131042: 'Problème de facturation sur le compte Meta',
    131047: 'Fenêtre de 24h fermée — template requis',
    131051: 'Type de message non pris en charge',
    131053: 'Fichier refusé par WhatsApp',
    132000: 'Template : nombre de variables incorrect',
    132001: 'Template introuvable ou non approuvé',
    133010: 'Numéro WhatsApp Business non enregistré',
    100: 'Paramètre invalide dans l’envoi',
  }
  return map[code] || `Erreur WhatsApp ${code}`
}

/** Separateur de jour facon WhatsApp : « Aujourd'hui », « Hier », puis la date. */
function dayLabel(date: string): string {
  const d = new Date(date)
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const ecart = Math.round((jour(new Date()) - jour(d)) / 86400000)
  if (ecart === 0) return 'Aujourd’hui'
  if (ecart === 1) return 'Hier'
  if (ecart < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  DELIVERED: { label: 'Livrée', color: 'var(--green)' },
  CONFIRMED: { label: 'Confirmée', color: 'var(--blue)' },
  PENDING: { label: 'En attente', color: '#B45309' },
  CANCELLED: { label: 'Annulée', color: 'var(--red)' },
  RETURNED: { label: 'Retournée', color: 'var(--red)' },
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

/**
 * Accuse de reception facon WhatsApp : une coche = envoye, deux = recu, deux
 * bleues = lu. Le libelle en toutes lettres occupait la moitie de la bulle pour
 * une information que tout le monde lit deja d'un coup d'oeil ; il reste
 * accessible au survol et pour les lecteurs d'ecran.
 */
function StatusBadge({ status, light }: { status: string | null; light?: boolean }) {
  const map: Record<string, { label: string; color: string; Icon: typeof Check }> = {
    read: { label: 'Vu', color: light ? '#7DD3FC' : 'var(--blue)', Icon: CheckCheck },
    delivered: { label: 'Reçu', color: light ? 'rgba(255,255,255,.7)' : 'var(--tx-lo)', Icon: CheckCheck },
    sent: { label: 'Envoyé', color: light ? 'rgba(255,255,255,.55)' : 'var(--tx-faint)', Icon: Check },
    failed: { label: 'Échec', color: light ? '#FCA5A5' : 'var(--red)', Icon: AlertCircle },
    queued: { label: 'En cours', color: light ? 'rgba(255,255,255,.5)' : 'var(--tx-faint)', Icon: Clock },
  }
  const s = map[status || 'queued'] || map.queued
  return (
    <span title={s.label} aria-label={s.label} style={{ display: 'inline-flex', alignItems: 'center', color: s.color }}>
      <s.Icon style={{ width: 14, height: 14 }} />
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

/**
 * Images arrive two ways: a customer's photo is a Meta media ID that has to be
 * proxied (the token lives on the storefront), while a photo WE sent is already a
 * public Cloudinary URL. Same field, two shapes.
 */
function mediaUrl(mediaId: string): string {
  return /^https?:\/\//.test(mediaId) ? mediaId : `/api/ops/media/${mediaId}`
}

/** Vignette de repli : pas de media, ou media expire cote Meta. */
function ImagePlaceholder({ out, caption, expiree }: { out: boolean; caption: string; expiree?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
      background: out ? 'rgba(255,255,255,.15)' : 'var(--bg-2)',
      border: out ? '1px solid rgba(255,255,255,.2)' : '1px solid var(--line-soft)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 6, fontSize: 20,
        background: out ? 'rgba(255,255,255,.2)' : 'var(--bg-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>🖼️</div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, opacity: out ? 0.95 : 1 }}>
          {expiree ? 'Image expirée' : 'Image envoyée'}
        </div>
        {expiree && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
            WhatsApp ne conserve les photos que 30 jours
          </div>
        )}
        {caption && <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 2 }}>{caption}</div>}
      </div>
    </div>
  )
}

/**
 * Photo du fil. Les media IDs Meta expirent au bout d'environ 30 jours : passe
 * ce delai le proxy renvoie une 500 et l'ancien code laissait une icone
 * d'image cassee. On bascule sur une vignette explicite.
 */
function ThreadImage({ mediaId, out, caption }: { mediaId: string; out: boolean; caption: string }) {
  const [erreur, setErreur] = useState(false)
  if (erreur) return <ImagePlaceholder out={out} caption={caption} expiree />
  return (
    <div>
      <a href={mediaUrl(mediaId)} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', maxWidth: 280, borderRadius: 12, overflow: 'hidden', border: out ? '2px solid rgba(255,255,255,.3)' : '2px solid var(--line-soft)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(mediaId)} alt="Photo échangée dans la conversation" loading="lazy"
          onError={() => setErreur(true)}
          style={{ width: '100%', height: 'auto', display: 'block' }} />
      </a>
      {caption && <div style={{ fontSize: 12.5, marginTop: 6, opacity: 0.9 }}>{caption}</div>}
    </div>
  )
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'awaiting'>('all')

  const [selected, setSelected] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [rewardMsg, setRewardMsg] = useState('')

  // Photo attachment for the reply composer.
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')

  const [showQuick, setShowQuick] = useState(false)

  // Sur telephone les trois panneaux ne tiennent pas : 320px de liste + 280px
  // de contexte sur un ecran de 390px laissaient une dizaine de pixels au fil,
  // et le panneau de droite n'avait aucune regle CSS pour se replier.
  // On bascule donc sur la navigation de WhatsApp mobile : la liste, puis le
  // fil en plein ecran avec un retour, et la fiche en superposition.
  const [isNarrow, setIsNarrow] = useState(false)
  const [showContext, setShowContext] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: 860px)')
    const sync = () => setIsNarrow(q.matches)
    sync()
    q.addEventListener('change', sync)
    return () => q.removeEventListener('change', sync)
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  function clearPhoto() {
    setPhoto(null)
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function pickPhoto(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setSendError('Image uniquement'); return }
    if (file.size > 5 * 1024 * 1024) { setSendError('Image trop lourde — max 5 Mo'); return }
    setSendError('')
    setPhoto(file)
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
  }

  // Release the last preview when the page unmounts.
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

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
    setReply(''); setSendError(''); setRewardMsg(''); clearPhoto(); setShowQuick(false)
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

  /** Retour a la liste sur telephone. */
  const closeConv = useCallback(() => {
    setSelected(null); setThread(null); setShowContext(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('phone')
    window.history.replaceState({}, '', url)
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread])

  const lastInbound = thread?.messages.filter(m => m.direction === 'in').slice(-1)[0]
  const hoursSince = lastInbound ? (Date.now() - new Date(lastInbound.createdAt).getTime()) / 3600000 : Infinity
  const windowOpen = hoursSince <= 24

  async function sendReply() {
    if (sending || !selected) return
    // A photo can travel alone; text alone still works as before.
    if (!photo && !reply.trim()) return
    setSending(true); setSendError('')
    try {
      let res: Response
      if (photo) {
        const fd = new FormData()
        fd.append('file', photo)
        fd.append('phone', selected)
        // Whatever is typed becomes the photo's caption — one message, not two.
        if (reply.trim()) fd.append('caption', reply.trim())
        res = await fetch('/api/ops/messages/send-media', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/ops/messages/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: selected, text: reply.trim() }),
        })
      }
      const json = await res.json()
      if (!res.ok) { setSendError(json.error || 'Échec'); return }
      setReply(''); clearPhoto()
      await selectConv(selected)
    } catch { setSendError('Erreur réseau') }
    finally { setSending(false) }
  }

  /**
   * Renvoie un message dont l'envoi avait echoue. On repasse par la meme route
   * que la saisie manuelle : si la cause etait passagere (facturation reglee,
   * coupure reseau) ca part, sinon l'API renvoie l'erreur telle quelle.
   */
  async function retrySend(m: Message) {
    if (sending || !selected || !m.body) return
    setSending(true); setSendError('')
    try {
      const res = await fetch('/api/ops/messages/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected, text: m.body }),
      })
      const json = await res.json()
      if (!res.ok) { setSendError(json.error || 'Nouvel échec'); return }
      await selectConv(selected)
    } catch { setSendError('Erreur réseau') }
    finally { setSending(false) }
  }

  /** Insere une reponse rapide dans le champ plutot que de l'envoyer : on relit toujours avant. */
  function insertQuickReply(text: string) {
    setReply(prev => (prev.trim() ? `${prev.trimEnd()} ${text}` : text))
    setShowQuick(false)
    replyRef.current?.focus()
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
    .filter(c => filter === 'awaiting' ? c.awaitingReply : true)
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
        <aside style={{
          width: isNarrow ? '100%' : 320, flexShrink: 0,
          borderRight: isNarrow ? 'none' : '1px solid var(--line-soft)',
          background: 'var(--bg-1)', flexDirection: 'column',
          display: isNarrow && selected ? 'none' : 'flex',
        }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line-soft)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', margin: '0 0 10px' }}>Conversations</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-2)', borderRadius: 'var(--radius)', padding: '7px 10px' }}>
              <Search style={{ width: 14, height: 14, color: 'var(--tx-faint)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--tx-hi)', width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {(['all', 'awaiting'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="btn-modern btn-sm"
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: filter === f ? 'var(--green)' : 'var(--bg-2)',
                    color: filter === f ? '#fff' : 'var(--tx-mid)', border: 'none',
                  }}>
                  {f === 'all'
                    ? `Toutes (${conversations.length})`
                    : `En attente (${conversations.filter(c => c.awaitingReply).length})`}
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
                      {conv.failedCount > 0 && (
                        <span title={`${conv.failedCount} envoi(s) en echec`}
                          style={{ fontSize: 11, flexShrink: 0 }}>⚠️</span>
                      )}
                    </div>
                    {/* Etat d'attente + temps restant pour repondre gratuitement.
                        Sans ca, une cliente pouvait attendre 50 jours sans que
                        rien ne la distingue dans la liste. */}
                    {conv.awaitingReply && (() => {
                      const h = conv.windowHoursLeft
                      const ferme = h == null || h <= 0
                      const urgent = !ferme && h! <= 3
                      const couleur = ferme ? 'var(--tx-faint)' : urgent ? '#B3261E' : 'var(--amber, #B45309)'
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <span style={{
                            background: ferme ? 'var(--bg-2)' : couleur, color: ferme ? 'var(--tx-mid)' : '#fff',
                            fontSize: 9.5, fontWeight: 800, borderRadius: 999, padding: '1px 7px',
                            letterSpacing: '.02em', flexShrink: 0,
                          }}>
                            EN ATTENTE
                          </span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: couleur }}>
                            {ferme
                              ? 'fenêtre fermée · template requis'
                              : urgent
                                ? `plus que ${h}h pour répondre`
                                : `${h}h restantes`}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ───────────── Center: thread ───────────── */}
        <main style={{ flex: 1, minWidth: 0, flexDirection: 'column', background: 'var(--bg-0)', display: isNarrow && !selected ? 'none' : 'flex' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-faint)' }}>
              <MessageCircle style={{ width: 44, height: 44, marginBottom: 12, opacity: 0.5 }} />
              <p style={{ fontSize: 14 }}>Sélectionnez une conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: isNarrow ? 8 : 12, padding: isNarrow ? '0 10px' : '0 18px', borderBottom: '1px solid var(--line-soft)', background: 'var(--bg-1)' }}>
                {isNarrow && (
                  <button type="button" onClick={closeConv} aria-label="Retour aux conversations"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-mid)' }}>
                    <ArrowLeft style={{ width: 20, height: 20 }} />
                  </button>
                )}
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, background: `oklch(0.62 0.15 ${avatarHue(headerName)})` }}>
                  {initials(thread?.userName || null, headerPhone)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerName}</div>
                  <div style={{ fontSize: 12, color: 'var(--tx-lo)' }}>{headerPhone}</div>
                </div>
                {/* Sur telephone la fiche n'a plus de colonne : elle s'ouvre en
                    superposition, comme les infos de contact dans WhatsApp. */}
                {isNarrow ? (
                  <button type="button" onClick={() => setShowContext(true)} aria-label="Infos cliente"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'var(--bg-0)', cursor: 'pointer', color: 'var(--tx-mid)' }}>
                    <User style={{ width: 17, height: 17 }} />
                  </button>
                ) : thread?.userId ? (
                  <Link href={`/customers/${thread.userId}`} className="btn-modern btn-sm btn-secondary" style={{ flexShrink: 0 }}>
                    <User style={{ width: 14, height: 14 }} /> Fiche
                  </Link>
                ) : null}
              </div>

              {/* Messages */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column' }}>
                {loadingThread ? (
                  <p style={{ textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13, marginTop: 30 }}>Chargement…</p>
                ) : !thread || thread.messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13, marginTop: 30 }}>Aucun message</p>
                ) : thread.messages.map((m, i) => {
                  const out = m.direction === 'out'
                  const prev = i > 0 ? thread.messages[i - 1] : null
                  const next = i < thread.messages.length - 1 ? thread.messages[i + 1] : null
                  const nouveauJour = !prev || !sameDay(prev.createdAt, m.createdAt)
                  const ecart = (a: Message, b: Message) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  // Un groupe = messages consecutifs du meme cote a moins de 5 min.
                  // On n'affiche l'etiquette de type qu'en tete de groupe et la
                  // pointe de bulle qu'en bas : c'est ce qui fait respirer un fil.
                  const suiteDuHaut = !nouveauJour && !!prev && prev.direction === m.direction && ecart(prev, m) < 300000
                  const suiteEnBas = !!next && sameDay(next.createdAt, m.createdAt) && next.direction === m.direction && ecart(m, next) < 300000
                  const R = 16, POINTE = 5, SUITE = 7
                  const rayon = out
                    ? `${R}px ${suiteDuHaut ? SUITE : R}px ${suiteEnBas ? SUITE : POINTE}px ${R}px`
                    : `${suiteDuHaut ? SUITE : R}px ${R}px ${R}px ${suiteEnBas ? SUITE : POINTE}px`
                  const echec = m.status === 'failed'
                  const raison = echec ? errorLabel(m.errorCode) : null
                  return (
                    <div key={m.id}>
                      {nouveauJour && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: i === 0 ? '0 0 14px' : '20px 0 14px' }}>
                          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-lo)', background: 'var(--bg-2)', borderRadius: 999, padding: '3px 12px', letterSpacing: '.02em', textTransform: 'capitalize' }}>
                            {dayLabel(m.createdAt)}
                          </span>
                          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginTop: nouveauJour ? 0 : suiteDuHaut ? 3 : 11 }}>
                      <div style={{
                        maxWidth: '72%', borderRadius: rayon, padding: '8px 12px',
                        background: out ? 'var(--green)' : 'var(--bg-1)',
                        color: out ? '#fff' : 'var(--tx-hi)',
                        border: echec ? '1.5px solid var(--red)' : out ? 'none' : '1px solid var(--line-soft)',
                        boxShadow: 'var(--shadow-1)',
                      }}>
                        {(!suiteDuHaut || m.orderId) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            {!suiteDuHaut && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>{typeLabel(m)}</span>}
                            {m.orderId && (
                              <Link href={`/orders/${m.orderId}`} style={{ fontSize: 11, fontWeight: 600, textDecoration: 'underline', color: out ? 'rgba(255,255,255,.9)' : 'var(--blue)' }}>
                                <ShoppingBag style={{ width: 11, height: 11, display: 'inline', marginRight: 3 }} />#{m.orderId}
                              </Link>
                            )}
                          </div>
                        )}
                        {m.body?.startsWith('[Image]') ? (
                          m.mediaId ? (
                            <ThreadImage mediaId={m.mediaId} out={out} caption={m.body.replace('[Image]', '').trim()} />
                          ) : (
                            <ImagePlaceholder out={out} caption={m.body.replace('[Image]', '').trim()} />
                          )
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, justifyContent: 'flex-end' }}>
                          <span title={fmtTime(m.createdAt, true)} style={{ fontSize: 10.5, opacity: 0.65 }}>
                            {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {out && <StatusBadge status={m.status} light />}
                        </div>
                        {/* Un envoi echoue disparaissait sans un mot : ni la cause,
                            ni le moyen de reessayer. */}
                        {echec && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#FCA5A5' }}>
                              <AlertCircle style={{ width: 11, height: 11, display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
                              {raison || 'Envoi échoué'}
                            </span>
                            {m.body && !m.body.startsWith('[') && (
                              <button type="button" onClick={() => retrySend(m)} disabled={sending}
                                style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', cursor: sending ? 'default' : 'pointer', border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.16)', color: '#fff' }}>
                                <RotateCcw style={{ width: 10, height: 10, display: 'inline', marginRight: 3, verticalAlign: '-1px' }} />
                                Réessayer
                              </button>
                            )}
                          </div>
                        )}
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
                    {showQuick && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9, padding: 10, borderRadius: 'var(--radius)', background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
                        {QUICK_REPLIES.map(q => (
                          <button key={q.label} type="button" onClick={() => insertQuickReply(q.text)} title={q.text}
                            style={{ fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '5px 11px', cursor: 'pointer', border: '1px solid var(--line-soft)', background: 'var(--bg-0)', color: 'var(--tx-mid)' }}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {photoPreview && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: 8, borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'var(--bg-1)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoPreview} alt="Aperçu" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: 'var(--tx-mid)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {photo?.name} · le texte servira de légende
                        </span>
                        <button type="button" onClick={clearPhoto} aria-label="Retirer la photo"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: '1px solid var(--line-soft)', background: 'var(--bg-0)', cursor: 'pointer', color: 'var(--tx-mid)', flexShrink: 0 }}>
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => pickPhoto(e.target.files?.[0] || null)} />
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                        aria-label="Joindre une photo" title="Joindre une photo"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: photo ? 'var(--bg-2)' : 'var(--bg-0)', cursor: sending ? 'default' : 'pointer', color: photo ? 'var(--tx-hi)' : 'var(--tx-mid)', opacity: sending ? 0.5 : 1 }}>
                        <ImagePlus style={{ width: 16, height: 16 }} />
                      </button>
                      <button type="button" onClick={() => setShowQuick(v => !v)} disabled={sending}
                        aria-label="Réponses rapides" title="Réponses rapides" aria-expanded={showQuick}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: showQuick ? 'var(--green-bg)' : 'var(--bg-0)', cursor: sending ? 'default' : 'pointer', color: showQuick ? 'var(--green)' : 'var(--tx-mid)', opacity: sending ? 0.5 : 1 }}>
                        <Zap style={{ width: 16, height: 16 }} />
                      </button>
                      <textarea ref={replyRef} value={reply} onChange={e => setReply(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply() }}
                        placeholder={photo ? 'Légende (facultatif)…' : 'Écrire une réponse… (Ctrl+Entrée)'} rows={2}
                        style={{ flex: 1, resize: 'none', borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', padding: '9px 12px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--tx-hi)', background: 'var(--bg-0)' }} />
                      <button onClick={sendReply} disabled={(!reply.trim() && !photo) || sending} className="btn-modern btn-primary" style={{ opacity: ((!reply.trim() && !photo) || sending) ? 0.5 : 1 }}>
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
        {isNarrow && showContext && (
          <div onClick={() => setShowContext(false)} aria-hidden
            style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 350 / 0.4)', zIndex: 60 }} />
        )}
        {selected && (!isNarrow || showContext) && (
          <aside className="msg-context" style={{
            flexShrink: 0, background: 'var(--bg-1)', overflowY: 'auto', padding: 18,
            borderLeft: '1px solid var(--line-soft)',
            ...(isNarrow
              ? { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(340px, 88vw)', zIndex: 61, boxShadow: '0 0 40px oklch(0.2 0.02 350 / 0.25)' }
              : { width: 280 }),
          }}>
            {isNarrow && (
              <button type="button" onClick={() => setShowContext(false)} aria-label="Fermer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, marginBottom: 4, borderRadius: 'var(--radius)', border: '1px solid var(--line-soft)', background: 'var(--bg-0)', cursor: 'pointer', color: 'var(--tx-mid)' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            )}
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
                {thread && thread.orders?.length > 0
                  ? 'Pas de compte client — commandes passées en invité, retrouvées par le numéro.'
                  : 'Numéro non rattaché à une cliente enregistrée.'}
              </p>
            )}

            {/* Commandes de la cliente, dans le panneau plutot que dans /orders :
                la question posee dans le fil porte presque toujours sur l'une
                d'elles. Rattachees aussi par telephone, donc visibles meme
                quand la commande a ete passee en invite. */}
            {thread && thread.orders?.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--tx-lo)' }}>
                  <Package style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.02em' }}>
                    COMMANDES ({thread.orders.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {thread.orders.map(o => {
                    const st = ORDER_STATUS[o.status] || { label: o.status, color: 'var(--tx-lo)' }
                    return (
                      <Link key={o.id} href={`/orders/${o.id}`}
                        style={{ display: 'block', background: 'var(--bg-2)', borderRadius: 'var(--radius)', padding: '9px 11px', textDecoration: 'none', border: '1px solid transparent' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-hi)' }}>
                            #{o.orderNumber || o.id}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-hi)' }}>
                            {Math.round(o.total)} DH
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>
                            {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </span>
                        </div>
                        {o.senditTrackingNumber && (
                          <div style={{ fontSize: 10.5, color: 'var(--tx-faint)', marginTop: 2 }}>
                            Suivi {o.senditTrackingNumber}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
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
