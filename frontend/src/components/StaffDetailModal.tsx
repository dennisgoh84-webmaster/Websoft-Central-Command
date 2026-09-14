import { useState } from 'react'
import { api, type AdminUser } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, color, dismissButton, font, input, label, modalOverlay, modalPanel, type Tone } from '../lib/theme'

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
const VALID_ROLES = ['admin', 'support_engineer', 'viewer', 'super_admin']

/**
 * View / edit / reset-password panel for one staff member. Opens as a
 * modal from the Staff table (click a row or its "View" button).
 * Every write goes through the same `PATCH /api/staff/{id}` the rest
 * of the app uses — this is presentation only, the backend still
 * enforces super_admin-only writes and the super-admin protection
 * rules (cannot demote/disable/delete).
 */
export default function StaffDetailModal({
  staff, onClose, onUpdated,
}: {
  staff: AdminUser
  onClose: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: staff.full_name, email: staff.email ?? '', role: staff.role })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  const isSuperAdmin = staff.role === 'super_admin'

  async function saveDetails() {
    setError('')
    setSuccess('')
    if (!form.full_name.trim()) {
      setError('Full name is required')
      return
    }
    setSaving(true)
    try {
      await api.updateStaff(staff.id, {
        full_name: form.full_name,
        email: form.email || undefined,
        role: form.role,
      })
      setSuccess('Details updated')
      setEditing(false)
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword() {
    setError('')
    setSuccess('')
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setResetSaving(true)
    try {
      await api.updateStaff(staff.id, { password: newPassword })
      setSuccess(`Password reset for ${staff.username}`)
      setResetting(false)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetSaving(false)
    }
  }

  const infoRow: React.CSSProperties = { color: color.textMuted, paddingRight: 18, paddingBottom: 10, fontSize: 12.5, fontWeight: 500, verticalAlign: 'top' }
  const infoVal: React.CSSProperties = { paddingBottom: 10, fontSize: 13, color: color.text }

  return (
    <div style={modalOverlay()} onClick={onClose}>
      <div style={modalPanel(460)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${color.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: color.ink }}>{staff.full_name}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: color.textMuted, fontFamily: font.mono }}>@{staff.username}</p>
          </div>
          <button onClick={onClose} style={{ ...dismissButton(), fontSize: 18 }}>✕</button>
        </div>

        <div style={{ padding: 22 }}>
          {error && (
            <div style={alert('danger')}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={dismissButton()}>✕</button>
            </div>
          )}
          {success && (
            <div style={alert('success')}>
              <span>{success}</span>
              <button onClick={() => setSuccess('')} style={dismissButton()}>✕</button>
            </div>
          )}

          {/* ── Details: view or edit ─────────────────────────────── */}
          {!editing ? (
            <>
              <table style={{ fontSize: 13, width: '100%' }}>
                <tbody>
                  <tr><td style={infoRow}>Email</td><td style={infoVal}>{staff.email || '—'}</td></tr>
                  <tr><td style={infoRow}>Role</td><td style={infoVal}><span style={badge(ROLE_TONE[staff.role] ?? 'neutral')}>{ROLE_LABELS[staff.role] || staff.role}</span></td></tr>
                  <tr><td style={infoRow}>Status</td><td style={infoVal}>{staff.is_active ? <span style={{ color: color.success, fontWeight: 600 }}>Active</span> : <span style={{ color: color.danger, fontWeight: 600 }}>Disabled</span>}</td></tr>
                  <tr><td style={infoRow}>Created</td><td style={infoVal}>{formatDateTime(staff.created_at)}</td></tr>
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setEditing(true)} className="btn" style={button('secondary', 'sm')}>✏️ Edit Details</button>
                <button onClick={() => setResetting(!resetting)} className="btn" style={{ ...button('secondary', 'sm'), background: color.warningSoft, color: color.warning }}>
                  🔑 Reset Password
                </button>
              </div>
            </>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={label()}>Full Name</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={input()} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={label()}>Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={input()} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label()}>Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  disabled={isSuperAdmin}
                  style={{ ...input(), opacity: isSuperAdmin ? 0.6 : 1 }}
                >
                  {VALID_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                {isSuperAdmin && (
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: color.textFaint }}>Super admin accounts cannot be demoted.</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveDetails} disabled={saving} className="btn" style={button('primary', 'sm')}>{saving ? 'Saving…' : 'Save'}</button>
                <button onClick={() => { setEditing(false); setForm({ full_name: staff.full_name, email: staff.email ?? '', role: staff.role }) }} className="btn" style={button('secondary', 'sm')}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Reset password ─────────────────────────────────────── */}
          {resetting && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${color.border}` }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: color.ink }}>Set a New Password</h3>
              <div style={{ marginBottom: 10 }}>
                <label style={label()}>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={input()} minLength={8} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={label()}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={input()} minLength={8} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={savePassword} disabled={resetSaving} className="btn" style={button('primary', 'sm')}>{resetSaving ? 'Saving…' : 'Set Password'}</button>
                <button onClick={() => { setResetting(false); setNewPassword(''); setConfirmPassword('') }} className="btn" style={button('secondary', 'sm')}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
