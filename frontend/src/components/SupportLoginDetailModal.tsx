import { useState } from 'react'
import { api, type SupportLogin } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, color, dismissButton, font, input, label, modalOverlay, modalPanel } from '../lib/theme'

/**
 * View / edit / reset-password panel for one pushed support login.
 * Mirrors StaffDetailModal's shape: the record itself (client, staff,
 * login email, status) is read-only — it describes what was actually
 * pushed to the client's `users` table — but "reason" can be edited,
 * and the password can be reset without re-pushing a whole new login
 * (which would also duplicate this audit row).
 */
export default function SupportLoginDetailModal({
  login, staffName, clientName, onClose, onUpdated,
}: {
  login: SupportLogin
  staffName: string
  clientName: string
  onClose: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState(login.reason ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  const isRevoked = login.status !== 'active'

  async function saveReason() {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await api.updateSupportLogin(login.id, { reason })
      setSuccess('Reason updated')
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
      await api.resetSupportLoginPassword(login.id, newPassword)
      setSuccess(`Password reset for ${login.login_email}`)
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
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: color.ink }}>{login.login_email}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: color.textMuted }}>Support login for {staffName} on {clientName}</p>
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

          <table style={{ fontSize: 13, width: '100%' }}>
            <tbody>
              <tr><td style={infoRow}>Staff</td><td style={infoVal}>{staffName}</td></tr>
              <tr><td style={infoRow}>Client</td><td style={infoVal}><span style={badge('brand')}>{clientName}</span></td></tr>
              <tr><td style={infoRow}>Client User ID</td><td style={{ ...infoVal, fontFamily: font.mono, fontSize: 11 }}>{login.client_user_id ?? '—'}</td></tr>
              <tr><td style={infoRow}>Status</td><td style={infoVal}><span style={badge(login.status === 'active' ? 'success' : 'danger')}>{login.status === 'active' ? 'Active' : 'Revoked'}</span></td></tr>
              <tr><td style={infoRow}>Pushed</td><td style={infoVal}>{formatDateTime(login.pushed_at)}</td></tr>
              {login.revoked_at && <tr><td style={infoRow}>Revoked</td><td style={infoVal}>{formatDateTime(login.revoked_at)}</td></tr>}
            </tbody>
          </table>

          {/* ── Reason: view or edit ──────────────────────────────── */}
          {!editing ? (
            <>
              <div style={{ marginBottom: 4 }}>
                <p style={{ ...infoRow, paddingRight: 0, display: 'block' }}>Reason</p>
                <p style={{ margin: 0, fontSize: 13, color: color.text }}>{login.reason || '—'}</p>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => setEditing(true)} className="btn" style={button('secondary', 'sm')}>✏️ Edit Details</button>
                {!isRevoked && (
                  <button onClick={() => setResetting(!resetting)} className="btn" style={{ ...button('secondary', 'sm'), background: color.warningSoft, color: color.warning }}>
                    🔑 Reset Password
                  </button>
                )}
              </div>
              {isRevoked && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: color.textFaint }}>This login is revoked — its password cannot be reset. Push a new support login instead.</p>
              )}
            </>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={label()}>Reason</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} style={input()} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveReason} disabled={saving} className="btn" style={button('primary', 'sm')}>{saving ? 'Saving…' : 'Save'}</button>
                <button onClick={() => { setEditing(false); setReason(login.reason ?? '') }} className="btn" style={button('secondary', 'sm')}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── Reset password ─────────────────────────────────────── */}
          {resetting && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${color.border}` }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: color.ink }}>Set a New Password</h3>
              <p style={{ margin: '0 0 12px', fontSize: 11.5, color: color.textMuted }}>Pushes a new password directly to this login on the client's database.</p>
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
