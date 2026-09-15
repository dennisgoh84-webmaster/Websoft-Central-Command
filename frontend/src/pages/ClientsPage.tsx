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
  const [sameServer, setSameServer] = useState(false)
  const [error, setError] = useState('')

  // "Same server" only fills in what's actually inferable without credentials:
  // a Postgres password can never be detected (Postgres only stores a
  // one-way hash of it, by design), and each co-located client normally
  // publishes its own Postgres on its own host port, not a shared one —
  // so Name/Username/Password stay manual, and Port is a starting guess,
  // not a fact. See the inline hint rendered below.
  function toggleSameServer(checked: boolean) {
    setSameServer(checked)
    if (checked) {
      setForm((f) => ({ ...f, db_host: 'localhost', db_port: f.db_port || 5432, db_use_tls: false }))
    }
  }

  const refresh = () => api.listClients().then(setClients)
  useEffect(() => { refresh() }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createClient(form)
      setShowForm(false)
      setForm({ name: '', code: '', db_host: '', db_port: 5432, db_name: '', db_username: '', db_password: '', db_use_tls: true })
      setSameServer(false)
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
            <div style={{ gridColumn: '1 / -1', background: color.infoSoft, border: `1px solid ${color.info}22`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="same-server" type="checkbox" checked={sameServer} onChange={(e) => toggleSameServer(e.target.checked)} />
                <label htmlFor="same-server" style={{ fontSize: 13, fontWeight: 600, color: color.info, fontFamily: font.sans, cursor: 'pointer' }}>
                  🖥️ This client's instance runs on this same server
                </label>
              </div>
              <p style={{ margin: '6px 0 0 24px', fontSize: 12, color: color.textMuted, lineHeight: 1.5 }}>
                Fills in Host (<code style={{ fontFamily: font.mono }}>localhost</code>) and a starting Port for you.
                A database password can never be auto-detected — Postgres only ever stores an irreversible hash of
                it, on this server or any other. Get DB Name / Username / Password from that client's own{' '}
                <code style={{ fontFamily: font.mono }}>.env</code> or <code style={{ fontFamily: font.mono }}>docker-compose.yml</code>.
                If more than one client shares this box, each one normally publishes Postgres on its own port
                (e.g. 5433, 5434…) — 5432 is only right if this is the sole instance here.
              </p>
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
              <input value={form.db_name} onChange={(e) => setForm({ ...form, db_name: e.target.value })} required style={input()} placeholder={sameServer ? 'e.g. acme_erp' : undefined} />
            </div>
            <div>
              <label style={label()}>DB Username</label>
              <input value={form.db_username} onChange={(e) => setForm({ ...form, db_username: e.target.value })} required style={input()} placeholder={sameServer ? 'e.g. acme_app' : undefined} />
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
