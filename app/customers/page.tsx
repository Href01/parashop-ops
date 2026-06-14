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

  const handleAddCustomer = () => {
    alert('Les clientes sont créées automatiquement lors de leur première commande.')
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
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
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

          <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
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
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{title}</p>
          <div className={`w-10 h-10 rounded-lg ${bgColors[tone]} ${textColors[tone]} flex items-center justify-center`}>
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>

        {trend && <p className="text-xs text-gray-500">{trend}</p>}
      </div>
    </div>
  )
}
