import { useEffect, useState, type FormEvent } from 'react'
import { api, type ConfigUpdate, type ClientSummary } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label, pageHeader, type Tone } from '../lib/theme'

const STATUS_TONE: Record<string, Tone> = { pushed: 'success', ready: 'info', partial: 'warning', draft: 'neutral' }

export default function ConfigUpdatesPage() {
  const [updates, setUpdates] = useState<ConfigUpdate[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', sql_statement: '' })
  const [error, setError] = useState('')
  const [pushMsg, setPushMsg] = useState('')

  const refresh = () => {
    api.listConfigUpdates().then(setUpdates)
    api.listClients().then(setClients)
  }
  useEffect(() => { refresh() }, [])

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createConfigUpdate(form)
      setShowForm(false)
      setForm({ title: '', description: '', sql_statement: '' })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function markReady(id: string) {
    await api.updateConfigUpdate(id, { status: 'ready' } as Partial<ConfigUpdate>)
    refresh()
  }

  async function pushAll(id: string) {
    setPushMsg('')
    try {
      const res = await api.pushConfigUpdate(id)
      setPushMsg(`Pushed to ${res.successes}/${res.total} clients`)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    }
  }

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>Config Updates</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn" style={button('primary')}>
          {showForm ? 'Cancel' : '+ New Config Update'}
        </button>
      </div>

      {error && (
        <div style={alert('danger')}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={dismissButton()}>✕</button>
        </div>
      )}
      {pushMsg && (
        <div style={alert('success')}>
          <span>{pushMsg}</span>
          <button onClick={() => setPushMsg('')} style={dismissButton()}>✕</button>
        </div>
      )}

      {showForm && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <form onSubmit={onCreate}>
            <div style={{ marginBottom: 14 }}>
              <label style={label()}>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required style={input()} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label()}>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={input()} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={label()}>SQL Statement</label>
              <textarea
                value={form.sql_statement}
                onChange={(e) => setForm({ ...form, sql_statement: e.target.value })}
                required
                rows={5}
                style={{ ...input(), fontFamily: font.mono, fontSize: 12, resize: 'vertical' }}
                placeholder="UPDATE tax_codes SET rate = 0.09 WHERE code = 'SR';"
              />
            </div>
            <button type="submit" className="btn" style={button('primary')}>Create (Draft)</button>
          </form>
        </div>
      )}

      {updates.map((cu) => (
        <div key={cu.id} style={card({ marginBottom: 16, padding: 0, overflow: 'hidden' })}>
          <div style={{ padding: '15px 18px', borderBottom: `1px solid ${color.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: color.ink }}>{cu.title}</h3>
              {cu.description && <p style={{ margin: '3px 0 0', fontSize: 12, color: color.textMuted }}>{cu.description}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={badge(STATUS_TONE[cu.status] ?? 'neutral')}>{cu.status}</span>
              {cu.status === 'draft' && (
                <button onClick={() => markReady(cu.id)} className="btn" style={{ ...button('secondary', 'sm'), background: color.infoSoft, color: color.info }}>
                  Mark Ready
                </button>
              )}
              {(cu.status === 'ready' || cu.status === 'partial') && (
                <button onClick={() => pushAll(cu.id)} className="btn" style={button('success', 'sm')}>
                  Push to All
                </button>
              )}
            </div>
          </div>
          <div style={{ padding: '12px 18px', background: color.page }}>
            <pre style={{ margin: 0, fontSize: 12, fontFamily: font.mono, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: color.text }}>{cu.sql_statement}</pre>
          </div>
          {cu.push_logs.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: `1px solid ${color.border}` }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: color.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>Push History</p>
              {cu.push_logs.map((log) => (
                <div key={log.id} style={{ fontSize: 12, display: 'flex', gap: 10, padding: '3px 0' }}>
                  <span style={{ color: log.success ? color.success : color.danger }}>{log.success ? '✓' : '✗'}</span>
                  <span>{clientName(log.client_id)}</span>
                  <span style={{ color: color.textMuted }}>{formatDateTime(log.pushed_at)}</span>
                  {log.error_message && <span style={{ color: color.danger }}>{log.error_message}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {updates.length === 0 && (
        <p style={{ color: color.textMuted, fontSize: 13 }}>No config updates yet.</p>
      )}
    </div>
  )
}
