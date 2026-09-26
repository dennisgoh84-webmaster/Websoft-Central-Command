import { useCallback, useEffect, useState } from 'react'
import { api, type ClientUpgradeListItem, type UpgradeStatus } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { versionLabel } from '../lib/format'
import { badge, card, color, font, h1, pageHeader } from '../lib/theme'
import UpgradeConsole from '../components/UpgradeConsole'

// Per-client status, fetched in parallel after the (instant) registry
// list, since each one is a live connection to that client's database
// and an unreachable client must not hold up the others.
type Probe = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; status: UpgradeStatus }

export default function VersionManagementPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientUpgradeListItem[]>([])
  const [probes, setProbes] = useState<Record<string, Probe>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const probeAll = useCallback((list: ClientUpgradeListItem[]) => {
    for (const c of list) {
      setProbes((p) => ({ ...p, [c.id]: p[c.id] ?? { state: 'loading' } }))
      api.getClientUpgradeStatus(c.id)
        .then((status) => setProbes((p) => ({ ...p, [c.id]: { state: 'ok', status } })))
        .catch((err) => setProbes((p) => ({ ...p, [c.id]: { state: 'error', message: err instanceof Error ? err.message : 'Unreachable' } })))
    }
  }, [])

  useEffect(() => {
    api.listClientUpgrades().then((rows) => {
      setClients(rows)
      setSelectedId((cur) => cur ?? rows[0]?.id ?? null)
      probeAll(rows)
    })
  }, [probeAll])

  useEffect(() => {
    const id = setInterval(() => probeAll(clients), 30000)
    return () => clearInterval(id)
  }, [clients, probeAll])

  const selected = clients.find((c) => c.id === selectedId) ?? null
  const selectedProbe = selectedId ? probes[selectedId] : undefined
  const load = useCallback(() => api.getClientUpgradeStatus(selectedId as string), [selectedId])

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>Client Upgrades</h1>
      </div>
      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 16px', maxWidth: 720 }}>
        Upgrades a client's ERP install to the latest commit on its <code>main</code>. Central Command only
        queues the request in the client's database; the upgrade agent on the client's own server performs it
        with its <code>deploy/upgrade.sh</code> (backup, pull, rebuild, migrate) and reports back here.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={card({ padding: 0, overflow: 'hidden' })}>
          {clients.map((c) => {
            const active = c.id === selectedId
            const probe = probes[c.id]
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="btn"
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 0,
                  borderBottom: `1px solid ${color.border}`, borderLeft: `3px solid ${active ? color.brand : 'transparent'}`,
                  background: active ? color.brandSoftBg : '#fff', cursor: 'pointer', fontFamily: font.sans,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong style={{ fontSize: 13.5 }}>{c.name}</strong>
                  <span style={{ fontSize: 11, color: color.textMuted }}>{c.code}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 11 }}>
                  <ProbeBadges probe={probe} neverConnected={c.last_connected_at === null} />
                </div>
              </button>
            )
          })}
          {clients.length === 0 && <p style={{ padding: 16, margin: 0, color: color.textMuted }}>Loading clients…</p>}
        </div>

        <div>
          {selected && selectedId ? (
            selectedProbe?.state === 'error' ? (
              <div style={card({ padding: 18 })}>
                <strong>{selected.last_connected_at === null ? `${selected.name} has never been connected -- check its database details on the Clients page.` : `${selected.name} is unreachable.`}</strong>
                <p style={{ fontSize: 12.5, color: color.textMuted, margin: '6px 0 0' }}>{selectedProbe.message}</p>
              </div>
            ) : (
              <UpgradeConsole
                key={selectedId}
                subject={selected.name}
                load={load}
                upgrade={() => api.requestClientUpgrade(selectedId)}
                rollback={() => api.requestClientRollback(selectedId)}
                cancel={(rid) => api.cancelClientUpgrade(selectedId, rid)}
                canAct={user?.role === 'super_admin'}
              />
            )
          ) : (
            <p style={{ color: color.textMuted }}>Select a client.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ProbeBadges({ probe, neverConnected }: { probe: Probe | undefined; neverConnected: boolean }) {
  if (!probe || probe.state === 'loading') return <span style={{ color: color.textFaint }}>checking…</span>
  if (probe.state === 'error') {
    // A client that has never been reached is most likely not set up yet, not down.
    return <span style={badge(neverConnected ? 'neutral' : 'danger')}>{neverConnected ? 'Never connected' : 'Unreachable'}</span>
  }
  const s = probe.status
  const behind = s.agent?.commits_behind ?? 0
  return (
    <>
      {!s.supported ? <span style={badge('neutral')}>Not supported yet</span>
        : s.active ? <span style={badge(s.active.status === 'running' ? 'info' : 'warning')}>{s.active.status}</span>
        : behind > 0 ? <span style={badge('warning')}>{behind} behind</span>
        : <span style={badge('success')}>Up to date</span>}
      {s.supported && !s.agent_online && <span style={badge('danger')}>Agent offline</span>}
      {/* Same wording as that client's login screen, so the two tally. */}
      {s.agent?.current_sha && (
        <span style={{ color: color.textMuted, width: '100%' }}>{versionLabel(s.agent.current_sha, s.agent.current_committed_at)}</span>
      )}
    </>
  )
}
