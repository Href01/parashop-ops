'use client'

import {
  Bell,
  Box,
  Calendar,
  ChartBar,
  ClipboardCheck,
  Flame,
  LayoutDashboard,
  HelpCircle,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Star,
  Truck,
  Target,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

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
    label: 'Aperçu',
    items: [
      { label: 'Tableau de bord', href: '/', icon: LayoutDashboard },
      { label: 'Focus', href: '/intelligence', icon: Target },
    ],
  },
  {
    label: 'Opérations',
    items: [
      { label: 'Commandes', href: '/orders', icon: Package },
      { label: 'Sendit', href: '/sendit', icon: Truck },
      { label: 'Suivi & Réappro', href: '/fulfillment', icon: ClipboardCheck },
      { label: 'Produits', href: '/products', icon: Box },
      { label: 'Stock', href: '/inventory', icon: Warehouse },
    ],
  },
  {
    label: 'Relation client',
    items: [
      { label: 'Messages', href: '/messages', icon: MessageCircle },
      { label: 'Avis', href: '/avis', icon: Star },
      { label: 'Clients', href: '/customers', icon: Users },
      { label: 'Stats', href: '/stats', icon: ChartBar },
    ],
  },
  {
    label: 'Croissance',
    items: [
      { label: 'Campagnes', href: '/ads', icon: Megaphone },
      { label: 'Événements', href: '/events', icon: Calendar },
      { label: 'Contenu', href: '/content', icon: Sparkles },
    ],
  },
  {
    label: 'Équipe',
    items: [{ label: 'Espace de travail', href: '/work-hub', icon: Flame }],
  },
  {
    label: 'Aide',
    items: [
      { label: 'Guide', href: '/guide', icon: HelpCircle },
      { label: 'Paramètres', href: '/settings', icon: Settings },
    ],
  },
]

export default function BosShell({
  active,
  title,
  crumb,
  children,
}: {
  active: 'dashboard' | 'intelligence' | 'orders' | 'sendit' | 'fulfillment' | 'products' | 'customers' | 'inventory' | 'campaigns' | 'ads' | 'events' | 'content' | 'work' | 'guide' | 'settings'
  title: string
  crumb: string
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // On mobile the sidebar is a slide-in drawer that shows full labels when open.
  const shellCollapsed = isMobile ? false : collapsed || isNarrow
  const showDesktopChrome = !isNarrow

  useEffect(() => {
    const narrowQuery = window.matchMedia('(max-width: 900px)')
    const mobileQuery = window.matchMedia('(max-width: 768px)')
    const updateNarrowState = () => setIsNarrow(narrowQuery.matches)
    const updateMobileState = () => setIsMobile(mobileQuery.matches)

    updateNarrowState()
    updateMobileState()
    narrowQuery.addEventListener('change', updateNarrowState)
    mobileQuery.addEventListener('change', updateMobileState)

    return () => {
      narrowQuery.removeEventListener('change', updateNarrowState)
      mobileQuery.removeEventListener('change', updateMobileState)
    }
  }, [])

  // Lock body scroll while the mobile drawer is open, and close on resize to desktop.
  useEffect(() => {
    if (!isMobile && mobileOpen) setMobileOpen(false)
  }, [isMobile, mobileOpen])

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [mobileOpen])

  return (
    <div className={`bos-app ${shellCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''}`}>
      {/* Backdrop for the mobile drawer */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'oklch(0.2 0.02 350 / 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 45,
          }}
        />
      )}
      <aside style={{
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--line-soft)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...(isMobile
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 'var(--sidebar-w)',
              zIndex: 46,
              transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileOpen ? '0 0 40px oklch(0.2 0.02 350 / 0.25)' : 'none',
            }
          : {
              position: 'sticky',
              top: 0,
              height: '100vh',
            }),
      }}>
        <div style={{
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0 16px',
          borderBottom: '1px solid var(--line-soft)',
          flexShrink: 0
        }}>
          <div className="logo-gradient" style={{
            width: '26px',
            height: '26px',
            borderRadius: '7px',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: '15px'
          }}>
            S
          </div>
          {!shellCollapsed && (
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                Shine <span className="glow-rose" style={{ fontWeight: 700 }}>BOS</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--tx-lo)', fontFamily: 'var(--mono)', letterSpacing: '0.04em', marginTop: '-2px' }}>
                shinecosmetics.ma
              </div>
            </div>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--tx-mid)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              className="hover:bg-[var(--bg-2)]"
            >
              <X style={{ width: '18px', height: '18px', strokeWidth: 1.8 }} />
            </button>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 16px' }}>
          {sections.map((section) => (
            <div key={section.label} style={{ marginTop: '14px' }}>
              {!shellCollapsed && (
                <div style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--tx-faint)',
                  fontWeight: 600,
                  padding: '4px 10px 6px'
                }}>
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  active === 'dashboard'
                    ? item.href === '/'
                    : item.href.includes(active === 'work' ? 'work-hub' : active)

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => isMobile && setMobileOpen(false)}
                    className={isActive ? 'nav-item active' : 'nav-item'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: isMobile ? '11px 10px' : shellCollapsed ? '9px' : '8px 10px',
                      borderRadius: '8px',
                      color: isActive ? 'var(--rose)' : 'var(--tx-mid)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: isMobile ? '14px' : '13px',
                      position: 'relative',
                      whiteSpace: 'nowrap',
                      marginBottom: '2px',
                      justifyContent: shellCollapsed ? 'center' : 'flex-start'
                    }}
                  >
                    <Icon style={{ width: '17px', height: '17px', flexShrink: 0, strokeWidth: 1.7 }} />
                    {!shellCollapsed && (
                      <>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {item.count && (
                          <span style={{
                            fontFamily: 'var(--mono)',
                            fontSize: '11px',
                            background: item.alert ? 'var(--rose-bg)' : 'var(--bg-3)',
                            color: item.alert ? 'var(--rose-bright)' : 'var(--tx-mid)',
                            padding: '1px 7px',
                            borderRadius: '20px'
                          }}>
                            {item.count}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div style={{ borderTop: '1px solid var(--line-soft)', padding: '10px', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'background 0.12s'
          }} className="hover:bg-[var(--bg-2)]">
            {!shellCollapsed && (
              <>
                <div style={{ display: 'flex' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: 'white',
                    background: 'linear-gradient(135deg, var(--rose-bright), oklch(0.6 0.13 350))',
                    border: '2px solid var(--bg-1)',
                    marginLeft: 0
                  }}>AM</div>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: 'white',
                    background: 'linear-gradient(135deg, var(--blue), var(--violet))',
                    border: '2px solid var(--bg-1)',
                    marginLeft: '-8px'
                  }}>MH</div>
                </div>
                <div style={{ fontSize: '12px', lineHeight: 1.3, flex: 1 }}>
                  <div>Founders</div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          height: '56px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: isNarrow ? '8px' : '14px',
          minWidth: 0,
          overflow: 'hidden',
          padding: isNarrow ? '0 10px' : '0 20px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'oklch(1 0 0 / 0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 30
        }}>
          <button
            type="button"
            onClick={() => (isMobile ? setMobileOpen((value) => !value) : setCollapsed((value) => !value))}
            aria-label={isMobile ? 'Ouvrir le menu' : 'Toggle sidebar'}
            style={{
              width: isMobile ? '38px' : '30px',
              height: isMobile ? '38px' : '30px',
              borderRadius: '8px',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--tx-mid)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.12s',
              flexShrink: 0,
            }}
            className="hover:bg-[var(--bg-2)] hover:text-[var(--tx-hi)]"
          >
            {isMobile
              ? <Menu style={{ width: '20px', height: '20px', strokeWidth: 1.8 }} />
              : <PanelLeft style={{ width: '17px', height: '17px', strokeWidth: 1.8 }} />}
          </button>
          <div style={{
            flex: isNarrow ? '1 1 auto' : '0 1 auto',
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: 0,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>{title}</div>
          {showDesktopChrome && (
            <div style={{ color: 'var(--tx-lo)', fontSize: '12px', flexShrink: 0 }}>
              <b style={{ color: 'var(--tx-mid)', fontWeight: 500 }}>{crumb}</b>
            </div>
          )}
          {showDesktopChrome && (
            <button
            type="button"
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-2)',
              border: '1px solid var(--line-soft)',
              borderRadius: '6px',
              padding: '6px 10px',
              width: '260px',
              color: 'var(--tx-lo)',
              fontSize: '12.5px',
              cursor: 'pointer',
              transition: 'border-color 0.12s'
            }}
            className="hover:border-[var(--line)]"
          >
            <Search style={{ width: '15px', height: '15px', strokeWidth: 1.8 }} />
            <span>Search...</span>
            <span style={{
              marginLeft: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: '10px',
              color: 'var(--tx-lo)',
              background: 'var(--bg-3)',
              border: '1px solid var(--line)',
              borderRadius: '4px',
              padding: '1px 5px',
              lineHeight: 1.5
            }}>Ctrl K</span>
            </button>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
            fontSize: '11px',
            color: 'var(--green)',
            fontFamily: 'var(--mono)',
            padding: '4px 9px',
            borderRadius: '20px',
            background: 'var(--green-bg)'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'var(--green)',
              animation: 'pulse 2s infinite'
            }}></span>
            LIVE
          </div>
          <button
            type="button"
            aria-label="Notifications"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--tx-mid)',
              position: 'relative',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.12s'
            }}
            className="hover:bg-[var(--bg-2)] hover:text-[var(--tx-hi)]"
          >
            <Bell style={{ width: '17px', height: '17px', strokeWidth: 1.7 }} />
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto' }} className="page-glow">{children}</div>
      </main>
    </div>
  )
}
