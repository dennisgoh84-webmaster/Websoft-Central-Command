import { useCallback, useEffect, useState } from 'react'
import type { UpgradeRequest, UpgradeStatus } from '../lib/api'
import { formatDateTime } from '../lib/format'
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

const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 10) : '—')

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

  const refresh = useCallback(async () => {
    try {
      setStatus(await load())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [load])

  useEffect(() => { refresh() }, [refresh])

  // Poll fast while something is in flight (the backend restarts
  // mid-upgrade, so a failed poll is expected and just retried).
  const active = status?.active ?? null
  useEffect(() => {
    const id = setInterval(refresh, active ? 5000 : 30000)
    return () => clearInterval(id)
  }, [refresh, active])

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
          <p style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, margin: '8px 0 4px' }}>{short(agent?.current_sha)}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{agent?.current_subject ?? '—'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: color.textMuted }}>
            {agent?.current_committed_at ? `committed ${formatDateTime(agent.current_committed_at)}` : ''}
          </p>
        </div>
        <div style={card({ padding: 18 })}>
          <h2 style={h2()}>Latest on main</h2>
          <p style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 600, margin: '8px 0 4px' }}>{short(agent?.remote_sha)}</p>
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={badge(statusTone(active.status))}>{active.status}</span>
              <strong style={{ fontSize: 13.5 }}>
                {active.kind === 'rollback' ? 'Rollback' : 'Upgrade'} to <code style={{ fontFamily: font.mono }}>{short(active.target_ref)}</code>
              </strong>
              <span style={{ fontSize: 12, color: color.textMuted }}>
                requested {formatDateTime(active.requested_at)}
                {active.started_at ? ` · started ${formatDateTime(active.started_at)}` : ' · waiting for the agent'}
              </span>
              {active.status === 'pending' && canAct && (
                <button onClick={() => act(() => cancel(active.id), 'Cancel this request?')} disabled={busy} className="btn" style={{ ...button('secondary', 'sm'), marginLeft: 'auto' }}>Cancel</button>
              )}
            </div>
            {active.status === 'running' && (
              <p style={{ fontSize: 12.5, color: color.textMuted, margin: '10px 0 0' }}>
                The host is backing up the database, pulling the code and rebuilding the containers. The
                API here will be unreachable for a moment while it restarts -- this page keeps polling.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => act(upgrade, `Upgrade ${subject} to the latest commit on main (${short(agent?.remote_sha)})?\n\nThe database is backed up first and only migrated forward -- never restored.`)}
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
            <pre style={{ margin: 0, padding: 14, background: '#111827', color: '#e5e7eb', fontFamily: font.mono, fontSize: 11.5, lineHeight: 1.5, maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{r.log}</pre>
          </td>
        </tr>
      )}
    </>
  )
}
