import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { color, font, radius } from '../lib/theme'
import type { ReactNode } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import logo from '../assets/logo-white.png'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/clients', label: 'Clients', icon: '🏢' },
  { to: '/advertisements', label: 'Advertisements', icon: '📢' },
  { to: '/config-updates', label: 'Config Updates', icon: '⚙️' },
  { to: '/version-management', label: 'Client Upgrades', icon: '📦' },
  { to: '/cc-upgrade', label: 'CC Upgrade', icon: '🚀' },
  { to: '/system-mail', label: 'System Mail', icon: '📧' },
  { to: '/staff', label: 'Staff', icon: '👤' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const loc = useLocation()
  // On a phone the sidebar is a slide-in drawer behind a Menu button
  // (Dennis, 2026-09-25: on mobile Safari it took over half the screen).
  const mobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setMenuOpen(false), [loc.pathname, mobile])

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: font.sans }}>
      {mobile && (
        <header
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 150,
            display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
            background: color.sidebarBg, color: '#fff',
          }}
        >
          <button
            type="button"
            className="btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'transparent', color: '#fff', border: `1px solid ${color.sidebarBorder}`,
              borderRadius: radius.sm, padding: '7px 12px', fontSize: 15, fontFamily: font.sans, cursor: 'pointer',
            }}
          >
            ☰ Menu
          </button>
          <img src={logo} alt="WebMaster Consultancy" style={{ height: 26, display: 'block' }} />
        </header>
      )}
      {mobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,21,.45)', zIndex: 190 }} />
      )}

      {/* Sidebar */}
      <nav
        style={{
          width: 232,
          background: color.sidebarBg,
          color: color.sidebarText,
          padding: '22px 0 16px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          ...(mobile
            ? {
                position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 200, overflowY: 'auto',
                transform: menuOpen ? 'none' : 'translateX(-100%)', transition: 'transform .2s ease',
                boxShadow: menuOpen ? '0 0 24px rgba(0,0,0,.35)' : 'none',
              }
            : {}),
        }}
      >
        <div style={{ padding: '0 20px 18px', borderBottom: `1px solid ${color.sidebarBorder}` }}>
          <img src={logo} alt="WebMaster Consultancy" style={{ width: 150, display: 'block' }} />
          <p style={{ fontSize: 11, margin: '8px 0 0', color: color.sidebarText, fontWeight: 600, letterSpacing: '.02em', textTransform: 'uppercase' }}>
            Central Command
          </p>
        </div>

        <div style={{ flex: 1, padding: '14px 12px' }}>
          {NAV.map((n) => {
            const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)
            return (
              <Link
                key={n.to}
                to={n.to}
                className="nav-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  marginBottom: 2,
                  color: active ? color.sidebarTextActive : color.sidebarText,
                  background: active ? color.brand : 'transparent',
                  textDecoration: 'none',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 500,
                  borderRadius: radius.sm,
                  transition: 'background-color .12s ease, color .12s ease',
                }}
              >
                <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{n.icon}</span>
                {n.label}
              </Link>
            )
          })}
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${color.sidebarBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: radius.pill,
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <p style={{ margin: 0, color: '#e4e5ee', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name}
            </p>
          </div>
          <button
            onClick={logout}
            className="btn"
            style={{
              width: '100%',
              background: 'transparent',
              border: `1px solid ${color.sidebarBorder}`,
              color: color.sidebarText,
              padding: '6px 10px',
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: font.sans,
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main
        className="cc-main"
        style={{
          flex: 1, minWidth: 0, background: color.page, overflow: 'auto',
          padding: mobile ? '68px 14px 24px' : '28px 36px',
        }}
      >
        {children}
      </main>
    </div>
  )
}
