import React, { useEffect, useState } from 'react'
import { api, CcVersionInfo, CcUpgradeCheckInfo, CcVersionHistoryEntry } from '../lib/api'

export default function CcUpgradePage() {
  const [version, setVersion] = useState<CcVersionInfo | null>(null)
  const [upgradeInfo, setUpgradeInfo] = useState<CcUpgradeCheckInfo | null>(null)
  const [history, setHistory] = useState<CcVersionHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [v, u, h] = await Promise.all([
        api.getCcVersion(),
        api.checkCcUpgrade(),
        api.getCcVersionHistory(),
      ])
      setVersion(v)
      setUpgradeInfo(u)
      setHistory(h)
    } catch (error) {
      alert(`Error loading data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpgrade() {
    if (!upgradeInfo?.latest_version) return
    if (!confirm(`Upgrade Central Command to ${upgradeInfo.latest_version}?`)) return

    setUpgrading(true)
    try {
      await api.upgradeCc(upgradeInfo.latest_version)
      alert('Upgrade successful. Please refresh the page.')
      setTimeout(() => loadData(), 2000)
    } catch (error) {
      alert(`Upgrade failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUpgrading(false)
    }
  }

  async function handleRollback() {
    if (!confirm('Rollback to previous version?')) return

    setRollingBack(true)
    try {
      await api.rollbackCc()
      alert('Rollback successful. Please refresh the page.')
      setTimeout(() => loadData(), 2000)
    } catch (error) {
      alert(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRollingBack(false)
    }
  }

  if (loading) return <div style={styles.container}>Loading...</div>

  return (
    <div style={styles.container}>
      <h1>Central Command Upgrade</h1>

      {/* Current Version */}
      <div style={styles.card}>
        <h2>Current Version</h2>
        <div style={styles.versionInfo}>
          <p>
            <strong>Version:</strong> {version?.current_version || 'Unknown'}
          </p>
          <p>
            <strong>Status:</strong> {version?.current_status || 'Unknown'}
          </p>
          {version?.last_upgraded_at && (
            <p>
              <strong>Last Upgraded:</strong> {new Date(version.last_upgraded_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Upgrade Info */}
      {upgradeInfo && (
        <div style={styles.card}>
          <h2>Upgrade Available</h2>
          <div style={styles.upgradeInfo}>
            {upgradeInfo.can_upgrade ? (
              <>
                <p style={styles.success}>✓ Update available: {upgradeInfo.latest_version}</p>
                <button onClick={handleUpgrade} disabled={upgrading} style={styles.button}>
                  {upgrading ? 'Upgrading...' : 'Upgrade Now'}
                </button>
              </>
            ) : (
              <p style={styles.info}>✓ {upgradeInfo.reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Rollback */}
      {history.some((h) => h.status === 'previous') && (
        <div style={styles.card}>
          <h2>Rollback</h2>
          <p>Revert to the previous version if needed.</p>
          <button onClick={handleRollback} disabled={rollingBack} style={{ ...styles.button, backgroundColor: '#dc3545' }}>
            {rollingBack ? 'Rolling Back...' : 'Rollback'}
          </button>
        </div>
      )}

      {/* Version History */}
      <div style={styles.card}>
        <h2>Version History</h2>
        {history.length === 0 ? (
          <p>No version history available</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Upgraded At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.version}</td>
                  <td>
                    <span style={getStatusStyle(h.status)}>{h.status}</span>
                  </td>
                  <td>{new Date(h.upgraded_at).toLocaleString()}</td>
                  <td style={{ fontSize: '0.9em', color: '#666' }}>{h.error_message || h.release_notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    backgroundColor: '#f9f9f9',
  },
  versionInfo: {
    backgroundColor: '#f0f8ff',
    padding: '12px',
    borderRadius: '4px',
    marginTop: '12px',
  },
  upgradeInfo: {
    backgroundColor: '#f0f8ff',
    padding: '12px',
    borderRadius: '4px',
    marginTop: '12px',
  },
  success: {
    color: '#28a745',
    marginBottom: '12px',
    fontWeight: 'bold',
  },
  info: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '12px',
  },
}

function getStatusStyle(status: string): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  }

  switch (status) {
    case 'current':
      return { ...baseStyle, backgroundColor: '#d4edda', color: '#155724' }
    case 'previous':
      return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' }
    case 'failed':
      return { ...baseStyle, backgroundColor: '#f8d7da', color: '#721c24' }
    default:
      return baseStyle
  }
}
