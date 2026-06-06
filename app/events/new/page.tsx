'use client'

import { useState } from 'react'
import { ArrowLeft, Calendar, Plus } from 'lucide-react'
import BosShell from '@/components/BosShell'

export default function NewEventPage() {
  const [name, setName] = useState('')
  const [type, setType] = useState('Ramadan')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name || !startDate || !endDate) {
      alert('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/ops/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          description,
          startDate,
          endDate,
          status: 'Upcoming',
        }),
      })

      if (!res.ok) throw new Error('Failed to create event')

      const data = await res.json()
      window.location.href = `/events/${data.id}`
    } catch (error) {
      console.error('Failed to create event:', error)
      alert('Failed to create event. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BosShell active="events" title="New Event" crumb="Growth">
      <div className="page-inner">
        <div className="page-head">
          <button className="btn ghost" onClick={() => window.history.back()}>
            <ArrowLeft />
            Back
          </button>
          <div>
            <h1>Create Event</h1>
            <div className="sub">Track Ramadan, Black Friday, seasonal events & impact</div>
          </div>
        </div>

        <div className="panel" style={{ maxWidth: 800 }}>
          <div className="panel-head">
            <Calendar />
            <h3>Event details</h3>
          </div>
          <form onSubmit={handleSubmit} className="panel-pad" style={{ padding: 24 }}>
            <div className="form-grid">
              {/* Event Name */}
              <div className="form-field">
                <label className="form-label">Event name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Ramadan 2026, Black Friday, Mother's Day"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* Event Type */}
              <div className="form-field">
                <label className="form-label">Event type *</label>
                <select
                  className="form-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  required
                >
                  <option value="Ramadan">Ramadan</option>
                  <option value="Black Friday">Black Friday</option>
                  <option value="Mother's Day">Mother's Day</option>
                  <option value="Summer Sale">Summer Sale</option>
                  <option value="Flash Sale">Flash Sale</option>
                  <option value="New Year">New Year</option>
                  <option value="Valentine's Day">Valentine's Day</option>
                  <option value="Other">Other</option>
                </select>
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
                <label className="form-label">Description (optional)</label>
                <textarea
                  className="form-input"
                  placeholder="Add notes about this event..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
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
                {saving ? 'Creating...' : 'Create event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </BosShell>
  )
}
