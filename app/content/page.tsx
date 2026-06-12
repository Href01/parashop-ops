'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Calendar, Eye, Package, Play, Plus, ShoppingBag } from 'lucide-react'
import BosShell from '@/components/BosShell'

const columns = [
  { label: 'Ideas', dot: 'var(--tx-lo)', cards: ['Before/after: Glow Serum 4-week results', 'GRWM using Palette Nude Eyes'] },
  { label: 'Scripted', dot: 'var(--amber)', cards: ['5 ways to use Rouge Velours Lip Oil'] },
  { label: 'Filmed', dot: 'var(--blue)', cards: ['Unboxing Summer Glow bundle', 'Customer testimonial - Casablanca'] },
  { label: 'Edited', dot: 'var(--violet)', cards: ['Masque Argile Rose ASMR routine'] },
  { label: 'Scheduled', dot: 'var(--teal)', cards: ['Skincare night routine ft. Hydra Boost', 'Lip Oil restock teaser'] },
  { label: 'Published', dot: 'var(--green)', cards: ['Vitamine C serum viral hook', 'Founder story - why Shine'] },
]

const platforms = [
  { name: 'TikTok', posts: 14, reach: '512k', engagement: '8.2%', orders: 38, format: 'Reel' },
  { name: 'Instagram', posts: 11, reach: '264k', engagement: '5.4%', orders: 19, format: 'Reel' },
  { name: 'Facebook', posts: 3, reach: '66k', engagement: '2.1%', orders: 6, format: 'Post' },
]

const schedule = [
  { day: '5', month: 'JUN', title: 'Skincare night routine', platform: 'Instagram', time: '19:00' },
  { day: '6', month: 'JUN', title: 'Lip Oil restock teaser', platform: 'TikTok', time: '12:00' },
  { day: '7', month: 'JUN', title: 'Weekend bundle promo', platform: 'Facebook', time: '10:00' },
  { day: '9', month: 'JUN', title: 'Masque ASMR routine', platform: 'TikTok', time: '18:30' },
]

export default function ContentPage() {
  const [view, setView] = useState<'Board' | 'Calendar' | 'Table'>('Board')

  const handleNewContent = () => {
    alert('Content creation feature coming soon! Track content planning in your external tools for now.')
  }

  const handleAddCard = (column: string) => {
    alert(`Add content to ${column} - Feature coming soon!`)
  }

  return (
    <BosShell active="content" title="Content Hub" crumb="Growth">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Content Hub</h1>
            <div className="sub">Plan, produce & track content across TikTok, Instagram & Facebook</div>
          </div>
          <div className="spacer"></div>
          <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button className={`btn-modern btn-sm ${view === 'Board' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setView('Board')}>Board</button>
            <button className={`btn-modern btn-sm ${view === 'Calendar' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setView('Calendar')}>Calendar</button>
            <button className={`btn-modern btn-sm ${view === 'Table' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setView('Table')}>Table</button>
          </div>
          <button className="btn-modern btn-primary" onClick={handleNewContent}><Plus className="w-4 h-4" />New content</button>
        </div>

        <div className="cstat-row">
          <ContentStat icon={<Package />} title="In production" value="14" subtitle="3 due this week" tone="rose" />
          <ContentStat icon={<Play />} title="Published - 30D" value="28" subtitle="+6" tone="blue" />
          <ContentStat icon={<Eye />} title="Total reach - 30D" value="842k" subtitle="view-through" tone="teal" />
          <ContentStat icon={<ShoppingBag />} title="Attributed orders" value="63" subtitle="+15.2k MAD" tone="green" />
        </div>

        <div className="kanban">
          {columns.map((column) => (
            <div key={column.label} className="kcol">
              <div className="kcol-head"><span className="kdot" style={{ background: column.dot }}></span><h4>{column.label}</h4><span className="kc">{column.cards.length}</span></div>
              <div className="kcol-body">
                {column.cards.map((card, index) => (
                  <div key={card} className="kcard">
                    <div className="kc-top"><span className="plat-tag">{index % 2 ? 'Instagram' : 'TikTok'}</span><span className="badge mini-badge">Reel</span></div>
                    <div className="kc-title">{card}</div>
                    <div className="kc-foot"><span className={`avatar ${index % 2 ? 'a' : 'b'} small`}>{index % 2 ? 'AM' : 'MH'}</span><span className="mono">{column.label === 'Scheduled' ? '5 Jun - 19:00' : column.label === 'Published' ? '50.2k views' : 'Draft'}</span></div>
                  </div>
                ))}
                <button className="btn ghost sm full add-card" onClick={() => handleAddCard(column.label)}><Plus />Add</button>
              </div>
            </div>
          ))}
        </div>

        <div className="ch-grid">
          <div className="panel">
            <div className="panel-head"><h3>Performance by platform</h3><div className="spacer"></div><span className="hint">30D</span></div>
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>Platform</th><th className="r">Posts</th><th className="r">Reach</th><th className="r">Eng. rate</th><th className="r">Orders</th><th>Top format</th></tr></thead>
                <tbody>
                  {platforms.map((platform) => (
                    <tr key={platform.name}><td><span className="badge">{platform.name}</span></td><td className="r num">{platform.posts}</td><td className="r num">{platform.reach}</td><td className="r num">{platform.engagement}</td><td className="r num pos">{platform.orders}</td><td><span className="badge">{platform.format}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><Calendar className="panel-head-icon" /><h3>Upcoming schedule</h3></div>
            {schedule.map((item) => (
              <div key={item.title} className="alert-item">
                <div className="date-tile"><span className="num fs16 fw600">{item.day}</span><span className="fs11 tx-lo">{item.month}</span></div>
                <div className="alert-body"><div className="at">{item.title}</div><div className="as"><span className="badge mini-badge">{item.platform}</span> <span className="mono">{item.time}</span></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function ContentStat({ icon, title, value, subtitle, tone }: { icon: ReactNode; title: string; value: string; subtitle: string; tone: string }) {
  return (
    <div className="panel kpi"><div className="kpi-top"><div className="kpi-ico" style={{ background: `var(--${tone}-bg)`, color: tone === 'rose' ? 'var(--rose-bright)' : `var(--${tone})` }}>{icon}</div><span className="kpi-title">{title}</span></div><div className="kpi-val"><span>{value}</span></div><div className="kpi-meta"><span className="tx-lo">{subtitle}</span></div></div>
  )
}
