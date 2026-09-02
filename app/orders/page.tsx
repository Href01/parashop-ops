'use client'

import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Filter, Plus, RefreshCw, Search, ShieldCheck, Star, Trash2, Truck, Undo2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'FAILED'
/* Les six cases des cartes du haut sont des filtres a part entiere : `Case` est
   declare plus bas, les alias de type etant remontes a la compilation. */
type OrderFilter = 'all' | 'pending' | 'no-shipment' | 'incomplete' | 'delivered-no-review' | Case
type DateFilter = 'today' | 'week' | 'month' | 'all'

const PAGE_SIZE = 25

interface OrderRow {
  id: number
  orderNumber?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  sourceChannel?: string
  status: OrderStatus
  deliveryStatus?: string
  senditStatus?: string | null
  senditTrackingId?: string | null
  revenue?: number | string | null
  estimatedProfit?: number | string | null
  marginPercent?: number | string | null
  createdAt: string
  items_count?: number
  product_names?: string | null
  reviewRequestSentAt?: string | null
}

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'En livraison',
  DELIVERED: 'Livrée',
  RETURNED: 'Retournée',
  CANCELLED: 'Annulée',
  FAILED: 'Échouée',
}

const statusClass: Record<string, string> = {
  PENDING: 'st-pending',
  CONFIRMED: 'st-confirmed',
  SHIPPED: 'st-shipped',
  DELIVERED: 'st-delivered',
  RETURNED: 'st-returned',
  CANCELLED: 'st-cancelled',
  FAILED: 'st-failed',
}

const channelColors: Record<string, string> = {
  Website: 'var(--c-website)',
  WhatsApp: 'var(--c-whatsapp)',
  Instagram: 'var(--c-instagram)',
  TikTok: 'var(--c-tiktok)',
  Manual: 'var(--c-manual)',
}

const dateFilterLabels: Record<DateFilter, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: '30 jours',
  all: 'Tout',
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: unknown) {
  return toNumber(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

/** Real completeness from actual fields (the completenessScore column doesn't exist). */
function orderCompleteness(o: OrderRow): number {
  const checks = [!!o.deliveryName, !!o.deliveryPhone, !!o.deliveryCity, !!o.product_names]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
function completenessColor(value: number) {
  if (value >= 100) return 'var(--green)'
  if (value >= 75) return 'var(--amber)'
  return 'var(--red)'
}

/* LA PASTILLE À INITIALE.
   Sa teinte est tirée du nom, pas d'un compteur de ligne : la même cliente garde
   donc la même couleur d'un chargement, d'un tri et d'une page à l'autre. C'est
   ce qui en fait un repère plutôt qu'une décoration. Les six paires sont celles
   du système — fond pastel, texte foncé assorti, contraste AA sur blanc. */
const AVATAR_TONES: Array<{ background: string; color: string }> = [
  { background: 'var(--rose-bg)', color: 'var(--red)' },
  { background: 'var(--blue-bg)', color: 'var(--blue)' },
  { background: 'var(--green-bg)', color: 'var(--green)' },
  { background: 'var(--violet-bg)', color: 'var(--violet)' },
  { background: 'var(--amber-bg)', color: 'var(--amber)' },
  { background: 'var(--teal-bg)', color: 'var(--teal)' },
]

function initialOf(name?: string | null): string {
  const clean = (name || '').trim()
  return clean ? clean[0].toUpperCase() : '?'
}

function avatarStyle(name?: string | null) {
  const clean = (name || '').trim()
  if (!clean) return { background: 'var(--bg-3)', color: 'var(--tx-lo)' }
  let sum = 0
  for (let i = 0; i < clean.length; i += 1) sum += clean.charCodeAt(i)
  return AVATAR_TONES[sum % AVATAR_TONES.length]
}

// Real Sendit delivery states → French (so the column matches what's on Sendit).
const SENDIT_DELIVERY: Record<string, { text: string; cls: string }> = {
  /* PENDING manquait ici, et `deliveryLabel` retombait sur sa branche de secours :
     la colonne affichait le mot anglais brut « PENDING » en style expédié. Chez
     Sendit il ne veut pas dire « en route » mais « étiquette créée, colis pas
     encore ramassé » — donc en attente, pas en mouvement. */
  PENDING: { text: 'Étiquette créée', cls: 'st-pending' },
  WAREHOUSE: { text: 'Au dépôt', cls: 'st-shipped' },
  PICKED_UP: { text: 'Ramassée', cls: 'st-shipped' },
  IN_TRANSIT: { text: 'En transit', cls: 'st-shipped' },
  DISTRIBUTION: { text: 'En distribution', cls: 'st-shipped' },
  DELIVERED: { text: 'Livrée', cls: 'st-delivered' },
  RETURNED: { text: 'Retournée', cls: 'st-returned' },
  REJECTED: { text: 'Refusée', cls: 'st-returned' },
  REFUSED: { text: 'Refusée', cls: 'st-returned' },
  CANCELED: { text: 'Annulée', cls: 'st-cancelled' },
  CANCELLED: { text: 'Annulée', cls: 'st-cancelled' },
}

/* LES SEULS ÉTATS OÙ LE COLIS BOUGE VRAIMENT. `PENDING` en est exclu a dessein :
   l'étiquette existe, le colis est encore chez nous. */
const SENDIT_EN_MOUVEMENT = new Set(['WAREHOUSE', 'PICKED_UP', 'IN_TRANSIT', 'DISTRIBUTION'])

type Case = 'attente' | 'confirmee' | 'transit' | 'livree' | 'retournee' | 'annulee'

const CASES = new Set<string>(['attente', 'confirmee', 'transit', 'livree', 'retournee', 'annulee'])

/**
 * LA CASE D'UNE COMMANDE — une seule, jamais deux.
 *
 * Les six compteurs se calculaient chacun de leur côté, et « En transit » ne
 * comptait pas la même chose que les cinq autres : eux lisaient `status`, lui
 * lisait la présence d'un numéro de suivi. Deux axes différents, donc des cases
 * qui se chevauchent — les six affichaient 217 pour 215 commandes, et les deux
 * seules commandes confirmées étaient comptées DEUX fois, une fois en
 * « Confirmées » et une fois en « En transit », alors qu'aucune ne bougeait.
 *
 * POURQUOI L'AUTEUR N'AVAIT PAS PU FAIRE AUTREMENT : `mapSenditStatus` ne rend
 * jamais `SHIPPED` — tout ce qui n'est ni livré ni annulé devient `CONFIRMED`.
 * Compter `SHIPPED` aurait donc toujours donné zéro, d'où l'approximation par le
 * numéro de suivi. Mais ce numéro existe dès l'impression de l'étiquette, bien
 * avant le ramassage : il annonce un départ, pas un trajet.
 *
 * La vérité est dans `senditStatus`, que le transporteur tient à jour. Une
 * commande confirmée est soit en attente de ramassage, soit déjà en route ; les
 * séparer là-dessus donne un vrai partage. Passer par UNE fonction plutôt que
 * six filtres rend le chevauchement impossible a réintroduire.
 */
function caseDe(o: OrderRow): Case {
  // Les états finaux d'abord : ils priment sur tout suivi resté en chemin.
  if (o.status === 'DELIVERED') return 'livree'
  if (o.status === 'CANCELLED') return 'annulee'
  if (o.status === 'RETURNED' || o.status === 'FAILED') return 'retournee'
  if (o.status === 'SHIPPED') return 'transit'
  if (SENDIT_EN_MOUVEMENT.has((o.senditStatus || '').toUpperCase())) return 'transit'
  if (o.status === 'PENDING') return 'attente'
  return 'confirmee'
}

/** Delivery label — shows the real Sendit status when present, else derives it. */
function deliveryLabel(o: OrderRow): { text: string; cls: string } {
  const ss = o.senditStatus?.toUpperCase()
  if (ss) return SENDIT_DELIVERY[ss] || { text: o.senditStatus as string, cls: 'st-shipped' }
  if (o.status === 'DELIVERED') return { text: 'Livrée', cls: 'st-delivered' }
  if (o.status === 'CANCELLED') return { text: 'Annulée', cls: 'st-cancelled' }
  if (o.status === 'RETURNED' || o.status === 'FAILED') return { text: 'Retournée', cls: 'st-returned' }
  if (o.senditTrackingId) return { text: 'En transit', cls: 'st-shipped' }
  return { text: 'Non expédiée', cls: 'st-pending' }
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [reviewSending, setReviewSending] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)

  const showToast = (text: string, ok: boolean, ms = 3500) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), ms)
  }
  const toggleSelect = (id: number) =>
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => {
    void fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/ops/orders', { cache: 'no-store' })
      const data = (await res.json()) as OrderRow[]
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Supprimer la commande #${orderId} ?\n\nCette action est irréversible.`)) return

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')

      // Remove from list
      setOrders((currentOrders) => currentOrders.filter(o => o.id !== orderId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('Échec de la suppression de la commande')
    }
  }

  const requestReview = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (reviewSending.has(orderId)) return
    setReviewSending((s) => new Set(s).add(orderId))
    try {
      const res = await fetch(`/api/ops/orders/${orderId}/review-request`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec de l’envoi')
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, reviewRequestSentAt: new Date().toISOString() } : o)))
      setToast({ text: `Demande d’avis envoyée (#${orderId})`, ok: true })
    } catch (err: any) {
      setToast({ text: err.message || 'Échec de l’envoi', ok: false })
    } finally {
      setReviewSending((s) => { const n = new Set(s); n.delete(orderId); return n })
      setTimeout(() => setToast(null), 3500)
    }
  }

  const bulkRequestReview = async () => {
    // One message per customer (dedupe by phone): the endpoint marks all of a
    // customer's delivered orders as asked, so don't message the same number twice.
    const seen = new Set<string>()
    const targets = orders.filter((o) => {
      if (!selectedIds.has(o.id) || o.status !== 'DELIVERED') return false
      const key = o.deliveryPhone || `id:${o.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (targets.length === 0) { showToast('Aucune commande livrée sélectionnée', false); return }
    if (!confirm(`Envoyer la demande d’avis à ${targets.length} client(s) ?`)) return

    setBulkSending(true)
    let ok = 0, fail = 0
    for (const o of targets) {
      try {
        const res = await fetch(`/api/ops/orders/${o.id}/review-request`, { method: 'POST' })
        res.ok ? ok++ : fail++
      } catch { fail++ }
    }
    setBulkSending(false)
    setSelectedIds(new Set())
    await fetchOrders()
    showToast(`${ok} demande(s) envoyée(s)${fail ? `, ${fail} échec(s)` : ''}`, fail === 0, 4500)
  }

  const updateChannel = async (orderId: number, sourceChannel: string) => {
    setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, sourceChannel } : o)))
    await fetch(`/api/ops/orders/${orderId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceChannel }),
    }).catch(() => {})
  }

  const handleSyncSendit = async () => {
    if (!confirm('Synchroniser les statuts de livraison depuis Sendit ?\n\nToutes les commandes en transit seront mises à jour.')) return

    try {
      const res = await fetch('/api/ops/orders/sync-sendit', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')

      await fetchOrders()
      alert('Synchronisation Sendit réussie ✓')
    } catch (error) {
      console.error('Sync error:', error)
      alert('Échec de la synchronisation Sendit')
    }
  }

  const handleExport = () => {
    const csv = [
      ['Order #', 'Customer', 'Phone', 'City', 'Status', 'Revenue', 'Profit', 'Margin %', 'Date'],
      ...filteredOrders.map(o => [
        o.orderNumber || o.id,
        o.deliveryName || '',
        o.deliveryPhone || '',
        o.deliveryCity || '',
        o.status,
        o.revenue || 0,
        o.estimatedProfit || 0,
        o.marginPercent || 0,
        new Date(o.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cycleDateFilter = () => {
    const nextByFilter: Record<DateFilter, DateFilter> = {
      today: 'week',
      week: 'month',
      month: 'all',
      all: 'today',
    }
    setDateFilter(nextByFilter[dateFilter])
    setCurrentPage(1)
  }

  const selectFilter = (filter: OrderFilter) => {
    setActiveFilter(filter)
    setCurrentPage(1)
  }

  const stats = useMemo(() => {
    // Un seul passage, une seule case par commande : la somme des six cartes
    // redonne donc exactement le total annoncé en haut de page.
    const n: Record<Case, number> = { attente: 0, confirmee: 0, transit: 0, livree: 0, retournee: 0, annulee: 0 }
    for (const o of orders) n[caseDe(o)] += 1

    /* La part se lit à côté du nombre : « 192 » ne dit rien seul, « 192 · 84 % »
       situe. Le total est celui des commandes chargées, et comme `caseDe` range
       chaque commande dans une case et une seule, les six parts font 100. */
    const total = orders.length || 1
    const part = (v: number) => `${Math.round((v / total) * 100)}%`

    return [
      { label: 'En attente', value: n.attente, share: part(n.attente), color: 'var(--amber)', tint: 'var(--amber-bg)', Icon: Clock, className: 'st-pending', cas: 'attente' as Case },
      { label: 'Confirmées', value: n.confirmee, share: part(n.confirmee), color: 'var(--blue)', tint: 'var(--blue-bg)', Icon: Check, className: 'st-confirmed', cas: 'confirmee' as Case },
      { label: 'En transit', value: n.transit, share: part(n.transit), color: 'var(--violet)', tint: 'var(--violet-bg)', Icon: Truck, className: 'st-shipped', cas: 'transit' as Case },
      { label: 'Livrées', value: n.livree, share: part(n.livree), color: 'var(--green)', tint: 'var(--green-bg)', Icon: ShieldCheck, className: 'st-delivered', cas: 'livree' as Case },
      { label: 'Retournées', value: n.retournee, share: part(n.retournee), color: 'var(--red)', tint: 'var(--red-bg)', Icon: Undo2, className: 'st-returned', cas: 'retournee' as Case },
      { label: 'Annulées', value: n.annulee, share: part(n.annulee), color: 'var(--tx-mid)', tint: 'var(--bg-3)', Icon: XCircle, className: 'st-cancelled', cas: 'annulee' as Case },
    ]
  }, [orders])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const now = new Date()

    return orders.filter((order) => {
      if (normalizedSearch) {
        const searchable = [
          order.id,
          order.orderNumber,
          order.deliveryName,
          order.deliveryPhone,
          order.deliveryCity,
          order.sourceChannel,
          order.product_names,
        ].join(' ').toLowerCase()

        if (!searchable.includes(normalizedSearch)) return false
      }

      if (activeFilter === 'pending' && order.status !== 'PENDING') return false
      if (
        activeFilter === 'no-shipment' &&
        (order.status !== 'CONFIRMED' || (order.deliveryStatus && order.deliveryStatus !== 'NOT_CREATED'))
      ) {
        return false
      }
      if (activeFilter === 'incomplete' && orderCompleteness(order) >= 100) return false
      if (activeFilter === 'delivered-no-review' && (order.status !== 'DELIVERED' || !!order.reviewRequestSentAt)) return false

      /* LA MEME FONCTION COMPTE ET FILTRE. Les cartes annoncaient un nombre sans
         offrir de chemin vers les lignes : « 2 confirmees » etait exact, mais ces
         deux commandes dormaient aux rangs 48 et 67 sur 215, pages 2 et 3, sans
         aucun filtre pour les atteindre. Passer par `caseDe` des deux cotes
         garantit que le nombre affiche et la liste obtenue ne peuvent pas
         diverger. */
      if (CASES.has(activeFilter) && caseDe(order) !== activeFilter) return false

      if (dateFilter !== 'all') {
        const createdAt = new Date(order.createdAt)
        if (Number.isNaN(createdAt.getTime())) return false

        if (dateFilter === 'today') {
          return createdAt.toDateString() === now.toDateString()
        }

        const days = dateFilter === 'week' ? 7 : 30
        const cutoff = new Date(now)
        cutoff.setDate(cutoff.getDate() - days)
        return createdAt >= cutoff
      }

      return true
    })
  }, [orders, search, activeFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const currentPageInRange = Math.min(currentPage, totalPages)
  const pageStart = (currentPageInRange - 1) * PAGE_SIZE
  const paginatedOrders = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE)
  /* `'week'` figurait ici alors que l'etat initial est `'all'` : « Reinitialiser »
     retrecissait la liste a sept jours au lieu de la rendre entiere, et le bouton
     s'affichait comme actif sur une page qu'on venait d'ouvrir. */
  const hasActiveFilters = search.trim() || activeFilter !== 'all' || dateFilter !== 'all'

  const resetFilters = () => {
    setSearch('')
    setActiveFilter('all')
    setDateFilter('all')
    setCurrentPage(1)
  }

  return (
    <BosShell active="orders" title="Commandes" crumb="Opérations">
      <div style={{ maxWidth: '1640px', margin: '0 auto', padding: '22px 24px 60px' }}>
        {/* L'EN-TÊTE TENAIT SUR QUATRE RANGÉES POUR DIRE TROIS FOIS LA MÊME CHOSE.
            Un fil d'Ariane « OPÉRATIONS · COMMANDES », un titre de 30 px, un
            sous-titre — alors que la barre du haut affiche déjà « Commandes /
            Opérations ». Sur mobile il fallait faire défiler ~1700 px avant la
            première commande. Tout tient désormais sur une ligne : le titre, le
            compte, les actions. */}
        <div className="orders-page-head" style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '11px' }}>
          <h1 className="serif-display" style={{ fontSize: '19px', lineHeight: 1.1, margin: 0 }}>Commandes</h1>
          <span
            className="bo-num"
            style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx-lo)', background: 'var(--bg-3)', padding: '3px 8px', borderRadius: '999px' }}
          >
            {orders.length}
          </span>
          <div className="orders-head-spacer" style={{ flex: 1 }} />
          <div className="orders-page-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-modern btn-secondary" onClick={handleSyncSendit}>
              <RefreshCw className="w-4 h-4" />
              Sync Sendit
            </button>
            <button type="button" className="btn-modern btn-secondary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <Link className="btn-modern btn-primary" href="/orders/new">
              <Plus className="w-4 h-4" />
              Nouvelle commande
            </Link>
          </div>
        </div>

        {/* `bo-kpi-strip` : grille sur ordinateur, bande qui défile sur téléphone.
            En 2×3, ces six cartes occupaient 300 px avant la première commande. */}
        <div className="bo-kpi-strip grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {stats.map((item) => {
            const actif = activeFilter === item.cas
            return (
            /* Un bouton, pas un `div` : la carte agit, elle doit donc s'annoncer
               comme telle au clavier et aux lecteurs d'ecran. Recliquer la carte
               active revient a « Toutes » — sans quoi on reste enferme dans un
               filtre sans savoir comment en sortir. */
            <button
              key={item.label}
              type="button"
              aria-pressed={actif}
              onClick={() => selectFilter(actif ? 'all' : item.cas)}
              className="card-modern text-left"
              style={{
                cursor: 'pointer',
                borderColor: actif ? item.color : undefined,
                boxShadow: actif ? `inset 0 0 0 1px ${item.color}` : undefined,
              }}
            >
              {/* Carré d'icône teinté puis chiffre : la tuile passe de 122 à ~78 px
                  et se lit d'un regard. Le pastel porte la teinte, le trait la
                  sature — une teinte par état, la même sur toutes les pages. */}
              <div style={{ padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span className="bo-isq" style={{ background: item.tint, color: item.color }}>
                    <item.Icon style={{ width: 16, height: 16 }} />
                  </span>
                  <span className="bo-sect">{item.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span className="bo-num" style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: item.color }}>
                    {item.value}
                  </span>
                  <span className="bo-num" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-faint)' }}>
                    {item.share}
                  </span>
                </div>
                {/* Masquée sous 640 px : sur un écran tactile la carte se tape,
                    et six mentions identiques repoussaient la première commande
                    de six lignes. Voir `.bo-hint-desktop` dans design-tokens.css. */}
                <span className="bo-hint-desktop" style={{ fontSize: '10.5px', fontWeight: 600, color: actif ? item.color : 'var(--tx-faint)' }}>
                  {actif ? 'Filtre actif — recliquer pour tout voir' : 'Cliquer pour filtrer'}
                </span>
              </div>
            </button>
            )
          })}
        </div>

        <div className="card-modern">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line-soft">
            <div className="search-box">
              <Search />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                /* Raccourci : `.search-box` a un min-width de 240 px et se fait
                   comprimer par la bande de filtres à côté. L'ancienne formule
                   « Rechercher par nom, téléphone, n°… » se coupait donc en plein
                   mot. Mieux vaut un libellé qui tient que trois mots amputés. */
                placeholder="Nom, téléphone, n°…"
              />
            </div>

            <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('all')}
              >
                Toutes <span className="ml-1 badge-modern badge-neutral badge-sm">{orders.length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'pending' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('pending')}
              >
                En attente <span className="ml-1 badge-modern badge-warning badge-sm">{stats[0].value}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'no-shipment' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('no-shipment')}
              >
                Sans envoi <span className="ml-1 badge-modern badge-info badge-sm">{orders.filter((order) => order.status === 'CONFIRMED' && (!order.deliveryStatus || order.deliveryStatus === 'NOT_CREATED')).length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'incomplete' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('incomplete')}
              >
                Incomplètes <span className="ml-1 badge-modern badge-danger badge-sm">{orders.filter((order) => orderCompleteness(order) < 100).length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'delivered-no-review' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('delivered-no-review')}
              >
                Avis à demander <span className="ml-1 badge-modern badge-info badge-sm">{orders.filter((o) => o.status === 'DELIVERED' && !o.reviewRequestSentAt).length}</span>
              </button>
            </div>

            <button type="button" className="btn-modern btn-sm btn-secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
              <Filter className="w-4 h-4" />
              Réinitialiser
            </button>
            <button type="button" className="btn-modern btn-sm btn-secondary" onClick={cycleDateFilter} title="Cycle date range">
              {dateFilterLabels[dateFilter]}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table-modern ord-table">
              {/* LARGEURS FIXÉES, ET C'EST TOUT LE CORRECTIF DE DENSITÉ.
                  Mesuré avant : « Commande » recevait 115 px et devait y loger le
                  numéro, la référence ET le nom du produit — qui se déchirait sur
                  six lignes et poussait la ligne à 142 px. Pendant ce temps
                  « Canal » et « Livraison » s'octroyaient 269 px à eux deux pour
                  afficher deux pastilles. On rend la largeur au contenu qui varie. */}
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: '62px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '176px' }} />
                <col style={{ width: '116px' }} />
                <col style={{ width: '104px' }} />
                {/* 126 : à 112, « Étiquette créée » perdait son dernier caractère —
                    relevé sur capture, pas déduit du DOM, où le texte était entier. */}
                <col style={{ width: '126px' }} />
                <col style={{ width: '68px' }} />
                <col style={{ width: '66px' }} />
                <col style={{ width: '62px' }} />
                {/* 106 et non 96 : à 96 la barre et son pourcentage ne tenaient pas
                    ensemble, et « 100% » se coupait en « 10( » — vu à l'écran. */}
                <col style={{ width: '106px' }} />
                <col style={{ width: '74px' }} />
                <col style={{ width: '34px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.has(o.id))}
                      onChange={(e) => {
                        const check = e.target.checked
                        setSelectedIds((s) => { const n = new Set(s); paginatedOrders.forEach((o) => check ? n.add(o.id) : n.delete(o.id)); return n })
                      }}
                    />
                  </th>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Produit</th>
                  <th>Canal</th>
                  <th>Statut</th>
                  <th>Livraison</th>
                  <th className="r">CA</th>
                  <th className="r">Profit</th>
                  <th className="r">Marge</th>
                  <th>Données</th>
                  <th className="r">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((item) => (
                    <tr key={item}>
                      <td colSpan={13}>
                        <div className="skeleton-line"></div>
                      </td>
                    </tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={13}>
                      <div style={{ textAlign: 'center', padding: '46px 20px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                          {orders.length === 0
                            ? <Plus style={{ width: 26, height: 26, color: 'var(--tx-faint)' }} />
                            : <Filter style={{ width: 26, height: 26, color: 'var(--tx-faint)' }} />}
                        </div>
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tx-mid)', margin: '0 0 4px' }}>
                          {orders.length === 0 ? 'Aucune commande pour le moment' : 'Aucun résultat'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--tx-faint)', margin: '0 0 16px', maxWidth: 360, marginInline: 'auto' }}>
                          {orders.length === 0
                            ? 'Créez votre première commande depuis WhatsApp, Instagram, TikTok ou par téléphone.'
                            : 'Aucune commande ne correspond aux filtres actuels.'}
                        </p>
                        {orders.length === 0 && (
                          <Link className="btn-modern btn-primary btn-sm" href="/orders/new" style={{ display: 'inline-flex' }}>
                            <Plus className="w-4 h-4" /> Nouvelle commande
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order) => {
                    const completeness = orderCompleteness(order)
                    const profit = toNumber(order.estimatedProfit)
                    const margin = order.marginPercent === null || order.marginPercent === undefined ? null : toNumber(order.marginPercent)
                    const deliv = deliveryLabel(order)

                    return (
                      <tr
                        key={order.id}
                        className="tbl-row-link"
                        onClick={() => router.push(`/orders/${order.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggleSelect(order.id)}
                          />
                        </td>
                        <td>
                          <span className="num fs12 t-strong" title={order.orderNumber || 'Commande manuelle'}>#{order.id}</span>
                        </td>
                        <td>
                          {/* La pastille à initiale donne un point d'accroche : dans une
                              liste de 228 lignes, l'œil retrouve une cliente à sa couleur
                              avant d'avoir lu son nom. La teinte est dérivée du nom, donc
                              stable d'un chargement à l'autre. */}
                          <div className="row gap8" style={{ minWidth: 0 }}>
                            <span className="bo-av" style={avatarStyle(order.deliveryName)}>
                              {initialOf(order.deliveryName)}
                            </span>
                            <span className="cellstack" style={{ minWidth: 0 }}>
                              <span className="t-strong ord-clip">{order.deliveryName || 'Sans nom'}</span>
                              {/* Ville et téléphone séparés, pour que le numéro puisse
                                  disparaître sous 640 px : c'est lui qui forçait la
                                  table à 474 px dans un écran de 390. Il reste à un
                                  tap, sur la fiche de la commande. */}
                              <span className="t-sub ord-clip">
                                <span className="bo-mobile-only">#{order.id} · </span>
                                {order.deliveryCity || 'Ville ?'}
                                <span className="bo-hint-desktop"> · {order.deliveryPhone || 'Tél ?'}</span>
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          {/* Sa propre colonne, et une seule ligne. C'est ce nom, écrasé
                              dans une colonne de 115 px, qui gonflait chaque ligne. */}
                          <span className="ord-clip t-sub" style={{ fontSize: '12px', color: 'var(--tx-mid)' }} title={order.product_names || ''}>
                            {order.product_names || '—'}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="row gap6">
                            <span className="chan-dot" style={{ background: channelColors[order.sourceChannel || 'Manual'] || 'var(--c-manual)' }}></span>
                            <select
                              value={order.sourceChannel || 'Manual'}
                              onChange={(e) => updateChannel(order.id, e.target.value)}
                              title="Tagger le canal"
                              style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '2px 4px', fontSize: 12, color: 'var(--tx-mid)', cursor: 'pointer' }}
                              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                              onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                            >
                              {['Manual', 'WhatsApp', 'Instagram', 'TikTok', 'Phone', 'Website', 'Facebook'].map((ch) => (
                                <option key={ch} value={ch}>{ch}</option>
                              ))}
                            </select>
                          </span>
                        </td>
                        <td>
                          <span className={`st ${statusClass[order.status] || 'st-pending'}`}>
                            <span className="sd"></span>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </td>
                        <td>
                          <span className={`st ${deliv.cls}`}><span className="sd"></span>{deliv.text}</span>
                        </td>
                        <td className="r">
                          {/* « MAD » disparaît sous 640 px : tout le BOS est en dirhams,
                              et ces trois lettres étaient les dernières à pousser la
                              colonne CA hors de l'écran. */}
                          <span className="num t-strong">{formatMoney(order.revenue)}</span> <span className="tx-lo fs11 bo-hint-desktop">MAD</span>
                        </td>
                        <td className="r">
                          {order.estimatedProfit === null || order.estimatedProfit === undefined ? (
                            <span className="tx-faint fs12">-</span>
                          ) : (
                            <span className={`num fw600 ${profit < 0 ? 'neg' : 'pos'}`}>{profit > 0 ? '+' : ''}{formatMoney(profit)}</span>
                          )}
                        </td>
                        <td className="r">
                          {margin === null ? <span className="tx-faint fs12">-</span> : <span className={`num ${margin < 0 ? 'neg' : 'tx-mid'}`}>{margin.toFixed(1)}%</span>}
                        </td>
                        <td>
                          <span className="comp-mini">
                            <span className="cm-track">
                              <span style={{ width: `${completeness}%`, background: completenessColor(completeness) }}></span>
                            </span>
                            <span className="num fs11" style={{ color: completenessColor(completeness) }}>
                              {completeness}%
                            </span>
                          </span>
                        </td>
                        <td className="r">
                          <span className="fs12 tx-lo mono">{new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {order.status === 'DELIVERED' && (
                              <button
                                onClick={(e) => requestReview(order.id, e)}
                                disabled={reviewSending.has(order.id)}
                                className="btn-icon-sm"
                                title={order.reviewRequestSentAt ? 'Avis déjà demandé — cliquer pour renvoyer' : 'Demander un avis (WhatsApp)'}
                                style={{ color: order.reviewRequestSentAt ? 'var(--green)' : '#9CA3AF', opacity: reviewSending.has(order.id) ? 0.5 : 1 }}
                              >
                                {reviewSending.has(order.id)
                                  ? <RefreshCw className="w-4 h-4 spin" />
                                  : <Star className="w-4 h-4" fill={order.reviewRequestSentAt ? 'currentColor' : 'none'} />}
                              </button>
                            )}
                            <button
                              onClick={(e) => deleteOrder(order.id, e)}
                              className="btn-ghost-red btn-icon-sm"
                              title="Delete order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-line-soft bg-bg-2">
            <span className="text-xs text-tx-lo">
              Affichage <span className="font-semibold text-tx-hi">{filteredOrders.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredOrders.length)}</span> sur {filteredOrders.length} commandes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, totalPages) - 1))}
                disabled={currentPageInRange <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Préc.
              </button>
              <button type="button" className="btn-modern btn-sm btn-primary">{currentPageInRange}/{totalPages}</button>
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, Math.min(page, totalPages) + 1))}
                disabled={currentPageInRange >= totalPages}
              >
                Suiv.
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg bg-bg-1 border border-line-soft">
          <span className="text-sm font-medium text-tx-mid">{selectedIds.size} sélectionnée(s)</span>
          <button onClick={bulkRequestReview} disabled={bulkSending} className="btn-modern btn-sm btn-primary inline-flex items-center gap-1.5">
            {bulkSending ? <RefreshCw className="w-4 h-4 spin" /> : <Star className="w-4 h-4" />}
            {bulkSending ? 'Envoi…' : 'Demander un avis'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="btn-modern btn-sm btn-secondary">Annuler</button>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-2"
          style={{ background: toast.ok ? 'var(--green, #0C6B52)' : '#DC2626' }}
        >
          {toast.ok ? <Star className="w-4 h-4" fill="currentColor" /> : null}
          {toast.text}
        </div>
      )}
    </BosShell>
  )
}
