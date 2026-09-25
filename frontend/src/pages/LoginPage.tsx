import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'
import { alert, button, color, dismissButton, font, input, radius } from '../lib/theme'
import logo from '../assets/logo-color.png'

type View = 'login' | 'otp' | 'forgot_password' | 'reset_password' | 'forgot_username'

export default function LoginPage() {
  const { login, verifyOtp } = useAuth()
  const [view, setView] = useState<View>('login')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // OTP state
  const [otpSession, setOtpSession] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  // Forgot password state
  const [fpUsername, setFpUsername] = useState('')
  const [fpOtp, setFpOtp] = useState('')
  const [fpNewPassword, setFpNewPassword] = useState('')
  const [fpConfirmPassword, setFpConfirmPassword] = useState('')
  const [fpDevOtp, setFpDevOtp] = useState<string | null>(null)
  const [fpEmailHint, setFpEmailHint] = useState<string | null>(null)

  // Forgot username state
  const [fuEmail, setFuEmail] = useState('')
  const [fuDevUsername, setFuDevUsername] = useState<string | null>(null)

  const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5, color: color.text }
  const btnStyle = { ...button('primary'), width: '100%', padding: '11px 0', fontSize: 14 }
  const linkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: color.brand,
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
    fontFamily: font.sans,
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  }
  const otpInputStyle = { ...input(), textAlign: 'center' as const, fontSize: 22, letterSpacing: 8, fontWeight: 600 }

  // One request at a time (2026-09-25): emailing a code takes a few
  // seconds, and a second tap or Enter meanwhile used to sign in again --
  // a second email with a different code, only one of which would work.
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const once = (handler: (e: FormEvent) => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await handler(e)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // ── Login submit ──────────────────────────────────────────────────
  async function onLoginSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await login(username, password)
      if (res.status === 'otp_required') {
        setOtpSession(res.otp_session || '')
        setEmailHint(res.email_hint || null)
        setDevOtp(res._dev_otp || null)
        setEmailSent(!!res.email_sent)
        setDeliveryError(res.delivery_error || null)
        setOtpCode('')
        setView('otp')
      }
      // if status is 'ok', AuthContext already set the user
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  // ── OTP verify ────────────────────────────────────────────────────
  async function onOtpSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await verifyOtp(otpSession, otpCode)
      // AuthContext sets user, page will redirect
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed')
    }
  }

  // ── Forgot password: request OTP ──────────────────────────────────
  async function onForgotPasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      const res = await api.forgotPassword(fpUsername)
      setFpDevOtp(res._dev_otp || null)
      setFpEmailHint(res.email_hint || null)
      setSuccess(res.message)
      setView('reset_password')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    }
  }

  // ── Reset password ────────────────────────────────────────────────
  async function onResetPasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (fpNewPassword !== fpConfirmPassword) {
      setError('Passwords do not match')
      return
    }
    try {
      const res = await api.resetPassword(fpUsername, fpOtp, fpNewPassword)
      setSuccess(res.message)
      // Go back to login after a moment
      setTimeout(() => {
        resetAll()
        setView('login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    }
  }

  // ── Forgot username ──────────────────────────────────────────────
  async function onForgotUsernameSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      const res = await api.forgotUsername(fuEmail)
      setFuDevUsername(res._dev_username || null)
      setSuccess(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    }
  }

  function resetAll() {
    setError('')
    setSuccess('')
    setDevOtp(null)
    setFpDevOtp(null)
    setFuDevUsername(null)
    setOtpCode('')
    setFpOtp('')
    setFpNewPassword('')
    setFpConfirmPassword('')
  }

  function goBack() {
    resetAll()
    setView('login')
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 30% 20%, #241a2a 0%, ${color.sidebarBg} 55%)`,
        fontFamily: font.sans,
      }}
    >
      <div
        style={{
          background: color.surface,
          padding: '38px 40px',
          borderRadius: radius.lg,
          width: 380,
          boxShadow: '0 24px 60px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <img src={logo} alt="WebMaster Consultancy" style={{ height: 46, marginBottom: 14 }} />
          <h1 style={{ fontSize: 19, margin: 0, color: color.ink, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Central Command
          </h1>
          <p style={{ color: color.textMuted, fontSize: 12.5, margin: '3px 0 0' }}>
            Admin Portal
          </p>
        </div>

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

        {/* ── Login Form ───────────────────────────────────────────── */}
        {view === 'login' && (
          <form onSubmit={once(onLoginSubmit)}>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required style={input()} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={input()} />
            </div>
            <button type="submit" className="btn" style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Sending code…' : 'Sign In'}</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" onClick={() => { resetAll(); setView('forgot_password') }} style={linkStyle}>
                Forgot Password?
              </button>
              <button type="button" onClick={() => { resetAll(); setView('forgot_username') }} style={linkStyle}>
                Forgot Username?
              </button>
            </div>
          </form>
        )}

        {/* ── OTP Verification ─────────────────────────────────────── */}
        {view === 'otp' && (
          <form onSubmit={once(onOtpSubmit)}>
            {emailSent && (
              <div style={{ ...alert('info'), display: 'block' }}>
                📧 A 6-digit code has been emailed to <strong>{emailHint || 'your registered email'}</strong>.
                <br />Enter it below to complete login.
              </div>
            )}
            {deliveryError && (
              <div style={{ ...alert('danger'), display: 'block' }}>{deliveryError}</div>
            )}
            {devOtp && (
              <div style={{ ...alert('warning'), display: 'block' }}>
                ⚠️ <strong>Email is not set up for Central Command yet</strong>, so your code is shown here:{' '}
                <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, fontFamily: font.mono }}>{devOtp}</code>
                <br />
                <span style={{ fontSize: 12 }}>
                  Anyone with the password can sign in until a super admin sets a mailbox under{' '}
                  <strong>System Mail → Use for Central Command sign-in</strong>.
                </span>
              </div>
            )}
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Enter OTP Code</label>
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                placeholder="000000"
                style={otpInputStyle}
              />
            </div>
            <button type="submit" className="btn" style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Checking…' : 'Verify OTP'}</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Forgot Password ──────────────────────────────────────── */}
        {view === 'forgot_password' && (
          <form onSubmit={once(onForgotPasswordSubmit)}>
            <p style={{ fontSize: 13, color: color.textMuted, margin: '0 0 18px' }}>
              Enter your username. If an email is registered, we'll send a reset OTP.
            </p>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Username</label>
              <input value={fpUsername} onChange={(e) => setFpUsername(e.target.value)} required style={input()} />
            </div>
            <button type="submit" className="btn" style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Sending code…' : 'Send Reset OTP'}</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Reset Password ───────────────────────────────────────── */}
        {view === 'reset_password' && (
          <form onSubmit={once(onResetPasswordSubmit)}>
            <div style={{ ...alert('info'), display: 'block' }}>
              📧 A reset OTP has been sent to <strong>{fpEmailHint || 'your registered email'}</strong>.
            </div>
            {fpDevOtp && (
              <div style={{ ...alert('warning'), display: 'block' }}>
                🔧 <strong>Dev mode:</strong> Reset OTP is <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, fontFamily: font.mono }}>{fpDevOtp}</code>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Reset OTP Code</label>
              <input
                value={fpOtp}
                onChange={(e) => setFpOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                placeholder="000000"
                style={otpInputStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>New Password</label>
              <input type="password" value={fpNewPassword} onChange={(e) => setFpNewPassword(e.target.value)} required minLength={8} style={input()} />
              <p style={{ margin: '5px 0 0', fontSize: 11, color: color.textFaint }}>Min 8 characters, must contain letters and numbers</p>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Confirm Password</label>
              <input type="password" value={fpConfirmPassword} onChange={(e) => setFpConfirmPassword(e.target.value)} required minLength={8} style={input()} />
            </div>
            <button type="submit" className="btn" style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Saving…' : 'Reset Password'}</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Forgot Username ──────────────────────────────────────── */}
        {view === 'forgot_username' && (
          <form onSubmit={once(onForgotUsernameSubmit)}>
            <p style={{ fontSize: 13, color: color.textMuted, margin: '0 0 18px' }}>
              Enter your registered email address. If found, your username will be sent to it.
            </p>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Email Address</label>
              <input type="email" value={fuEmail} onChange={(e) => setFuEmail(e.target.value)} required style={input()} />
            </div>
            {fuDevUsername && (
              <div style={{ ...alert('warning'), display: 'block' }}>
                🔧 <strong>Dev mode:</strong> Your username is <code style={{ fontSize: 14, fontWeight: 700, fontFamily: font.mono }}>{fuDevUsername}</code>
              </div>
            )}
            <button type="submit" className="btn" style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>{busy ? 'Sending…' : 'Recover Username'}</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
