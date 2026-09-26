import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpgradeRequest, UpgradeStatus } from '../lib/api'
import { formatDateTime, shortSha as short, versionLabel } from '../lib/format'
import { alert, badge, button, card, color, dismissButton, font, h2, table, td, th, type Tone } from '../lib/theme'

// The one upgrade screen, used for Central Command itself and for each
// client. Nothing here runs an upgrade: it queues a request that the
// install's own host agent performs (see backend CcUpgradeController /
// docs/central-command-schema-contract.md §1b), then polls until done.

interface Props {
  load: () => Promise<UpgradeStatus>
  upgrade: () => Promise<UpgradeStatus>
  rollback: () => Promise<UpgradeStatus>
  cancel: (requestId: string) => Promise<UpgradeStatus>
  canAct: boolean
  subject: string
}

// upgrade.sh prints its steps as bold "==> Step" lines; drop the colour codes.
const cleanLog = (log: string | null | undefined) => (log ?? '').replace(/\x1b\[[0-9;]*m/g, '')

function currentStep(log: string): string {
  const steps = [...log.matchAll(/^==> (.+)$/gm)]
  return steps.length ? steps[steps.length - 1][1].trim() : 'Starting'
}

function elapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return ''
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

function statusTone(status: string): Tone {
  switch (status) {
    case 'succeeded': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'info'
    case 'pending': return 'warning'
    default: return 'neutral'
  }
}

export default function UpgradeConsole({ load, upgrade, rollback, cancel, canAct, subject }: Props) {
  const [status, setStatus] = useState<UpgradeStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [openLog, setOpenLog] = useState<string | null>(null)
  // A failed poll while an upgrade is in flight is expected (the backend
  // restarts part-way through), so it shows as "reconnecting", not an error.
  const [reconnecting, setReconnecting] = useState(false)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const next = await load()
      inFlight.current = next.active !== null
      setStatus(next)
      setError('')
      setReconnecting(false)
    } catch (err) {
      if (inFlight.current) setReconnecting(true)
      else setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [load])

  useEffect(() => { refresh() }, [refresh])

  // Poll fast while something is in flight (the backend restarts
  // mid-upgrade, so a failed poll is expected and just retried).
  const active = status?.active ?? null
  useEffect(() => {
    const every = active?.status === 'running' ? 3000 : active ? 5000 : 30000
    const id = setInterval(refresh, every)
    return () => clearInterval(id)
  }, [refresh, active?.status, active])

  async function act(fn: () => Promise<UpgradeStatus>, confirmText: string) {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      setStatus(await fn())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <p style={{ color: color.textMuted }}>{error || 'Loading…'}</p>

  const agent = status.agent

  return (
    <div>
      {error && (
        <div style={alert('danger')}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={dismissButton()}>✕</button>
        </div>
      )}

      {!status.supported && (
        <div style={alert('warning')}><span>{status.message}</span></div>
      )}

      {status.supported && !status.agent_online && (
        <div style={alert('warning')}>
          <span>
            The upgrade agent on {subject} has not reported in
            {agent?.last_heartbeat_at ? ` since ${formatDateTime(agent.last_heartbeat_at)}` : ' yet'}.
            Requests will wait until it does (it runs once a minute when the host is up).
          </span>
        </div>
      )}

      {/* Where it is */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card({ padding: 18 })}>
          <h2 style={h2()}>Running now</h2>
          {/* Same wording as the ERP's login screen, so the two tally. */}
          <p style={{ fontSize: 18, fontWeight: 600, margin: '8px 0 4px' }}>{versionLabel(agent?.current_sha, agent?.current_committed_at)}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{agent?.current_subject ?? '—'}</p>
        </div>
        <div style={card({ padding: 18 })}>
          <h2 style={h2()}>Latest on main</h2>
          <p style={{ fontSize: 18, fontWeight: 600, margin: '8px 0 4px' }}>{versionLabel(agent?.remote_sha, agent?.remote_committed_at)}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{agent?.remote_subject ?? '—'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>
            {agent?.remote_sha == null ? (
              <span style={{ color: color.textMuted }}>not fetched yet</span>
            ) : agent.commits_behind > 0 ? (
              <span style={badge('warning')}>{agent.commits_behind} commit{agent.commits_behind === 1 ? '' : 's'} behind</span>
            ) : (
              <span style={badge('success')}>Up to date</span>
            )}
          </p>
        </div>
      </div>

      {/* Actions / in-flight */}
      <div style={card({ padding: 18, marginBottom: 16 })}>
        {active ? (
          <LiveRun
            active={active}
            reconnecting={reconnecting}
            onCancel={active.status === 'pending' && canAct ? () => act(() => cancel(active.id), 'Cancel this request?') : undefined}
            busy={busy}
          />
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => act(upgrade, `Upgrade ${subject} to ${versionLabel(agent?.remote_sha, agent?.remote_committed_at)} (the latest on main)?\n\nThe database is backed up first and only migrated forward -- never restored.`)}
              disabled={busy || !canAct || !status.can_upgrade}
              className="btn"
              style={button('primary')}
            >
              Upgrade to latest
            </button>
            <button
              onClick={() => act(rollback, `Roll ${subject} back to ${short(status.rollback_to)} (the commit before the last successful upgrade)?\n\nCode only -- the database keeps its current data.`)}
              disabled={busy || !canAct || !status.can_rollback}
              className="btn"
              style={button('danger')}
            >
              Roll back{status.rollback_to ? ` to ${short(status.rollback_to)}` : ''}
            </button>
            <span style={{ fontSize: 12, color: color.textMuted }}>
              {!canAct ? 'Only super admins can start an upgrade.'
                : !status.supported ? ''
                : status.can_upgrade ? 'Runs within a minute of the request.'
                : 'Already on the latest commit.'}
            </span>
          </div>
        )}
      </div>

      {/* History */}
      <div style={card({ padding: 0, overflow: 'hidden' })}>
        <table style={table()}>
          <thead>
            <tr>
              <th style={th()}>When</th>
              <th style={th()}>Action</th>
              <th style={th()}>From → To</th>
              <th style={th()}>Status</th>
              <th style={th()}>By</th>
              <th style={th()}>Log</th>
            </tr>
          </thead>
          <tbody>
            {status.history.map((r: UpgradeRequest) => (
              <HistoryRow key={r.id} r={r} open={openLog === r.id} toggle={() => setOpenLog(openLog === r.id ? null : r.id)} />
            ))}
            {status.history.length === 0 && (
              <tr><td colSpan={6} style={td({ padding: 22, textAlign: 'center', color: color.textMuted })}>No upgrades requested yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HistoryRow({ r, open, toggle }: { r: UpgradeRequest; open: boolean; toggle: () => void }) {
  return (
    <>
      <tr className="tr" style={{ borderBottom: `1px solid ${color.border}` }}>
        <td style={td({ whiteSpace: 'nowrap' })}>{formatDateTime(r.requested_at)}</td>
        <td style={td({ textTransform: 'capitalize' })}>{r.kind}</td>
        <td style={td({ fontFamily: font.mono, fontSize: 11.5 })}>{short(r.from_sha)} → {short(r.to_sha ?? r.target_ref)}</td>
        <td style={td()}>
          <span style={badge(statusTone(r.status))}>{r.status}</span>
          {r.error && <div style={{ fontSize: 11.5, color: color.danger, marginTop: 4 }}>{r.error}</div>}
        </td>
        <td style={td({ fontSize: 12 })}>{r.requested_by?.replace(/^central-command:/, 'CC ') ?? '—'}</td>
        <td style={td()}>
          {r.log ? <button onClick={toggle} className="btn" style={button('secondary', 'sm')}>{open ? 'Hide' : 'View'}</button> : <span style={{ color: color.textFaint }}>—</span>}
        </td>
      </tr>
      {open && r.log && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <pre style={{ margin: 0, padding: 14, background: '#111827', color: '#e5e7eb', fontFamily: font.mono, fontSize: 11.5, lineHeight: 1.5, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{cleanLog(r.log)}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * The request in flight, live (Dennis, 2026-09-25: "a live running status
 * so that we know it's running"): a pulsing status, a clock counting up
 * since it started, the step upgrade.sh is on, and its output so far --
 * the host agent posts the log every few seconds while it runs.
 */
function LiveRun({ active, reconnecting, onCancel, busy }: {
  active: UpgradeRequest
  reconnecting: boolean
  onCancel?: () => void
  busy: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const running = active.status === 'running'
  const log = cleanLog(active.log)
  const lines = log.split('\n')
  const tail = lines.slice(-400).join('\n')
  const step = running ? currentStep(log) : 'Waiting for the upgrade agent to pick it up (it checks once a minute)'

  // Keep the log scrolled to the newest line unless the reader scrolled up.
  const box = useRef<HTMLPreElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    if (box.current && stick.current) box.current.scrollTop = box.current.scrollHeight
  }, [tail])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className={`live-dot ${running ? 'live-dot-running' : 'live-dot-pending'}`} aria-hidden />
        <span style={badge(statusTone(active.status))}>{running ? 'Running' : 'Queued'}</span>
        <strong style={{ fontSize: 13.5 }}>
          {active.kind === 'rollback' ? 'Rollback' : 'Upgrade'} to <code style={{ fontFamily: font.mono }}>{short(active.target_ref)}</code>
        </strong>
        <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 600 }}>
          {elapsed(running ? active.started_at : active.requested_at, now)}
        </span>
        <span style={{ fontSize: 12, color: color.textMuted }}>
          requested {formatDateTime(active.requested_at)}
          {active.started_at ? ` · started ${formatDateTime(active.started_at)}` : ''}
        </span>
        {onCancel && (
          <button onClick={onCancel} disabled={busy} className="btn" style={{ ...button('secondary', 'sm'), marginLeft: 'auto' }}>Cancel</button>
        )}
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 600 }}>
        {running ? 'Now: ' : ''}{step}
        {running && <span className="live-ellipsis" aria-hidden />}
      </p>
      {reconnecting && (
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: color.textMuted }}>
          Reconnecting… the server is restarting as part of the upgrade; this page keeps checking.
        </p>
      )}

      {running && (
        <pre
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          style={{
            margin: '12px 0 0', padding: 12, background: '#111827', color: '#e5e7eb', borderRadius: 8,
            fontFamily: font.mono, fontSize: 11.5, lineHeight: 1.5, height: 260, overflow: 'auto', whiteSpace: 'pre-wrap',
          }}
        >
          {tail || 'Waiting for the first output…'}
        </pre>
      )}
    </div>
  )
}
