'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Search, Filter, Download, UserPlus, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react'

type Customer = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  segment: string | null
  tier: string | null
  ordersCount: number | string | null
  lifetimeValue: number | string | null
  averageOrderValue: number | string | null
  lastOrderDate: string | null
  daysSinceLastOrder: number | string | null
  rfmScore: string | null
  churnRisk: number | string | null
  createdAt: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')

  useEffect(() => {
    fetchCustomers()
  }, [segmentFilter, tierFilter])

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (segmentFilter) params.append('segment', segmentFilter)
      if (tierFilter) params.append('tier', tierFilter)
      if (search) params.append('search', search)

      const res = await fetch(`/api/ops/customers?${params}`)
      const data = await res.json()
      setCustomers(data.customers || [])
    } catch (error) {
      console.error('Failed to fetch customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    fetchCustomers()
  }

  const [linking, setLinking] = useState(false)
  const handleBackfill = async () => {
    if (linking) return
    setLinking(true)
    try {
      const res = await fetch('/api/ops/customers/backfill', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { alert(`${d.linked} commande(s) liée(s) à une fiche cliente ✓`); fetchCustomers() }
      else alert(d.error || 'Échec')
    } catch { alert('Échec') }
    finally { setLinking(false) }
  }

  const handleExport = () => {
    const csv = [
      ['Name', 'Email', 'Phone', 'Segment', 'Tier', 'Orders', 'LTV (MAD)', 'Avg Order (MAD)', 'Last Order', 'RFM Score'],
      ...customers.map(c => [
        c.name || 'Sans nom',
        c.email || '',
        c.phone || '',
        getSegmentLabel(c.segment),
        getTierLabel(c.tier),
        toNumber(c.ordersCount),
        toNumber(c.lifetimeValue),
        toNumber(c.averageOrderValue),
        formatDate(c.lastOrderDate),
        c.rfmScore || ''
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* Le bouton n'ouvrait qu'un `alert()` disant que les clientes se creent
     toutes seules. C'est vrai pour une vente en ligne, mais pas pour un compte
     d'equipe ni pour une cliente inscrite a la main — et il n'existait alors
     aucun autre endroit pour le faire. */
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'USER' })

  const handleAddCustomer = () => { setAddErr(''); setShowAdd(true) }

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true); setAddErr('')
    try {
      const res = await fetch('/api/ops/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setAddErr(d.error || 'Échec de la création'); return }
      setShowAdd(false)
      setForm({ name: '', email: '', phone: '', password: '', role: 'USER' })
      fetchCustomers()
    } catch {
      setAddErr('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const toNumber = (value: unknown) => {
    const number = typeof value === 'number' ? value : Number(value ?? 0)
    return Number.isFinite(number) ? number : 0
  }

  const getSegmentLabel = (segment: string | null | undefined) => {
    return segment?.trim() || 'Unsegmented'
  }

  const getTierLabel = (tier: string | null | undefined) => {
    return tier?.trim() || 'No tier'
  }

  // French labels for display only — matching/colors stay on the raw DB values.
  const segFr = (s: string) => (({ VIP: 'VIP', Regular: 'Régulière', 'At Risk': 'À risque', New: 'Nouvelle', Churned: 'Perdue', Unsegmented: 'Non segmentée' } as Record<string, string>)[s] || s)
  const tierFr = (t: string) => (({ Platinum: 'Platine', Gold: 'Or', Silver: 'Argent', Bronze: 'Bronze', 'No tier': 'Sans niveau' } as Record<string, string>)[t] || t)

  const getSegmentColor = (segment: string | null | undefined) => {
    const colors: Record<string, string> = {
      'VIP': 'badge green',
      'Regular': 'badge blue',
      'At Risk': 'badge amber',
      'New': 'badge violet',
      'Churned': 'badge red',
    }
    return colors[getSegmentLabel(segment)] || 'badge'
  }

  const getTierColor = (tier: string | null | undefined) => {
    const colors: Record<string, string> = {
      'Platinum': 'badge violet',
      'Gold': 'badge amber',
      'Silver': 'badge gray',
      'Bronze': 'badge',
    }
    return colors[getTierLabel(tier)] || 'badge'
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Jamais'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'Jamais'
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatCurrency = (amount: unknown) => {
    return new Intl.NumberFormat('fr-MA', { style: 'decimal', maximumFractionDigits: 0 }).format(toNumber(amount))
  }

  const avgLifetimeValue = customers.length
    ? customers.reduce((sum, customer) => sum + toNumber(customer.lifetimeValue), 0) / customers.length
    : 0
  const vipCustomers = customers.filter((customer) => getSegmentLabel(customer.segment) === 'VIP').length
  const atRiskCustomers = customers.filter((customer) => getSegmentLabel(customer.segment) === 'At Risk').length

  return (
    <BosShell active="customers" title="Clientes" crumb="Croissance">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <div>
            <h1 className="serif-display">Clientes</h1>
            <div className="sub">Relation client & segmentation</div>
          </div>
          <div className="spacer"></div>
          <button className="btn-modern btn-secondary" onClick={handleBackfill} disabled={linking} title="Lier les commandes guests (sans fiche) à une cliente">
            <UserPlus className="w-4 h-4" />{linking ? 'Liaison…' : 'Lier les guests'}
          </button>
          <button className="btn-modern btn-secondary" onClick={handleExport}><Download className="w-4 h-4" />Exporter</button>
          <button className="btn-modern btn-primary" onClick={handleAddCustomer}><UserPlus className="w-4 h-4" />Ajouter</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric icon={<UserPlus />} tone="blue" title="Total clientes" value={customers.length.toString()} />
          <Metric icon={<DollarSign />} tone="green" title="LTV moyenne" value={`${formatCurrency(avgLifetimeValue)} MAD`} />
          <Metric icon={<TrendingUp />} tone="teal" title="Clientes VIP" value={vipCustomers.toString()} trend={`${((vipCustomers / (customers.length || 1)) * 100).toFixed(1)}%`} />
          <Metric icon={<Clock />} tone="amber" title="À risque" value={atRiskCustomers.toString()} trend="À surveiller" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="search-box" style={{ minWidth: 280 }}>
            <Search />
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
            <button
              className={`btn-modern btn-sm ${segmentFilter === '' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setSegmentFilter('')}
            >
              Tous
            </button>
            <button
              className={`btn-modern btn-sm ${segmentFilter === 'VIP' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setSegmentFilter('VIP')}
            >
              VIP
            </button>
            <button
              className={`btn-modern btn-sm ${segmentFilter === 'Regular' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setSegmentFilter('Regular')}
            >
              Régulière
            </button>
            <button
              className={`btn-modern btn-sm ${segmentFilter === 'At Risk' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setSegmentFilter('At Risk')}
            >
              À risque
            </button>
            <button
              className={`btn-modern btn-sm ${segmentFilter === 'New' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setSegmentFilter('New')}
            >
              Nouvelle
            </button>
          </div>

          <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
            <button
              className={`btn-modern btn-sm ${tierFilter === '' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setTierFilter('')}
            >
              Tous niveaux
            </button>
            <button
              className={`btn-modern btn-sm ${tierFilter === 'Platinum' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setTierFilter('Platinum')}
            >
              Platine
            </button>
            <button
              className={`btn-modern btn-sm ${tierFilter === 'Gold' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setTierFilter('Gold')}
            >
              Or
            </button>
            <button
              className={`btn-modern btn-sm ${tierFilter === 'Silver' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setTierFilter('Silver')}
            >
              Argent
            </button>
          </div>
        </div>

        {/* Customer Table */}
        <div className="card-modern">
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Segment</th>
                  <th>Niveau</th>
                  <th className="r">Commandes</th>
                  <th className="r">LTV</th>
                  <th className="r">Panier moyen</th>
                  <th>Dernière commande</th>
                  <th>RFM</th>
                  <th className="r">Risque de perte</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      Chargement…
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      Aucune cliente
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} onClick={() => window.location.href = `/customers/${customer.id}`} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="t-strong">{customer.name || 'Sans nom'}</div>
                        <div className="fs11 tx-lo">{customer.email || customer.phone || 'Aucun contact'}</div>
                      </td>
                      <td>
                        <span className={getSegmentColor(customer.segment)}>
                          {segFr(getSegmentLabel(customer.segment))}
                        </span>
                      </td>
                      <td>
                        <span className={getTierColor(customer.tier)}>
                          {tierFr(getTierLabel(customer.tier))}
                        </span>
                      </td>
                      <td className="r num">{toNumber(customer.ordersCount)}</td>
                      <td className="r num pos">{formatCurrency(customer.lifetimeValue)} MAD</td>
                      <td className="r num">{formatCurrency(customer.averageOrderValue)} MAD</td>
                      <td>
                        <span className="fs12 tx-lo">
                          {formatDate(customer.lastOrderDate)}
                          {toNumber(customer.daysSinceLastOrder) > 0 && (
                            <span className="tx-lo"> ({toNumber(customer.daysSinceLastOrder)}j)</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="mono fs12 fw600">{customer.rfmScore || '---'}</span>
                      </td>
                      <td className="r">
                        {toNumber(customer.churnRisk) > 0 ? (
                          <span className={`num ${toNumber(customer.churnRisk) >= 70 ? 'neg' : toNumber(customer.churnRisk) >= 40 ? 'tx-lo' : ''}`}>
                            {toNumber(customer.churnRisk)}%
                          </span>
                        ) : (
                          <span className="tx-lo">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAdd && (
        <div
          onClick={() => !saving && setShowAdd(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 60 }}
        >
          {/* `stopPropagation` : sans lui, un clic DANS le formulaire remonte au
              fond et referme la fenetre en pleine saisie. */}
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAdd}
            style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 22, width: '100%', maxWidth: 430, boxShadow: 'var(--shadow-2)' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', margin: '0 0 4px' }}>Nouveau compte</h2>
            <p style={{ fontSize: 12, color: 'var(--tx-lo)', margin: '0 0 16px' }}>
              Une cliente qui commande en ligne est créée automatiquement. Ceci sert aux inscriptions à la main et aux comptes d’équipe.
            </p>

            {[
              { cle: 'name', label: 'Nom', type: 'text', requis: true, ph: 'Nom complet' },
              { cle: 'email', label: 'E-mail', type: 'email', requis: true, ph: 'nom@exemple.com' },
              { cle: 'phone', label: 'Téléphone', type: 'tel', requis: false, ph: '06…' },
              { cle: 'password', label: 'Mot de passe', type: 'password', requis: true, ph: '6 caractères minimum' },
            ].map((ch) => (
              <div key={ch.cle} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx-mid)', marginBottom: 5 }}>
                  {ch.label}{ch.requis && <span style={{ color: 'var(--rose-bright)' }}> *</span>}
                </label>
                <input
                  className="form-input"
                  type={ch.type}
                  required={ch.requis}
                  placeholder={ch.ph}
                  value={form[ch.cle as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [ch.cle]: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--tx-mid)', marginBottom: 5 }}>Rôle</label>
              <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ width: '100%' }}>
                <option value="USER">Cliente</option>
                <option value="ADMIN">Administrateur — accès à /admin sur la boutique</option>
              </select>
            </div>

            {addErr && <p style={{ fontSize: 12, color: 'var(--rose-bright)', fontWeight: 600, marginBottom: 12 }}>{addErr}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-modern btn-sm btn-secondary" disabled={saving} onClick={() => setShowAdd(false)}>
                Annuler
              </button>
              <button type="submit" className="btn-modern btn-sm btn-primary" disabled={saving}>
                {saving ? 'Création…' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </BosShell>
  )
}

function Metric({ icon, tone, title, value, trend }: { icon: React.ReactNode; tone: string; title: string; value: string; trend?: string }) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    teal: 'bg-teal-100',
    amber: 'bg-amber-100',
  }
  const textColors: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    teal: 'text-teal-600',
    amber: 'text-amber-600',
  }

  return (
    <div className="card-modern">
      <div className="card-body">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-tx-lo uppercase tracking-wide">{title}</p>
          <div className={`w-10 h-10 rounded-lg ${bgColors[tone]} ${textColors[tone]} flex items-center justify-center`}>
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <p className="text-2xl font-bold text-tx-hi">{value}</p>
        </div>

        {trend && <p className="text-xs text-tx-faint">{trend}</p>}
      </div>
    </div>
  )
}
