import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type Client, type ClientSummary, type ConnectionTestResult, type ClientModule } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h2, input, label as fieldLabel, radius, tabUnderline, table, td, th, type Tone } from '../lib/theme'

type EditForm = {
  name: string
  db_host: string
  db_port: number
  db_name: string
  db_username: string
  db_password: string
  db_use_tls: boolean
  notes: string
  app_key: string
}

function toEditForm(c: Client): EditForm {
  return {
    name: c.name,
    db_host: c.db_host,
    db_port: c.db_port,
    db_name: c.db_name,
    db_username: c.db_username,
    db_password: '', // never returned by the API — blank means "keep current"
    db_use_tls: c.db_use_tls,
    notes: c.notes ?? '',
    app_key: '', // never returned by the API — blank means "keep current"
  }
}

type Tab = 'details' | 'modules' | 'licenses'

const STATUS_TONE: Record<string, Tone> = { active: 'success', suspended: 'danger', decommissioned: 'neutral' }

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('details')

  // Details edit state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Module state
  const [modules, setModules] = useState<ClientModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [modulesLoaded, setModulesLoaded] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [moduleMsg, setModuleMsg] = useState('')

  // License limit state
  const [editingLimit, setEditingLimit] = useState(false)
  const [limitValue, setLimitValue] = useState('')
  const [savingLimit, setSavingLimit] = useState(false)
  const [licenseMsg, setLicenseMsg] = useState('')

  useEffect(() => {
    if (id) {
      api.getClient(id).then(setClient)
      // Also load summary for max_licenses
      api.listClients().then((clients) => {
        const found = clients.find(c => c.id === id)
        if (found) setClientSummary(found)
      })
    }
  }, [id])

  async function onTest() {
    if (!id) return
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      const res = await api.testConnection(id)
      setTestResult(res)
      api.getClient(id).then(setClient)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  async function onDelete() {
    if (!id || !window.confirm('Delete this client? This cannot be undone.')) return
    await api.deleteClient(id)
    window.location.href = '/clients'
  }

  async function onSuspend() {
    if (!id) return
    await api.updateClient(id, { status: 'suspended' } as Partial<Client>)
    api.getClient(id).then(setClient)
  }

  async function onActivate() {
    if (!id) return
    await api.updateClient(id, { status: 'active' } as Partial<Client>)
    api.getClient(id).then(setClient)
  }

  function startEditing() {
    if (!client) return
    setEditForm(toEditForm(client))
    setSaveMsg('')
    setError('')
    setEditing(true)
  }

  async function saveDetails() {
    if (!id || !editForm) return
    if (!editForm.name.trim()) {
      setError('Client name is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Only send db_password / app_key if the admin actually typed a
      // new one — the API never returns the current values, so an
      // empty field here means "leave it as is", not "clear it".
      const { db_password, app_key, ...rest } = editForm
      const payload: Partial<Client> & { db_password?: string; app_key?: string } = { ...rest }
      if (db_password.trim() !== '') {
        payload.db_password = db_password
      }
      if (app_key.trim() !== '') {
        payload.app_key = app_key
      }
      const updated = await api.updateClient(id, payload)
      setClient(updated)
      setEditing(false)
      setSaveMsg('Client details updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  // ── Module functions ─────────────────────────────────────────────
  async function loadModules() {
    if (!id) return
    setModulesLoading(true)
    setError('')
    setModuleMsg('')
    try {
      const mods = await api.getClientModules(id)
      setModules(mods)
      setModulesLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules')
    } finally {
      setModulesLoading(false)
    }
  }

  async function toggleModule(m: ClientModule) {
    if (!id) return
    setToggling(m.module_key + m.company_id)
    setError('')
    try {
      await api.setModuleLicense(id, m.company_id, {
        module_key: m.module_key,
        enabled: !m.enabled,
      })
      const mods = await api.getClientModules(id)
      setModules(mods)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setToggling(null)
    }
  }

  // ── License limit functions ──────────────────────────────────────
  async function saveLicenseLimit() {
    if (!id) return
    setSavingLimit(true)
    setError('')
    try {
      const val = limitValue.trim() === '' ? null : parseInt(limitValue, 10)
      if (val !== null && (isNaN(val) || val < 1)) {
        setError('License count must be a positive number or empty for unlimited')
        setSavingLimit(false)
        return
      }
      await api.updateLicenseLimit(id, val)
      // Refresh summary
      const clients = await api.listClients()
      const found = clients.find(c => c.id === id)
      if (found) setClientSummary(found)
      setEditingLimit(false)
      setLicenseMsg(`License limit ${val ? `set to ${val}` : 'set to unlimited'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSavingLimit(false)
    }
  }

  async function pushLicenseLimit() {
    if (!id) return
    setSavingLimit(true)
    setError('')
    try {
      await api.pushLicenseLimit(id)
      setLicenseMsg('License limit pushed to client database')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setSavingLimit(false)
    }
  }

  // Switch tab and lazy-load modules
  function switchTab(t: Tab) {
    setTab(t)
    setError('')
    if (t === 'modules' && !modulesLoaded) {
      loadModules()
    }
  }

  if (!client) return <p style={{ color: color.textMuted, fontSize: 13 }}>Loading…</p>

  const infoRow: React.CSSProperties = { color: color.textMuted, paddingRight: 18, paddingBottom: 8, fontSize: 12.5, fontWeight: 500 }
  const infoVal: React.CSSProperties = { paddingBottom: 8, fontSize: 13, color: color.text }

  // Group modules by company
  const byCompany: Record<string, { name: string; modules: ClientModule[] }> = {}
  for (const m of modules) {
    if (!byCompany[m.company_id]) {
      byCompany[m.company_id] = { name: m.company_name, modules: [] }
    }
    byCompany[m.company_id].modules.push(m)
  }

  return (
    <div>
      <Link to="/clients" style={{ color: color.brand, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Back to Clients</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 14 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: color.ink, letterSpacing: '-0.01em' }}>{client.name}</h1>
          <p style={{ margin: 0, color: color.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
            Code: <strong style={{ color: color.text }}>{client.code}</strong>
            <span style={badge(STATUS_TONE[client.status] ?? 'neutral')}>{client.status}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {client.status === 'active' && (
            <button onClick={onSuspend} className="btn" style={button('danger', 'sm')}>Suspend</button>
          )}
          {client.status === 'suspended' && (
            <button onClick={onActivate} className="btn" style={button('success', 'sm')}>Activate</button>
          )}
          <button onClick={onDelete} className="btn" style={button('secondary', 'sm')}>Delete</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${color.border}`, marginTop: 22, marginBottom: 22 }}>
        <button onClick={() => switchTab('details')} style={tabUnderline(tab === 'details')}>📋 Details</button>
        <button onClick={() => switchTab('modules')} style={tabUnderline(tab === 'modules')}>🧩 Client Modules</button>
        <button onClick={() => switchTab('licenses')} style={tabUnderline(tab === 'licenses')}>🔑 Client Licenses</button>
      </div>

      {error && (
        <div style={alert('danger')}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={dismissButton()}>✕</button>
        </div>
      )}
      {saveMsg && (
        <div style={alert('success')}>
          <span>{saveMsg}</span>
          <button onClick={() => setSaveMsg('')} style={dismissButton()}>✕</button>
        </div>
      )}

      {/* ── Details Tab ──────────────────────────────────────────── */}
      {tab === 'details' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            {!editing ? (
              <button onClick={startEditing} className="btn" style={{ ...button('secondary', 'sm'), background: color.infoSoft, color: color.info }}>
                ✏️ Edit Details
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveDetails} disabled={saving} className="btn" style={button('primary', 'sm')}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setError('') }} className="btn" style={button('secondary', 'sm')}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Connection Details */}
            <div style={card({ padding: 22 })}>
              <h2 style={{ ...h2(), color: color.brand, marginBottom: 14 }}>Connection Details</h2>

              {!editing || !editForm ? (
                <table style={{ fontSize: 13 }}>
                  <tbody>
                    <tr><td style={infoRow}>Host</td><td style={infoVal}>{client.db_host}</td></tr>
                    <tr><td style={infoRow}>Port</td><td style={infoVal}>{client.db_port}</td></tr>
                    <tr><td style={infoRow}>Database</td><td style={infoVal}>{client.db_name}</td></tr>
                    <tr><td style={infoRow}>Username</td><td style={infoVal}>{client.db_username}</td></tr>
                    <tr><td style={infoRow}>TLS</td><td style={infoVal}>{client.db_use_tls ? 'Yes' : 'No'}</td></tr>
                  </tbody>
                </table>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={fieldLabel()}>Host</label>
                    <input value={editForm.db_host} onChange={(e) => setEditForm({ ...editForm, db_host: e.target.value })} style={input()} />
                  </div>
                  <div>
                    <label style={fieldLabel()}>Port</label>
                    <input type="number" value={editForm.db_port} onChange={(e) => setEditForm({ ...editForm, db_port: parseInt(e.target.value) || 0 })} style={input()} />
                  </div>
                  <div>
                    <label style={fieldLabel()}>Database</label>
                    <input value={editForm.db_name} onChange={(e) => setEditForm({ ...editForm, db_name: e.target.value })} style={input()} />
                  </div>
                  <div>
                    <label style={fieldLabel()}>Username</label>
                    <input value={editForm.db_username} onChange={(e) => setEditForm({ ...editForm, db_username: e.target.value })} style={input()} />
                  </div>
                  <div>
                    <label style={fieldLabel()}>Password</label>
                    <input
                      type="password"
                      value={editForm.db_password}
                      onChange={(e) => setEditForm({ ...editForm, db_password: e.target.value })}
                      placeholder="•••••••• (leave blank to keep current)"
                      style={input()}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input id="edit-tls" type="checkbox" checked={editForm.db_use_tls} onChange={(e) => setEditForm({ ...editForm, db_use_tls: e.target.checked })} />
                    <label htmlFor="edit-tls" style={{ fontSize: 13, fontWeight: 500, color: color.text, fontFamily: font.sans, cursor: 'pointer' }}>Use TLS</label>
                  </div>
                </div>
              )}

              {!editing && (
                <button onClick={onTest} disabled={testing} className="btn" style={{ ...button('secondary', 'sm'), marginTop: 14, background: color.infoSoft, color: color.info }}>
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
              )}

              {testResult && !editing && (
                <div style={{
                  marginTop: 14, padding: 14, borderRadius: radius.md,
                  background: testResult.success ? color.successSoft : color.dangerSoft,
                  border: `1px solid ${testResult.success ? '#b6e5c7' : '#f3c6c1'}`,
                  fontSize: 12.5, color: color.text,
                }}>
                  <strong style={{ color: testResult.success ? color.success : color.danger }}>{testResult.success ? '✅ Connected' : '❌ Failed'}</strong>
                  <p style={{ margin: '5px 0 0' }}>{testResult.message}</p>
                  {testResult.migration_head && <p style={{ margin: '3px 0 0' }}>Migration head: <code style={{ fontFamily: font.mono }}>{testResult.migration_head}</code></p>}
                  {testResult.companies && (
                    <div style={{ marginTop: 8 }}>
                      <strong>Companies ({testResult.companies.length}):</strong>
                      <ul style={{ margin: '5px 0 0', paddingLeft: 18 }}>
                        {testResult.companies.map((c) => (
                          <li key={c.id}>{c.name} {c.uen && `(${c.uen})`}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={card({ padding: 22 })}>
              <h2 style={{ ...h2(), color: color.brand, marginBottom: 14 }}>Information</h2>

              {editing && editForm && (
                <div style={{ marginBottom: 16 }}>
                  <label style={fieldLabel()}>Client Name</label>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={input()} />
                </div>
              )}

              <table style={{ fontSize: 13 }}>
                <tbody>
                  <tr><td style={infoRow}>Last Connected</td><td style={infoVal}>{formatDateTime(client.last_connected_at)}</td></tr>
                  <tr><td style={infoRow}>Migration Head</td><td style={{ ...infoVal, fontFamily: font.mono, fontSize: 11 }}>{client.last_known_migration_head ?? '—'}</td></tr>
                  <tr>
                    <td style={infoRow}>APP_KEY</td>
                    <td style={infoVal}>
                      {client.app_key_set
                        ? <span style={{ color: color.success, fontWeight: 600 }}>Set</span>
                        : <span style={{ color: color.textFaint }}>Not set</span>}
                    </td>
                  </tr>
                  <tr><td style={infoRow}>Created</td><td style={infoVal}>{formatDateTime(client.created_at)}</td></tr>
                  <tr><td style={infoRow}>Updated</td><td style={infoVal}>{formatDateTime(client.updated_at)}</td></tr>
                </tbody>
              </table>

              {!editing ? (
                client.notes && (
                  <div style={{ marginTop: 14, padding: 12, background: color.page, borderRadius: radius.sm, fontSize: 12.5, color: color.text, border: `1px solid ${color.border}` }}>
                    <strong>Notes:</strong> {client.notes}
                  </div>
                )
              ) : (
                editForm && (
                  <>
                    <div style={{ marginTop: 14 }}>
                      <label style={fieldLabel()}>Notes</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                        style={{ ...input(), resize: 'vertical' }}
                      />
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <label style={fieldLabel()}>APP_KEY</label>
                      <input
                        type="password"
                        value={editForm.app_key}
                        onChange={(e) => setEditForm({ ...editForm, app_key: e.target.value })}
                        placeholder={client.app_key_set ? '•••••••• (leave blank to keep current)' : 'base64:… from that client\'s backend-php/.env'}
                        style={{ ...input(), fontFamily: font.mono, fontSize: 12 }}
                      />
                      <p style={{ margin: '5px 0 0', fontSize: 11, color: color.textFaint }}>
                        Only needed for System Mail pushes — lets Central Command encrypt the mailbox password
                        the way this client's own app would.
                      </p>
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Client Modules Tab ───────────────────────────────────── */}
      {tab === 'modules' && (
        <div>
          {moduleMsg && (
            <div style={alert('success')}>
              <span>{moduleMsg}</span>
              <button onClick={() => setModuleMsg('')} style={dismissButton()}>✕</button>
            </div>
          )}

          {modulesLoading && <p style={{ color: color.textMuted, fontSize: 13 }}>Loading modules from client database…</p>}

          {!modulesLoading && modulesLoaded && modules.length === 0 && (
            <p style={{ color: color.textMuted, fontSize: 13 }}>No modules found in client database. Test the connection first to ensure connectivity.</p>
          )}

          {Object.entries(byCompany).map(([companyId, { name, modules: mods }]) => (
            <div key={companyId} style={card({ marginBottom: 20, padding: 0, overflow: 'hidden' })}>
              <div style={{ background: color.page, padding: '11px 18px', borderBottom: `1px solid ${color.border}` }}>
                <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: color.text }}>🏢 {name}</h2>
              </div>
              <table style={table()}>
                <thead>
                  <tr>
                    <th style={th()}>Module</th>
                    <th style={th()}>Key</th>
                    <th style={th()}>Built</th>
                    <th style={th()}>License</th>
                    <th style={th()}>Status</th>
                    <th style={th()}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mods.map((m) => (
                    <tr key={m.module_key} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                      <td style={td({ fontWeight: 500 })}>{m.module_name}</td>
                      <td style={td({ fontFamily: font.mono, fontSize: 11, color: color.textMuted })}>{m.module_key}</td>
                      <td style={td()}>
                        <span style={{ color: m.is_built ? color.success : color.textFaint }}>{m.is_built ? '✓' : '—'}</span>
                      </td>
                      <td style={td()}>
                        <span style={badge('neutral')}>{m.license_type}</span>
                      </td>
                      <td style={td()}>
                        <span style={badge(m.enabled ? 'success' : 'danger')}>{m.enabled ? 'ENABLED' : 'DISABLED'}</span>
                      </td>
                      <td style={td()}>
                        <button
                          onClick={() => toggleModule(m)}
                          disabled={toggling === m.module_key + m.company_id}
                          className="btn"
                          style={button(m.enabled ? 'danger' : 'success', 'sm')}
                        >
                          {toggling === m.module_key + m.company_id ? '…' : m.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {modulesLoaded && modules.length > 0 && (
            <button onClick={loadModules} className="btn" style={{ ...button('secondary', 'sm'), background: color.infoSoft, color: color.info }}>
              🔄 Refresh Modules
            </button>
          )}
        </div>
      )}

      {/* ── Client Licenses Tab ──────────────────────────────────── */}
      {tab === 'licenses' && clientSummary && (
        <div>
          {licenseMsg && (
            <div style={alert('success')}>
              <span>{licenseMsg}</span>
              <button onClick={() => setLicenseMsg('')} style={dismissButton()}>✕</button>
            </div>
          )}

          <div style={card({ padding: '22px 26px' })}>
            <h2 style={{ ...h2(), color: color.brand, marginBottom: 18 }}>🔐 Max Concurrent Logins</h2>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>Current Limit:</span>
                {!editingLimit ? (
                  <span style={badge(clientSummary.max_licenses ? 'info' : 'success')}>
                    {clientSummary.max_licenses ? `${clientSummary.max_licenses} users` : 'Unlimited'}
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      placeholder="Empty = unlimited"
                      value={limitValue}
                      onChange={e => setLimitValue(e.target.value)}
                      style={{ ...input(), width: 150 }}
                    />
                    <button onClick={saveLicenseLimit} disabled={savingLimit} className="btn" style={button('success', 'sm')}>
                      {savingLimit ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingLimit(false)} className="btn" style={button('secondary', 'sm')}>
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editingLimit && (
                  <button
                    onClick={() => {
                      setLimitValue(clientSummary.max_licenses ? String(clientSummary.max_licenses) : '')
                      setEditingLimit(true)
                    }}
                    className="btn"
                    style={{ ...button('secondary', 'sm'), background: color.infoSoft, color: color.info }}
                  >
                    ✏️ Edit
                  </button>
                )}
                <button onClick={pushLicenseLimit} disabled={savingLimit} className="btn" style={button('primary', 'sm')}>
                  {savingLimit ? '…' : '⬆ Push to Client'}
                </button>
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: color.textMuted }}>
              Controls how many users can be logged in simultaneously. Leave empty for no limit. Push to apply to client's database.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
