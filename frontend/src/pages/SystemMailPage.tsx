import { useEffect, useState, type FormEvent } from 'react'
import { api, type ClientSummary, type MailPurpose, type PushResult, type SystemMailSetting } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h1, input, label as fieldLabel, pageHeader, table, td, th, type Tone } from '../lib/theme'
import { ClientPicker, TargetChips } from '../components/ClientTargeting'

const PURPOSE_LABEL: Record<MailPurpose, string> = { otp: 'Sign-in / OTP', helpdesk: 'Helpdesk (Outlook Add-in)' }
const PURPOSE_TONE: Record<MailPurpose, Tone> = { otp: 'info', helpdesk: 'purple' }

const EMPTY_FORM = {
  purpose: 'otp' as MailPurpose, label: '', host: '', port: 587, username: '', password: '',
  use_tls: true, from_email: '', from_name: '', client_ids: [] as string[],
}

export default function SystemMailPage() {
  const [settings, setSettings] = useState<SystemMailSetting[]>([])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [pushResult, setPushResult] = useState<PushResult | null>(null)

  const refresh = () => {
    api.listSystemMail().then(setSettings)
    api.listClients().then(setClients)
  }
  useEffect(() => { refresh() }, [])

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id.slice(0, 8)
  const clientsMissingAppKey = (ids: string[]) => ids.filter((id) => !clients.find((c) => c.id === id)?.app_key_set)

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.createSystemMail({
        ...form,
        host: form.host || undefined,
        username: form.username || undefined,
        password: form.password || undefined,
        from_email: form.from_email || undefined,
        from_name: form.from_name || undefined,
      })
      setShowForm(false)
      setForm(EMPTY_FORM)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  function toggleClient(cid: string) {
    setForm((f) => ({
      ...f,
      client_ids: f.client_ids.includes(cid) ? f.client_ids.filter((x) => x !== cid) : [...f.client_ids, cid],
    }))
  }

  async function onPush(id: string) {
    setPushResult(null)
    setError('')
    try {
      setPushResult(await api.pushSystemMail(id))
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this mailbox config? This does not clear it from any client already pushed to.')) return
    await api.deleteSystemMail(id)
    refresh()
  }

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>📧 System Mail</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn" style={button('primary')}>
          {showForm ? 'Cancel' : '+ New Mailbox'}
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 14px', maxWidth: 680 }}>
        The two mailboxes each client install sends system email from — <strong>Sign-in / OTP</strong> (login
        codes, password resets, portal invites) and <strong>Helpdesk</strong> (the Outlook Add-in's Incident /
        Job Order acknowledgements). Central Command holds the master copy here and pushes it into that
        client's <code style={{ fontFamily: font.mono }}>system_mail_settings</code> table — separate from each
        company's own document-email mailbox, which stays client-side.
      </p>

      <div style={{ background: color.warningSoft, border: `1px solid ${color.warning}22`, borderRadius: 8, padding: '10px 14px', marginBottom: 20, maxWidth: 680 }}>
        <p style={{ margin: 0, fontSize: 12, color: color.text, lineHeight: 1.6 }}>
          <strong style={{ color: color.warning }}>⚠️ Requires that client's APP_KEY.</strong> The password
          column on the client side is encrypted with <em>that install's own</em> Laravel key, so Central
          Command needs it on file to write a password the client can actually decrypt — set it under
          that client's Details tab (Connection Details). A client without one still receives every other
          field; only the password is skipped for it, silently on the client side, but reported per-client
          in the push results here.
        </p>
      </div>

      {error && (
        <div style={alert('danger')}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={dismissButton()}>✕</button>
        </div>
      )}

      {pushResult && (
        <div style={{ ...card({ padding: 14, marginBottom: 18 }), background: color.successSoft, border: `1px solid #b6e5c7` }}>
          <strong style={{ fontSize: 13, color: color.success }}>Push Results</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {pushResult.results.map((r, i) => (
              <li key={i} style={{ color: r.success ? color.success : color.danger }}>
                {r.client}: {r.success ? '✓ OK' : `✗ ${r.error}`}
              </li>
            ))}
          </ul>
          <button onClick={() => setPushResult(null)} style={{ ...dismissButton(), marginTop: 4 }}>Dismiss</button>
        </div>
      )}

      {showForm && (
        <div style={card({ padding: 22, marginBottom: 20 })}>
          <form onSubmit={onCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>Purpose</label>
                <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value as MailPurpose })} style={input()}>
                  <option value="otp">Sign-in / OTP</option>
                  <option value="helpdesk">Helpdesk (Outlook Add-in)</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel()}>Label</label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="e.g. Production OTP mailbox" style={input()} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>SMTP Host</label>
                <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="e.g. smtp.sendgrid.net" style={input()} />
              </div>
              <div>
                <label style={fieldLabel()}>Port</label>
                <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })} style={input()} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>Username</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={input()} />
              </div>
              <div>
                <label style={fieldLabel()}>Password</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={input()} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={fieldLabel()}>From Email</label>
                <input type="email" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} placeholder="noreply@example.com" style={input()} />
              </div>
              <div>
                <label style={fieldLabel()}>From Name</label>
                <input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="e.g. Websoft Service ERP" style={input()} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input id="mail-tls" type="checkbox" checked={form.use_tls} onChange={(e) => setForm({ ...form, use_tls: e.target.checked })} />
              <label htmlFor="mail-tls" style={{ fontSize: 13, fontWeight: 500, color: color.text, fontFamily: font.sans, cursor: 'pointer' }}>Use STARTTLS</label>
            </div>
            <ClientPicker clients={clients} selected={form.client_ids} onToggle={toggleClient} />
            {clientsMissingAppKey(form.client_ids).length > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: color.warning }}>
                ⚠️ No APP_KEY on file yet for: {clientsMissingAppKey(form.client_ids).map(clientName).join(', ')} — the password won't push to {clientsMissingAppKey(form.client_ids).length === 1 ? 'it' : 'them'} until set.
              </p>
            )}
            <button type="submit" className="btn" style={{ ...button('primary'), marginTop: 14 }}>Create</button>
          </form>
        </div>
      )}

      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>Purpose</th>
              <th style={th()}>Label</th>
              <th style={th()}>Host</th>
              <th style={th()}>From</th>
              <th style={th()}>Password</th>
              <th style={th()}>Targeted Clients</th>
              <th style={th()}>Created</th>
              <th style={th()}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.id} className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
                <td style={td()}><span style={badge(PURPOSE_TONE[s.purpose])}>{PURPOSE_LABEL[s.purpose]}</span></td>
                <td style={td({ fontWeight: 500 })}>{s.label}</td>
                <td style={td({ fontFamily: font.mono, fontSize: 11.5, color: color.textMuted })}>{s.host || '—'}</td>
                <td style={td({ fontSize: 12 })}>{s.from_email || '—'}</td>
                <td style={td({ color: s.password_set ? color.success : color.textFaint, fontWeight: 500 })}>{s.password_set ? 'Set' : 'Not set'}</td>
                <td style={td({ fontSize: 11 })}>
                  <TargetChips assignments={s.assignments} clientName={clientName} />
                </td>
                <td style={td({ color: color.textMuted })}>{formatDateTime(s.created_at)}</td>
                <td style={td()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onPush(s.id)} className="btn" style={button('success', 'sm')}>Push</button>
                    <button onClick={() => onDelete(s.id)} className="btn" style={button('danger', 'sm')}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {settings.length === 0 && (
              <tr><td colSpan={8} style={td({ padding: 26, textAlign: 'center', color: color.textMuted })}>No system mailboxes configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
