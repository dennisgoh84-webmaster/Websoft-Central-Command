import { useState, type FormEvent } from 'react'
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
          <form onSubmit={onLoginSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required style={input()} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={input()} />
            </div>
            <button type="submit" className="btn" style={btnStyle}>Sign In</button>
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
          <form onSubmit={onOtpSubmit}>
            <div style={{ ...alert('info'), display: 'block' }}>
              📧 A 6-digit OTP has been sent to <strong>{emailHint || 'your registered email'}</strong>.
              <br />Enter it below to complete login.
            </div>
            {devOtp && (
              <div style={{ ...alert('warning'), display: 'block' }}>
                🔧 <strong>Dev mode:</strong> OTP is <code style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, fontFamily: font.mono }}>{devOtp}</code>
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
            <button type="submit" className="btn" style={btnStyle}>Verify OTP</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Forgot Password ──────────────────────────────────────── */}
        {view === 'forgot_password' && (
          <form onSubmit={onForgotPasswordSubmit}>
            <p style={{ fontSize: 13, color: color.textMuted, margin: '0 0 18px' }}>
              Enter your username. If an email is registered, we'll send a reset OTP.
            </p>
            <div style={{ marginBottom: 22 }}>
              <label style={fieldLabel}>Username</label>
              <input value={fpUsername} onChange={(e) => setFpUsername(e.target.value)} required style={input()} />
            </div>
            <button type="submit" className="btn" style={btnStyle}>Send Reset OTP</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Reset Password ───────────────────────────────────────── */}
        {view === 'reset_password' && (
          <form onSubmit={onResetPasswordSubmit}>
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
            <button type="submit" className="btn" style={btnStyle}>Reset Password</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}

        {/* ── Forgot Username ──────────────────────────────────────── */}
        {view === 'forgot_username' && (
          <form onSubmit={onForgotUsernameSubmit}>
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
            <button type="submit" className="btn" style={btnStyle}>Recover Username</button>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" onClick={goBack} style={linkStyle}>← Back to Login</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
