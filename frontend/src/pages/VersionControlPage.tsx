import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ERPVersion, ClientVersionInfo, UpgradeLog } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, badgeSolid, button, card, color, dismissButton, font, h1, input, label, pageHeader, tabPill, table, td, th, type Tone } from '../lib/theme'

type Tab = 'versions' | 'clients' | 'logs'

const VERSION_STATUS_TONE: Record<string, Tone> = { released: 'success', deprecated: 'danger', draft: 'neutral' }

export default function VersionControlPage() {
  const [versions, setVersions] = useState<ERPVersion[]>([])
  const [clientVersions, setClientVersions] = useState<ClientVersionInfo[]>([])
  const [upgradeLogs, setUpgradeLogs] = useState<UpgradeLog[]>([])
  const [tab, setTab] = useState<Tab>('clients')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ version_number: '', migration_head: '', release_notes: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = async () => {
    const [v, cv, ul] = await Promise.all([
      api.listVersions(),
      api.getClientVersions(),
      api.getUpgradeLogs(),
    ])
    setVersions(v)
    setClientVersions(cv)
    setUpgradeLogs(ul)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.version_number || !form.migration_head) return
    setBusy(true)
    try {
      await api.createVersion({
        version_number: form.version_number,
        migration_head: form.migration_head,
        release_notes: form.release_notes || undefined,
      })
      setShowCreate(false)
      setForm({ version_number: '', migration_head: '', release_notes: '' })
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }

  const handleRelease = async (v: ERPVersion) => {
    if (!confirm(`Release v${v.version_number} and mark as latest?`)) return
    await api.updateVersion(v.id, { status: 'released', is_latest: true })
    load()
  }

  const handleUpgrade = async (cv: ClientVersionInfo) => {
    const latest = versions.find(v => v.is_latest && v.status === 'released')
    if (!latest) { setMsg('No latest version to upgrade to'); return }
    if (!confirm(`Upgrade ${cv.client_code} to v${latest.version_number}?`)) return
    setBusy(true)
    try {
      await api.upgradeClient(cv.client_id, latest.id)
      setMsg(`${cv.client_code} upgraded to v${latest.version_number}`)
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>🔄 Version Control</h1>
        <button onClick={() => setShowCreate(true)} className="btn" style={button('primary')}>+ New Version</button>
      </div>

      {msg && (
        <div style={alert('warning')}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={dismissButton()}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setTab('clients')} className="btn" style={tabPill(tab === 'clients')}>📊 Client Versions</button>
        <button onClick={() => setTab('versions')} className="btn" style={tabPill(tab === 'versions')}>📦 Version Registry</button>
        <button onClick={() => setTab('logs')} className="btn" style={tabPill(tab === 'logs')}>📋 Upgrade History</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: color.ink }}>Register New ERP Version</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label()}>Version number</label>
              <input placeholder="e.g. 1.2.0" value={form.version_number} onChange={e => setForm({ ...form, version_number: e.target.value })} style={input()} />
            </div>
            <div>
              <label style={label()}>Migration head</label>
              <input placeholder="e.g. 2026_09_30_000100_create_system_mail_settings_table" value={form.migration_head} onChange={e => setForm({ ...form, migration_head: e.target.value })} style={{ ...input(), fontFamily: font.mono }} />
            </div>
          </div>
          <label style={label()}>Release notes (optional)</label>
          <textarea placeholder="What changed in this release…" value={form.release_notes} onChange={e => setForm({ ...form, release_notes: e.target.value })} rows={3} style={{ ...input(), resize: 'vertical' }} />
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={busy} className="btn" style={button('primary')}>Create</button>
            <button onClick={() => setShowCreate(false)} className="btn" style={button('secondary')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Client Versions Tab */}
      {tab === 'clients' && (
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Client</th>
                <th style={th()}>Current Version</th>
                <th style={th()}>Migration Head</th>
                <th style={th()}>Latest</th>
                <th style={th()}>Status</th>
                <th style={th()}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clientVersions.map(cv => (
                <tr key={cv.client_id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td()}>
                    <strong style={{ color: color.brand }}>{cv.client_code}</strong>
                    <span style={{ color: color.textMuted, marginLeft: 8, fontSize: 12 }}>{cv.client_name}</span>
                  </td>
                  <td style={td({ fontWeight: 600 })}>{cv.current_version || '—'}</td>
                  <td style={td({ fontFamily: font.mono, fontSize: 11, color: color.textMuted })}>{cv.current_migration_head || '—'}</td>
                  <td style={td()}>{cv.latest_version || '—'}</td>
                  <td style={td()}>
                    <span style={badge(cv.is_up_to_date ? 'success' : 'warning')}>{cv.is_up_to_date ? 'Up to date' : 'Update available'}</span>
                  </td>
                  <td style={td()}>
                    {!cv.is_up_to_date && cv.status === 'active' && (
                      <button onClick={() => handleUpgrade(cv)} disabled={busy} className="btn" style={button('success', 'sm')}>⬆ Upgrade</button>
                    )}
                  </td>
                </tr>
              ))}
              {clientVersions.length === 0 && (
                <tr><td colSpan={6} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No clients registered</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Version Registry Tab */}
      {tab === 'versions' && (
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Version</th>
                <th style={th()}>Migration Head</th>
                <th style={th()}>Status</th>
                <th style={th()}>Released</th>
                <th style={th()}>Notes</th>
                <th style={th()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td({ fontWeight: 700 })}>
                    v{v.version_number}
                    {v.is_latest && <span style={{ ...badgeSolid('info'), marginLeft: 8 }}>LATEST</span>}
                  </td>
                  <td style={td({ fontFamily: font.mono, fontSize: 11, color: color.textMuted })}>{v.migration_head}</td>
                  <td style={td()}>
                    <span style={badge(VERSION_STATUS_TONE[v.status] ?? 'neutral')}>{v.status}</span>
                  </td>
                  <td style={td({ color: color.textMuted })}>{formatDateTime(v.released_at)}</td>
                  <td style={td({ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{v.release_notes || '—'}</td>
                  <td style={td()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {v.status === 'draft' && (
                        <button onClick={() => handleRelease(v)} className="btn" style={button('success', 'sm')}>Release</button>
                      )}
                      <button onClick={async () => { if (confirm('Delete this version?')) { await api.deleteVersion(v.id); load() } }} className="btn" style={button('danger', 'sm')}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {versions.length === 0 && (
                <tr><td colSpan={6} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No versions registered yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upgrade Logs Tab */}
      {tab === 'logs' && (
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Client</th>
                <th style={th()}>From</th>
                <th style={th()}>To</th>
                <th style={th()}>Status</th>
                <th style={th()}>Time</th>
              </tr>
            </thead>
            <tbody>
              {upgradeLogs.map(l => (
                <tr key={l.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td({ fontWeight: 500 })}>{l.client_id.slice(0, 8)}…</td>
                  <td style={td({ fontFamily: font.mono, fontSize: 11 })}>{l.from_version || '—'}</td>
                  <td style={td({ fontWeight: 600 })}>v{l.to_version}</td>
                  <td style={td({ color: l.success ? color.success : color.danger })}>{l.success ? '✓ OK' : '✗ Failed'}</td>
                  <td style={td({ color: color.textMuted })}>{formatDateTime(l.upgraded_at)}</td>
                </tr>
              ))}
              {upgradeLogs.length === 0 && (
                <tr><td colSpan={5} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No upgrades yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
