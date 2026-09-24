import { useCallback } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { color, h1, pageHeader } from '../lib/theme'
import UpgradeConsole from '../components/UpgradeConsole'

export default function CcUpgradePage() {
  const { user } = useAuth()
  const load = useCallback(() => api.getCcUpgradeStatus(), [])

  return (
    <div>
      <div style={pageHeader()}>
        <h1 style={h1()}>CC Upgrade</h1>
      </div>
      <p style={{ fontSize: 12.5, color: color.textMuted, margin: '0 0 16px', maxWidth: 680 }}>
        Upgrades this Central Command server to the latest commit on <code>main</code>. The request is
        picked up within a minute by the upgrade agent on the server, which runs the same
        <code> scripts/upgrade.sh</code> you would by hand: database backup, pull, rebuild, migrate,
        smoke test. Data is never restored -- only migrated forward.
      </p>
      <UpgradeConsole
        subject="this Central Command server"
        load={load}
        upgrade={() => api.requestCcUpgrade()}
        rollback={() => api.requestCcRollback()}
        cancel={(id) => api.cancelCcUpgrade(id)}
        canAct={user?.role === 'super_admin'}
      />
    </div>
  )
}
