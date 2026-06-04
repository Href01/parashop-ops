'use client'

import {
  Bell,
  Box,
  Flame,
  LayoutDashboard,
  Megaphone,
  Package,
  PanelLeft,
  Search,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  active?: boolean
  count?: string
  alert?: boolean
}

const sections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', href: '/orders', icon: Package, count: '12', alert: true },
      { label: 'Products', href: '/products', icon: Box },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'Content Hub', href: '/content', icon: Sparkles, count: '3' },
    ],
  },
  {
    label: 'Team',
    items: [{ label: 'Work Hub', href: '/work-hub', icon: Flame, count: '5' }],
  },
]

export default function BosShell({
  active,
  title,
  crumb,
  children,
}: {
  active: 'dashboard' | 'orders' | 'products' | 'campaigns' | 'content' | 'work'
  title: string
  crumb: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`bos-app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo">S</div>
          <div className="sb-brand-text">
            <div className="sb-brand-name">
              Shine <b>BOS</b>
            </div>
            <div className="sb-brand-sub">shinecosmetics.ma</div>
          </div>
        </div>

        <nav className="sb-nav">
          {sections.map((section) => (
            <div key={section.label} className="sb-section">
              <div className="sb-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  active === 'dashboard'
                    ? item.href === '/'
                    : item.href.includes(active === 'work' ? 'work-hub' : active)

                return (
                  <Link key={item.label} href={item.href} className={`sb-item ${isActive ? 'active' : ''}`}>
                    <Icon />
                    <span className="sb-label">{item.label}</span>
                    {item.count ? <span className={`sb-count ${item.alert ? 'alert' : ''}`}>{item.count}</span> : null}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-founders">
            <div className="avatar-stack">
              <div className="avatar a">AM</div>
              <div className="avatar b">MH</div>
            </div>
            <div className="sb-founders-text">
              <div>Founders</div>
              <small>2 online</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button type="button" className="tb-toggle" aria-label="Toggle sidebar" onClick={() => setCollapsed((value) => !value)}>
            <PanelLeft />
          </button>
          <div className="tb-title">{title}</div>
          <span className="tb-crumb">
            <b>{crumb}</b>
          </span>
          <button type="button" className="tb-search">
            <Search />
            <span>Search orders, products...</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <div className="tb-live">
            <span className="pulse"></span>
            LIVE
          </div>
          <button type="button" className="tb-icon" aria-label="Notifications">
            <Bell />
            <span className="dot"></span>
          </button>
          <div className="avatar a tb-avatar">AM</div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  )
}
