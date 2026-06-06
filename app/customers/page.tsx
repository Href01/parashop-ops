'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Search, Filter, Download, UserPlus, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react'

type Customer = {
  id: number
  name: string
  email: string
  phone: string
  segment: string
  tier: string
  ordersCount: number
  lifetimeValue: number
  averageOrderValue: number
  lastOrderDate: string
  daysSinceLastOrder: number
  rfmScore: string
  churnRisk: number
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

  const handleExport = () => {
    const csv = [
      ['Name', 'Email', 'Phone', 'Segment', 'Tier', 'Orders', 'LTV (MAD)', 'Avg Order (MAD)', 'Last Order', 'RFM Score'],
      ...customers.map(c => [
        c.name,
        c.email,
        c.phone,
        c.segment,
        c.tier,
        c.ordersCount,
        c.lifetimeValue,
        c.averageOrderValue,
        formatDate(c.lastOrderDate),
        c.rfmScore
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
    alert('Customer creation feature coming soon!\n\nCustomers are automatically created when they place their first order.')
  }

  const getSegmentColor = (segment: string) => {
    const colors: Record<string, string> = {
      'VIP': 'badge green',
      'Regular': 'badge blue',
      'At Risk': 'badge amber',
      'New': 'badge violet',
      'Churned': 'badge red',
    }
    return colors[segment] || 'badge'
  }

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      'Platinum': 'badge violet',
      'Gold': 'badge amber',
      'Silver': 'badge gray',
      'Bronze': 'badge',
    }
    return colors[tier] || 'badge'
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-MA', { style: 'decimal', maximumFractionDigits: 0 }).format(amount)
  }

  return (
    <BosShell active="customers" title="Customers" crumb="Growth">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <div>
            <h1>Customers</h1>
            <div className="sub">Customer relationship management & segmentation</div>
          </div>
          <div className="spacer"></div>
          <button className="btn" onClick={handleExport}><Download />Export</button>
          <button className="btn primary" onClick={handleAddCustomer}><UserPlus />Add customer</button>
        </div>

        {/* Stats */}
        <div className="cstat-row">
          <Metric icon={<UserPlus />} tone="blue" title="Total customers" value={customers.length.toString()} trend="+12 this week" />
          <Metric icon={<DollarSign />} tone="green" title="Avg LTV" value={`${formatCurrency(customers.reduce((sum, c) => sum + c.lifetimeValue, 0) / (customers.length || 1))} MAD`} />
          <Metric icon={<TrendingUp />} tone="teal" title="VIP customers" value={customers.filter(c => c.segment === 'VIP').length.toString()} trend={`${((customers.filter(c => c.segment === 'VIP').length / (customers.length || 1)) * 100).toFixed(1)}%`} />
          <Metric icon={<Clock />} tone="amber" title="At risk" value={customers.filter(c => c.segment === 'At Risk').length.toString()} trend="Need attention" />
        </div>

        {/* Filters */}
        <div className="row gap12 mb20">
          <div className="search-box">
            <Search />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="seg">
            <button
              className={segmentFilter === '' ? 'active' : ''}
              onClick={() => setSegmentFilter('')}
            >
              All
            </button>
            <button
              className={segmentFilter === 'VIP' ? 'active' : ''}
              onClick={() => setSegmentFilter('VIP')}
            >
              VIP
            </button>
            <button
              className={segmentFilter === 'Regular' ? 'active' : ''}
              onClick={() => setSegmentFilter('Regular')}
            >
              Regular
            </button>
            <button
              className={segmentFilter === 'At Risk' ? 'active' : ''}
              onClick={() => setSegmentFilter('At Risk')}
            >
              At Risk
            </button>
            <button
              className={segmentFilter === 'New' ? 'active' : ''}
              onClick={() => setSegmentFilter('New')}
            >
              New
            </button>
          </div>

          <div className="seg">
            <button
              className={tierFilter === '' ? 'active' : ''}
              onClick={() => setTierFilter('')}
            >
              All Tiers
            </button>
            <button
              className={tierFilter === 'Platinum' ? 'active' : ''}
              onClick={() => setTierFilter('Platinum')}
            >
              Platinum
            </button>
            <button
              className={tierFilter === 'Gold' ? 'active' : ''}
              onClick={() => setTierFilter('Gold')}
            >
              Gold
            </button>
            <button
              className={tierFilter === 'Silver' ? 'active' : ''}
              onClick={() => setTierFilter('Silver')}
            >
              Silver
            </button>
          </div>
        </div>

        {/* Customer Table */}
        <div className="panel">
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Segment</th>
                  <th>Tier</th>
                  <th className="r">Orders</th>
                  <th className="r">LTV</th>
                  <th className="r">Avg Order</th>
                  <th>Last Order</th>
                  <th>RFM</th>
                  <th className="r">Churn Risk</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      Loading customers...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      No customers found
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} onClick={() => window.location.href = `/customers/${customer.id}`} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="t-strong">{customer.name}</div>
                        <div className="fs11 tx-lo">{customer.email}</div>
                      </td>
                      <td>
                        <span className={getSegmentColor(customer.segment)}>
                          {customer.segment}
                        </span>
                      </td>
                      <td>
                        <span className={getTierColor(customer.tier)}>
                          {customer.tier}
                        </span>
                      </td>
                      <td className="r num">{customer.ordersCount}</td>
                      <td className="r num pos">{formatCurrency(customer.lifetimeValue)} MAD</td>
                      <td className="r num">{formatCurrency(customer.averageOrderValue)} MAD</td>
                      <td>
                        <span className="fs12 tx-lo">
                          {formatDate(customer.lastOrderDate)}
                          {customer.daysSinceLastOrder > 0 && (
                            <span className="tx-lo"> ({customer.daysSinceLastOrder}d ago)</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="mono fs12 fw600">{customer.rfmScore || '---'}</span>
                      </td>
                      <td className="r">
                        {customer.churnRisk > 0 ? (
                          <span className={`num ${customer.churnRisk >= 70 ? 'neg' : customer.churnRisk >= 40 ? 'tx-lo' : ''}`}>
                            {customer.churnRisk}%
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
  return (
    <div className="cstat">
      <div className={`cstat-icon ${tone}`}>{icon}</div>
      <div className="cstat-main">
        <div className="cstat-title">{title}</div>
        <div className="cstat-value">{value}</div>
        {trend && <div className="cstat-trend">{trend}</div>}
      </div>
    </div>
  )
}
