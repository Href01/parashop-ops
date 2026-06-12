'use client'

import { useState } from 'react'
import { ArrowLeft, Megaphone, Plus } from 'lucide-react'
import BosShell from '@/components/BosShell'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('Meta Ads')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [objective, setObjective] = useState('Sales')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    if (!name || !startDate || !endDate) {
      alert('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/ops/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: [description, `Platform: ${platform}`, `Objective: ${objective}`].filter(Boolean).join('\n\n'),
          startDate,
          endDate,
          budgetTotal: budget ? parseFloat(budget) : null,
          budgetAdSpend: budget ? parseFloat(budget) : null,
          status: 'Active',
        }),
      })

      if (!res.ok) throw new Error('Failed to create campaign')

      const data = await res.json()
      window.location.href = `/campaigns/${data.id || data.campaign?.id}`
    } catch (error) {
      console.error('Failed to create campaign:', error)
      alert('Failed to create campaign. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BosShell active="campaigns" title="New Campaign" crumb="Growth">
      <div className="page-inner">
        <div className="page-head">
          <button className="btn ghost" onClick={() => window.history.back()}>
            <ArrowLeft />
            Back
          </button>
          <div>
            <h1>Create Campaign</h1>
            <div className="sub">Track ads, influencers & real P&L with margins and costs</div>
          </div>
        </div>

        <div className="panel" style={{ maxWidth: 800 }}>
          <div className="panel-head">
            <Megaphone />
            <h3>Campaign details</h3>
          </div>
          <form onSubmit={handleSubmit} className="panel-pad" style={{ padding: 24 }}>
            <div className="form-grid">
              {/* Campaign Name */}
              <div className="form-field">
                <label className="form-label">Campaign name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Summer Sale Meta Ads, Influencer @nour.beauty"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* Platform */}
              <div className="form-field">
                <label className="form-label">Platform / Channel *</label>
                <select
                  className="form-input"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  required
                >
                  <option value="Meta Ads">Meta Ads (Facebook + Instagram)</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok Ads">TikTok Ads</option>
                  <option value="Snapchat Ads">Snapchat Ads</option>
                  <option value="Influencer">Influencer Marketing</option>
                  <option value="Content Creation">Content Creation</option>
                  <option value="Photography">Photography / Production</option>
                  <option value="Email">Email Marketing</option>
                  <option value="WhatsApp">WhatsApp Broadcast</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Objective */}
              <div className="form-field">
                <label className="form-label">Campaign objective *</label>
                <select
                  className="form-input"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  required
                >
                  <option value="Sales">Sales / Conversions</option>
                  <option value="Traffic">Traffic / Website Visits</option>
                  <option value="Awareness">Brand Awareness</option>
                  <option value="Engagement">Engagement / Interactions</option>
                  <option value="Leads">Lead Generation</option>
                </select>
              </div>

              {/* Budget */}
              <div className="form-field">
                <label className="form-label">Budget (MAD) - optional</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g., 5000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Start Date */}
              <div className="form-field">
                <label className="form-label">Start date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              {/* End Date */}
              <div className="form-field">
                <label className="form-label">End date *</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Description / Notes (optional)</label>
                <textarea
                  className="form-input"
                  placeholder="Campaign strategy, target audience, creative notes..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* UTM Info */}
              <div className="form-field" style={{ gridColumn: '1 / -1', background: 'var(--bg-soft)', padding: 16, borderRadius: 8 }}>
                <div className="fs12 fw600 mb8">📊 Track this campaign in orders</div>
                <div className="fs12 tx-mid">
                  Add UTM parameters to your campaign links to automatically attribute orders:
                  <div className="mono fs11 tx-lo mt8" style={{ background: 'var(--bg-2)', padding: 8, borderRadius: 4 }}>
                    ?utm_source={platform.toLowerCase().replace(' ', '_')}&utm_campaign={name.toLowerCase().replace(/\s+/g, '_')}
                  </div>
                  Orders with matching UTM will appear in this campaign's dashboard.
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => window.history.back()}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Plus />
                {saving ? 'Creating...' : 'Create campaign'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </BosShell>
  )
}
