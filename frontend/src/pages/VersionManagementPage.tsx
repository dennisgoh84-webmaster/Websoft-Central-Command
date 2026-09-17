import React, { useEffect, useState } from 'react'
import { api, ClientVersionDetail, UpgradeBackup, VersionHistory } from '../lib/api'

export default function VersionManagementPage() {
  const [clients, setClients] = useState<ClientVersionDetail[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<ClientVersionDetail | null>(null)
  const [versionHistory, setVersionHistory] = useState<VersionHistory[]>([])
  const [backupHistory, setBackupHistory] = useState<UpgradeBackup[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  useEffect(() => {
    if (selectedClientId) {
      loadClientDetails(selectedClientId)
    }
  }, [selectedClientId])

  async function loadClients() {
    setLoading(true)
    try {
      const data = await api.listClientVersions()
      setClients(data)
    } catch (error) {
      alert(`Error loading clients: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadClientDetails(clientId: string) {
    try {
      const [details, history, backups] = await Promise.all([
        api.getUpgradeInfo(clientId),
        api.getVersionHistory(clientId),
        api.getBackupHistory(clientId),
      ])
      setSelectedClient(details)
      setVersionHistory(history)
      setBackupHistory(backups)
    } catch (error) {
      alert(`Error loading details: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function handleUpgrade() {
    if (!selectedClient) return
    if (!confirm(`Upgrade ${selectedClient.client_code} to ${selectedClient.latest_version}?`)) return

    setUpgrading(true)
    try {
      await api.upgradeClientInstance(selectedClient.client_id, selectedClient.latest_version)
      alert('Upgrade initiated. Please wait for completion.')
      setTimeout(() => loadClientDetails(selectedClient.client_id), 2000)
    } catch (error) {
      alert(`Upgrade failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUpgrading(false)
    }
  }

  async function handleRollback() {
    if (!selectedClient) return
    if (!confirm(`Rollback ${selectedClient.client_code} to previous version?`)) return

    setRollingBack(true)
    try {
      await api.rollbackClientInstance(selectedClient.client_id)
      alert('Rollback initiated. Please wait for completion.')
      setTimeout(() => loadClientDetails(selectedClient.client_id), 2000)
    } catch (error) {
      alert(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRollingBack(false)
    }
  }

  if (loading) return <div style={styles.container}>Loading...</div>

  return (
    <div style={styles.container}>
      <h1>Client Version Management</h1>

      <div style={styles.grid}>
        {/* Clients List */}
        <div style={styles.leftPanel}>
          <h2>Clients</h2>
          <div style={styles.clientsList}>
            {clients.length === 0 ? (
              <p>No clients available</p>
            ) : (
              clients.map((client) => (
                <div
                  key={client.client_id}
                  onClick={() => setSelectedClientId(client.client_id)}
                  style={{
                    ...styles.clientItem,
                    backgroundColor: selectedClientId === client.client_id ? '#e3f2fd' : '#fff',
                    borderLeft: selectedClientId === client.client_id ? '4px solid #007bff' : '4px solid transparent',
                  }}
                >
                  <p style={{ margin: '0 0 4px', fontWeight: 'bold' }}>{client.client_code}</p>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666' }}>Current: {client.current_version}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Latest: {client.latest_version}</p>
                  {client.can_upgrade && <span style={styles.upgradeBadge}>Update Available</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Details Panel */}
        {selectedClient && (
          <div style={styles.rightPanel}>
            <h2>{selectedClient.client_code} - Version Management</h2>

            <div style={styles.card}>
              <h3>Version Information</h3>
              <p>
                <strong>Current:</strong> {selectedClient.current_version}
              </p>
              <p>
                <strong>Latest:</strong> {selectedClient.latest_version}
              </p>
              {selectedClient.can_upgrade && (
                <button onClick={handleUpgrade} disabled={upgrading} style={styles.button}>
                  {upgrading ? 'Upgrading...' : 'Upgrade Now'}
                </button>
              )}
              {selectedClient.can_rollback && (
                <button
                  onClick={handleRollback}
                  disabled={rollingBack}
                  style={{ ...styles.button, marginLeft: '8px', backgroundColor: '#dc3545' }}
                >
                  {rollingBack ? 'Rolling Back...' : 'Rollback'}
                </button>
              )}
            </div>

            {selectedClient.release_notes && (
              <div style={styles.card}>
                <h3>Release Notes</h3>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
                  {selectedClient.release_notes}
                </pre>
              </div>
            )}

            <div style={styles.card}>
              <h3>Version History</h3>
              {versionHistory.length === 0 ? (
                <p>No version history</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Upgraded At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionHistory.map((h) => (
                      <tr key={h.version_history_id}>
                        <td>{h.version}</td>
                        <td>
                          <span style={getStatusStyle(h.status)}>{h.status}</span>
                        </td>
                        <td>{new Date(h.upgraded_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={styles.card}>
              <h3>Backup History</h3>
              {backupHistory.length === 0 ? (
                <p>No backups available</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Status</th>
                      <th>Backup Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupHistory.map((b) => (
                      <tr key={b.backup_id}>
                        <td>{b.from_version}</td>
                        <td>{b.to_version}</td>
                        <td>
                          <span style={getStatusStyle(b.status)}>{b.status}</span>
                        </td>
                        <td style={{ fontSize: '11px', wordBreak: 'break-word' }}>{b.backup_path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginTop: '24px',
  },
  leftPanel: {
    borderRight: '1px solid #ddd',
    paddingRight: '24px',
  },
  rightPanel: {
    paddingLeft: '24px',
  },
  clientsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  clientItem: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: '#fff',
    transition: 'background-color 0.2s',
  },
  upgradeBadge: {
    display: 'inline-block',
    backgroundColor: '#ffc107',
    color: '#000',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 'bold',
    marginTop: '4px',
  },
  card: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    backgroundColor: '#f9f9f9',
  },
  button: {
    padding: '10px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    marginTop: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '12px',
    fontSize: '12px',
  },
}

function getStatusStyle(status: string): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
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
