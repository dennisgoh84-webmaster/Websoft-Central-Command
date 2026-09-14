import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AdminUser, ClientSummary, SupportLogin } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label, pageHeader, tabPill, table, td, th, type Tone } from '../lib/theme'
import StaffDetailModal from '../components/StaffDetailModal'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support_engineer: 'Support Engineer',
  viewer: 'Viewer',
}
const ROLE_TONE: Record<string, Tone> = {
  super_admin: 'brand',
  admin: 'info',
  support_engineer: 'success',
  viewer: 'neutral',
}

export default function StaffPage() {
  const [staff, setStaff] = useState<AdminUser[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [supportLogins, setSupportLogins] = useState<SupportLogin[]>([])
  const [tab, setTab] = useState<'staff' | 'support'>('staff')
  const [showCreate, setShowCreate] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [form, setForm] = useState({ username: '', full_name: '', email: '', password: '', role: 'admin' })
  const [pushForm, setPushForm] = useState({ client_id: '', admin_user_id: '', login_email: '', login_password: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [viewingStaff, setViewingStaff] = useState<AdminUser | null>(null)

  const load = async () => {
    const [s, c, sl] = await Promise.all([
      api.listStaff(),
      api.listClients(),
      api.listSupportLogins(),
    ])
    setStaff(s)
    setClients(c)
    setSupportLogins(sl)
  }

  useEffect(() => { load() }, [])

  const refreshStaff = async () => {
    const s = await api.listStaff()
    setStaff(s)
    setViewingStaff((current) => (current ? s.find((x) => x.id === current.id) ?? current : current))
  }

  const handleCreate = async () => {
    if (!form.username || !form.full_name || !form.password) return
    setBusy(true)
    try {
      await api.createStaff(form)
      setShowCreate(false)
      setForm({ username: '', full_name: '', email: '', password: '', role: 'admin' })
      setMsg('Staff created')
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }

  const handleToggleActive = async (s: AdminUser) => {
    try {
      await api.updateStaff(s.id, { is_active: !s.is_active })
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    load()
  }

  const handlePushLogin = async () => {
    if (!pushForm.client_id || !pushForm.admin_user_id || !pushForm.login_email || !pushForm.login_password) return
    setBusy(true)
    try {
      const r = await api.pushSupportLogin(pushForm)
      setMsg(`Support login '${r.login_email}' pushed to ${r.client}`)
      setShowPush(false)
      setPushForm({ client_id: '', admin_user_id: '', login_email: '', login_password: '', reason: '' })
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
    setBusy(false)
  }

  const handleRevoke = async (sl: SupportLogin) => {
    if (!confirm(`Revoke support login '${sl.login_email}'?`)) return
    try {
      await api.revokeSupportLogin(sl.id)
      setMsg(`Revoked '${sl.login_email}'`)
      load()
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed') }
  }

  // Find names for IDs
  const staffName = (id: string) => staff.find(s => s.id === id)?.full_name || id.slice(0, 8)
  const clientName = (id: string) => clients.find(c => c.id === id)?.code || id.slice(0, 8)

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>👤 Staff Management</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'support' && (
            <button onClick={() => setShowPush(true)} className="btn" style={button('success')}>🔑 Push Support Login</button>
          )}
          {tab === 'staff' && (
            <button onClick={() => setShowCreate(true)} className="btn" style={button('primary')}>+ Add Staff</button>
          )}
        </div>
      </div>

      {msg && (
        <div style={alert('warning')}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')} style={dismissButton()}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button onClick={() => setTab('staff')} className="btn" style={tabPill(tab === 'staff')}>👥 CC Staff</button>
        <button onClick={() => setTab('support')} className="btn" style={tabPill(tab === 'support')}>🔑 Support Logins</button>
      </div>

      {/* Create Staff */}
      {showCreate && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: color.ink }}>Add New Staff Member</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label()}>Username</label>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={input()} />
            </div>
            <div>
              <label style={label()}>Full Name</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={input()} />
            </div>
            <div>
              <label style={label()}>Email (optional)</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input()} />
            </div>
            <div>
              <label style={label()}>Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={input()} />
            </div>
          </div>
          <label style={label()}>Role</label>
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={{ ...input(), marginBottom: 14, width: 220 }}>
            <option value="admin">Admin</option>
            <option value="support_engineer">Support Engineer</option>
            <option value="viewer">Viewer</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={busy} className="btn" style={button('primary')}>Create</button>
            <button onClick={() => setShowCreate(false)} className="btn" style={button('secondary')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Push Support Login */}
      {showPush && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: color.ink }}>Push Support Login to Client</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={label()}>Client</label>
              <select value={pushForm.client_id} onChange={e => setPushForm({ ...pushForm, client_id: e.target.value })} style={input()}>
                <option value="">— Select Client —</option>
                {clients.filter(c => c.status === 'active').map(c => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label()}>Staff Member</label>
              <select value={pushForm.admin_user_id} onChange={e => setPushForm({ ...pushForm, admin_user_id: e.target.value })} style={input()}>
                <option value="">— Select Staff —</option>
                {staff.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label()}>Login Email (in client ERP)</label>
              <input value={pushForm.login_email} onChange={e => setPushForm({ ...pushForm, login_email: e.target.value })} style={input()} />
            </div>
            <div>
              <label style={label()}>Login Password</label>
              <input type="password" value={pushForm.login_password} onChange={e => setPushForm({ ...pushForm, login_password: e.target.value })} style={input()} />
            </div>
          </div>
          <label style={label()}>Reason (optional)</label>
          <input value={pushForm.reason} onChange={e => setPushForm({ ...pushForm, reason: e.target.value })} style={{ ...input(), marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePushLogin} disabled={busy} className="btn" style={button('success')}>Push Login</button>
            <button onClick={() => setShowPush(false)} className="btn" style={button('secondary')}>Cancel</button>
          </div>
        </div>
      )}

      {/* Staff Tab */}
      {tab === 'staff' && (
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Username</th>
                <th style={th()}>Full Name</th>
                <th style={th()}>Email</th>
                <th style={th()}>Role</th>
                <th style={th()}>Status</th>
                <th style={th()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td({ fontWeight: 600 })}>{s.username}</td>
                  <td style={td()}>{s.full_name}</td>
                  <td style={td({ color: color.textMuted, fontSize: 12 })}>{s.email || '—'}</td>
                  <td style={td()}>
                    <span style={badge(ROLE_TONE[s.role] ?? 'neutral')}>{ROLE_LABELS[s.role] || s.role}</span>
                  </td>
                  <td style={td()}>
                    {s.is_active
                      ? <span style={{ color: color.success, fontWeight: 600 }}>Active</span>
                      : <span style={{ color: color.danger, fontWeight: 600 }}>Disabled</span>
                    }
                  </td>
                  <td style={td()}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => setViewingStaff(s)} className="btn" style={{ ...button('secondary', 'sm'), background: color.infoSoft, color: color.info }}>
                        View
                      </button>
                      {s.role === 'super_admin'
                        ? <span title="Super admin accounts cannot be disabled" style={{ color: color.textFaint, fontSize: 11.5 }}>🔒 Protected</span>
                        : (
                          <button onClick={() => handleToggleActive(s)} className="btn" style={button(s.is_active ? 'danger' : 'success', 'sm')}>
                            {s.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Support Logins Tab */}
      {tab === 'support' && (
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          <table style={table()}>
            <thead>
              <tr>
                <th style={th()}>Staff</th>
                <th style={th()}>Client</th>
                <th style={th()}>Login Email</th>
                <th style={th()}>Status</th>
                <th style={th()}>Pushed</th>
                <th style={th()}>Reason</th>
                <th style={th()}>Action</th>
              </tr>
            </thead>
            <tbody>
              {supportLogins.map(sl => (
                <tr key={sl.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                  <td style={td({ fontWeight: 500 })}>{staffName(sl.admin_user_id)}</td>
                  <td style={td()}><span style={badge('brand')}>{clientName(sl.client_id)}</span></td>
                  <td style={td({ fontFamily: font.mono, fontSize: 12 })}>{sl.login_email}</td>
                  <td style={td()}>
                    <span style={badge(sl.status === 'active' ? 'success' : 'danger')}>{sl.status === 'active' ? 'Active' : 'Revoked'}</span>
                  </td>
                  <td style={td({ color: color.textMuted, fontSize: 12 })}>{formatDateTime(sl.pushed_at)}</td>
                  <td style={td({ fontSize: 12 })}>{sl.reason || '—'}</td>
                  <td style={td()}>
                    {sl.status === 'active' && (
                      <button onClick={() => handleRevoke(sl)} className="btn" style={button('danger', 'sm')}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {supportLogins.length === 0 && (
                <tr><td colSpan={7} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No support logins pushed yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewingStaff && (
        <StaffDetailModal
          staff={viewingStaff}
          onClose={() => setViewingStaff(null)}
          onUpdated={refreshStaff}
        />
      )}
    </div>
  )
}
