'use client'

import {
  Bell,
  Box,
  Calendar,
  Flame,
  LayoutDashboard,
  Megaphone,
  Package,
  PanelLeft,
  Search,
  Sparkles,
  Users,
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
      { label: 'Inventory', href: '/inventory', icon: Box },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'Events', href: '/events', icon: Calendar },
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
  active: 'dashboard' | 'orders' | 'products' | 'customers' | 'inventory' | 'campaigns' | 'events' | 'content' | 'work'
  title: string
  crumb: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`bos-app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar-modern">
        <div className="sidebar-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              S
            </div>
            <div className="flex flex-col">
              <div className="font-semibold text-gray-900">
                Shine <span className="text-primary-600">BOS</span>
              </div>
              <div className="text-xs text-gray-500">shinecosmetics.ma</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.label} className="nav-section">
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  active === 'dashboard'
                    ? item.href === '/'
                    : item.href.includes(active === 'work' ? 'work-hub' : active)

                return (
                  <Link key={item.label} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                    <Icon className="w-5 h-5" />
                    <span className="flex-1">{item.label}</span>
                    {item.count ? (
                      <span className={`badge-modern badge-sm ${item.alert ? 'badge-danger' : 'badge-neutral'}`}>
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition cursor-pointer">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-medium border-2 border-white">AM</div>
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-medium border-2 border-white">MH</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">Founders</div>
              <div className="text-xs text-gray-500">2 online</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center gap-4 px-6 sticky top-0 z-10">
          <button type="button" className="btn-modern btn-icon btn-subtle" aria-label="Toggle sidebar" onClick={() => setCollapsed((value) => !value)}>
            <PanelLeft className="w-5 h-5" />
          </button>
          <div className="font-semibold text-gray-900">{title}</div>
          <span className="text-sm text-gray-500">
            <b>{crumb}</b>
          </span>
          <button type="button" className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 transition flex-1 max-w-md">
            <Search className="w-4 h-4" />
            <span className="text-sm">Search orders, products...</span>
            <span className="ml-auto text-xs bg-white px-2 py-1 rounded border border-gray-200">Ctrl K</span>
          </button>
          <div className="ml-auto flex items-center gap-2 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            LIVE
          </div>
          <button type="button" className="btn-modern btn-icon btn-subtle relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-medium cursor-pointer hover:ring-2 ring-primary-200 transition">AM</div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  )
}
