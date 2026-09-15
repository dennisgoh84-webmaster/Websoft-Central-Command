import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ClientSummary, type DashboardStats, type PushLogEntry } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { badge, card, color, font, h1, table, td, th, type Tone } from '../lib/theme'

const STAT_CARDS: { key: keyof DashboardStats; label: string; color: string }[] = [
  { key: 'total_clients', label: 'Total Clients', color: color.ink },
  { key: 'active_clients', label: 'Active', color: color.successSolid },
  { key: 'suspended_clients', label: 'Suspended', color: color.dangerSolid },
  { key: 'active_ads', label: 'Active Ads', color: color.infoSolid },
  { key: 'total_config_updates', label: 'Config Updates', color: color.purpleSolid },
  { key: 'pending_pushes', label: 'Pending Pushes', color: color.warningSolid },
]

const PUSH_TYPE_TONE: Record<string, Tone> = {
  advertisement: 'info',
  license: 'warning',
  video: 'purple',
  config: 'brand',
  version: 'success',
  support_login: 'neutral',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [clients, setClients] = useState<ClientSummary[] | null>(null)

  useEffect(() => {
    api.getDashboard().then(setStats)
    api.listClients().then(setClients)
  }, [])

  if (!stats) return <p style={{ color: color.textMuted, fontSize: 13 }}>Loading dashboard…</p>

  const activeClients = (clients ?? []).filter((c) => c.status === 'active')

  return (
    <div>
      <h1 style={{ ...h1(), marginBottom: 22 }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 26 }}>
        {STAT_CARDS.map((s) => (
          <div key={s.key} style={card({ padding: '18px 20px' })}>
            <p style={{ color: color.textMuted, fontSize: 11.5, margin: 0, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>{s.label}</p>
            <p style={{ fontSize: 30, fontWeight: 700, margin: '6px 0 0', color: s.color, letterSpacing: '-0.02em' }}>{stats[s.key] as number}</p>
          </div>
        ))}
      </div>

      <div style={card({ padding: 0, overflow: 'hidden', marginBottom: 26 })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${color.border}` }}>
          <h2 style={{ fontSize: 14.5, margin: 0, fontWeight: 600, color: color.ink }}>
            Active Clients
          </h2>
          <span style={{ fontSize: 12, color: color.textMuted }}>{activeClients.length} of {clients?.length ?? 0} total</span>
        </div>
        {clients === null ? (
          <p style={{ color: color.textMuted, fontSize: 13, padding: '20px' }}>Loading…</p>
        ) : activeClients.length === 0 ? (
          <p style={{ color: color.textMuted, fontSize: 13, padding: '20px' }}>No active clients. <Link to="/clients" style={{ color: color.brand }}>Register one →</Link></p>
        ) : (
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Code</th>
                <th style={th()}>Name</th>
                <th style={th()}>Last Connected</th>
                <th style={th()}>Migration Head</th>
                <th style={th()}>Login Limit</th>
              </tr>
            </thead>
            <tbody>
              {activeClients.map((c) => (
                <tr key={c.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td()}>
                    <Link to={`/clients/${c.id}`} style={{ color: color.brand, fontWeight: 600, textDecoration: 'none' }}>{c.code}</Link>
                  </td>
                  <td style={td()}>{c.name}</td>
                  <td style={td({ color: color.textMuted })}>{formatDateTime(c.last_connected_at)}</td>
                  <td style={td({ fontFamily: font.mono, fontSize: 11, color: color.textMuted })}>{c.last_known_migration_head ?? '—'}</td>
                  <td style={td({ color: color.textMuted })}>{c.max_licenses ?? 'Unlimited'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <h2 style={{ fontSize: 14.5, margin: 0, padding: '16px 20px', borderBottom: `1px solid ${color.border}`, fontWeight: 600, color: color.ink }}>
          Recent Push Activity
        </h2>
        {stats.recent_pushes.length === 0 ? (
          <p style={{ color: color.textMuted, fontSize: 13, padding: '20px' }}>No push activity yet.</p>
        ) : (
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Type</th>
                <th style={th()}>Detail</th>
                <th style={th()}>Status</th>
                <th style={th()}>Time</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_pushes.map((p: PushLogEntry) => (
                <tr key={p.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td()}>
                    <span style={badge(PUSH_TYPE_TONE[p.push_type] ?? 'neutral')}>{p.push_type}</span>
                  </td>
                  <td style={td()}>{p.detail}</td>
                  <td style={td({ color: p.success ? color.success : color.danger, fontWeight: 500 })}>
                    {p.success ? '✓ OK' : '✗ Failed'}
                  </td>
                  <td style={td({ color: color.textMuted })}>{formatDateTime(p.pushed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
