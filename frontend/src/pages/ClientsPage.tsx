import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type ClientSummary } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label, pageHeader, table, td, th, type Tone } from '../lib/theme'

const STATUS_TONE: Record<string, Tone> = { active: 'success', suspended: 'danger', decommissioned: 'neutral' }

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', db_host: '', db_port: 5432, db_name: '', db_username: '', db_password: '', db_use_tls: true })
  const [error, setError] = useState('')

  const refresh = () => api.listClients().then(setClients)
  useEffect(() => { refresh() }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createClient(form)
      setShowForm(false)
      setForm({ name: '', code: '', db_host: '', db_port: 5432, db_name: '', db_username: '', db_password: '', db_use_tls: true })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>Client Instances</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn" style={button('primary')}>
          {showForm ? 'Cancel' : '+ Add Client'}
        </button>
      </div>

      {showForm && (
        <div style={card({ padding: 22, marginBottom: 22 })}>
          {error && (
            <div style={alert('danger')}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={dismissButton()}>✕</button>
            </div>
          )}
          <form onSubmit={onCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={label()}>Client Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={input()} />
            </div>
            <div>
              <label style={label()}>Code</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required style={input()} placeholder="e.g. ACME" />
            </div>
            <div>
              <label style={label()}>DB Host</label>
              <input value={form.db_host} onChange={(e) => setForm({ ...form, db_host: e.target.value })} required style={input()} />
            </div>
            <div>
              <label style={label()}>DB Port</label>
              <input type="number" value={form.db_port} onChange={(e) => setForm({ ...form, db_port: parseInt(e.target.value) })} style={input()} />
            </div>
            <div>
              <label style={label()}>DB Name</label>
              <input value={form.db_name} onChange={(e) => setForm({ ...form, db_name: e.target.value })} required style={input()} />
            </div>
            <div>
              <label style={label()}>DB Username</label>
              <input value={form.db_username} onChange={(e) => setForm({ ...form, db_username: e.target.value })} required style={input()} />
            </div>
            <div>
              <label style={label()}>DB Password</label>
              <input type="password" value={form.db_password} onChange={(e) => setForm({ ...form, db_password: e.target.value })} required style={input()} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" checked={form.db_use_tls} onChange={(e) => setForm({ ...form, db_use_tls: e.target.checked })} />
              <label style={{ fontSize: 13, fontWeight: 500, color: color.text, fontFamily: font.sans }}>Use TLS</label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn" style={button('primary')}>
                Create Client
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>Code</th>
              <th style={th()}>Name</th>
              <th style={th()}>Status</th>
              <th style={th()}>Last Connected</th>
              <th style={th()}>Alembic Head</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                <td style={td()}>
                  <Link to={`/clients/${c.id}`} style={{ color: color.brand, fontWeight: 600, textDecoration: 'none' }}>{c.code}</Link>
                </td>
                <td style={td()}>{c.name}</td>
                <td style={td()}>
                  <span style={badge(STATUS_TONE[c.status] ?? 'neutral')}>{c.status}</span>
                </td>
                <td style={td({ color: color.textMuted })}>
                  {formatDateTime(c.last_connected_at)}
                </td>
                <td style={td({ fontFamily: font.mono, fontSize: 11, color: color.textMuted })}>
                  {c.last_known_alembic_head ?? '—'}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No clients registered yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
