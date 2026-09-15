import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { color, font, radius } from '../lib/theme'
import type { ReactNode } from 'react'
import logo from '../assets/logo-white.png'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/clients', label: 'Clients', icon: '🏢' },
  { to: '/advertisements', label: 'Advertisements', icon: '📢' },
  { to: '/config-updates', label: 'Config Updates', icon: '⚙️' },
  { to: '/versions', label: 'Version Control', icon: '🔄' },
  { to: '/system-mail', label: 'System Mail', icon: '📧' },
  { to: '/staff', label: 'Staff', icon: '👤' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const loc = useLocation()

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: font.sans }}>
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
      <main style={{ flex: 1, padding: '28px 36px', background: color.page, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
