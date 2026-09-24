import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ClientVersionDetail, UpgradeInfo, VersionHistory, UpgradeBackup } from '../lib/api'

interface ClientWithUpgradeInfo {
  client_id: string
  client_name: string
  host?: string
  upgrade_info: UpgradeInfo
}

export function VersionManagementPage() {
  const [clients, setClients] = useState<ClientWithUpgradeInfo[]>([])
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [versionHistory, setVersionHistory] = useState<VersionHistory[]>([])
  const [backupHistory, setBackupHistory] = useState<UpgradeBackup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    try {
      setLoading(true)
      const data = await api.listClientVersions()
      setClients(data.clients as ClientWithUpgradeInfo[])
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function loadClientDetails(clientId: string) {
    try {
      setDetailLoading(true)
      const [history, backups] = await Promise.all([
        api.getVersionHistory(clientId),
        api.getBackupHistory(clientId),
      ])
      setVersionHistory(history.history)
      setBackupHistory(backups.backups)
      setSelectedClient(clientId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleUpgrade(clientId: string, targetVersion: string) {
    if (!confirm(`Upgrade ${clientId} to ${targetVersion}?\n\nA backup will be created automatically.`)) {
      return
    }

    try {
      setUpgrading(true)
      setError(null)
      await api.upgradeClientInstance(clientId, targetVersion)
      alert('Upgrade initiated successfully!')
      // Reload clients to refresh versions
      await loadClients()
      if (selectedClient === clientId) {
        await loadClientDetails(clientId)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUpgrading(false)
    }
  }

  async function handleRollback(clientId: string) {
    if (!confirm(`Rollback ${clientId} to previous version?\n\nThis will restore from the latest backup.`)) {
      return
    }

    try {
      setRollingBack(true)
      setError(null)
      await api.rollbackClientInstance(clientId)
      alert('Rollback completed successfully!')
      // Reload clients to refresh versions
      await loadClients()
      if (selectedClient === clientId) {
        await loadClientDetails(clientId)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRollingBack(false)
    }
  }

  const selectedClientData = clients.find((c) => c.client_id === selectedClient)

  if (loading) {
    return (
      <div className="page-wrapper">
        <h1>Version Management</h1>
        <div className="loading">Loading clients...</div>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      <h1>Version Management & Upgrades</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="version-management-container">
        {/* Client List */}
        <div className="client-list">
          <h2>Client Instances</h2>
          <div className="client-list-table">
            <table>
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th>Current Version</th>
                  <th>Latest Version</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      No clients found
                    </td>
                  </tr>
                ) : (
                  clients.map((client) => (
                    <tr key={client.client_id} className={selectedClient === client.client_id ? 'selected' : ''}>
                      <td className="client-name">{client.client_name}</td>
                      <td>
                        <code>{client.upgrade_info.current_version || 'unknown'}</code>
                      </td>
                      <td>
                        <code>{client.upgrade_info.latest_available || 'unknown'}</code>
                      </td>
                      <td>
                        {client.upgrade_info.can_upgrade ? (
                          <span className="status-badge badge-warning">Upgrade Available</span>
                        ) : (
                          <span className="status-badge badge-ok">Up to Date</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => loadClientDetails(client.client_id)}
                          className="btn btn-sm btn-secondary"
                        >
                          {selectedClient === client.client_id ? 'Showing Details' : 'View Details'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Details */}
        {selectedClientData && (
          <div className="client-details">
            <h2>Details: {selectedClientData.client_name}</h2>

            {detailLoading ? (
              <div className="loading">Loading details...</div>
            ) : (
              <>
                {/* Upgrade Actions */}
                <div className="upgrade-actions card">
                  <h3>Upgrade Options</h3>
                  <div className="info-grid">
                    <div className="info-row">
                      <span className="label">Current Version:</span>
                      <code>{selectedClientData.upgrade_info.current_version || 'unknown'}</code>
                    </div>
                    <div className="info-row">
                      <span className="label">Latest Available:</span>
                      <code>{selectedClientData.upgrade_info.latest_available || 'unknown'}</code>
                    </div>
                    <div className="info-row">
                      <span className="label">Previous Version:</span>
                      <code>{selectedClientData.upgrade_info.previous_version || 'none'}</code>
                    </div>
                  </div>

                  {selectedClientData.upgrade_info.latest_release.release_notes && (
                    <div className="release-notes">
                      <h4>Release Notes</h4>
                      <pre>{selectedClientData.upgrade_info.latest_release.release_notes}</pre>
                    </div>
                  )}

                  <div className="action-buttons">
                    {selectedClientData.upgrade_info.can_upgrade && selectedClientData.upgrade_info.latest_available && (
                      <button
                        onClick={() =>
                          handleUpgrade(selectedClientData.client_id, selectedClientData.upgrade_info.latest_available!)
                        }
                        disabled={upgrading}
                        className="btn btn-primary"
                      >
                        {upgrading ? 'Upgrading...' : `Upgrade to ${selectedClientData.upgrade_info.latest_available}`}
                      </button>
                    )}

                    {selectedClientData.upgrade_info.can_rollback && (
                      <button
                        onClick={() => handleRollback(selectedClientData.client_id)}
                        disabled={rollingBack}
                        className="btn btn-warning"
                      >
                        {rollingBack
                          ? 'Rolling back...'
                          : `Rollback to ${selectedClientData.upgrade_info.previous_version}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Version History */}
                <div className="version-history card">
                  <h3>Version History</h3>
                  {versionHistory.length === 0 ? (
                    <p className="muted">No version history</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Status</th>
                          <th>Deployed At</th>
                          <th>Deployed By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versionHistory.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <code>{v.version}</code>
                            </td>
                            <td>
                              <span
                                className={`status-badge ${
                                  v.status === 'current'
                                    ? 'badge-ok'
                                    : v.status === 'failed'
                                      ? 'badge-danger'
                                      : 'badge-info'
                                }`}
                              >
                                {v.status}
                              </span>
                            </td>
                            <td>{new Date(v.deployed_at).toLocaleString()}</td>
                            <td>{v.deployed_by || 'system'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Backup History */}
                <div className="backup-history card">
                  <h3>Backup History</h3>
                  {backupHistory.length === 0 ? (
                    <p className="muted">No backups</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>From</th>
                          <th>To</th>
                          <th>Status</th>
                          <th>Size</th>
                          <th>Created</th>
                          <th>Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupHistory.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <code>{b.from_version}</code>
                            </td>
                            <td>
                              <code>{b.to_version}</code>
                            </td>
                            <td>
                              <span
                                className={`status-badge ${
                                  b.status === 'completed'
                                    ? 'badge-ok'
                                    : b.status === 'failed'
                                      ? 'badge-danger'
                                      : b.status === 'restored'
                                        ? 'badge-info'
                                        : 'badge-warn'
                                }`}
                              >
                                {b.status}
                              </span>
                            </td>
                            <td>{b.backup_size_bytes ? `${(b.backup_size_bytes / 1024 / 1024).toFixed(2)} MB` : '-'}</td>
                            <td>{new Date(b.created_at).toLocaleString()}</td>
                            <td>{b.completed_at ? new Date(b.completed_at).toLocaleString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .version-management-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 20px;
        }

        .client-list,
        .client-details {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .client-list-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .client-list-table tbody tr {
          border-bottom: 1px solid #e0e0e0;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .client-list-table tbody tr:hover {
          background-color: #f5f5f5;
        }

        .client-list-table tbody tr.selected {
          background-color: #f0f7ff;
          border-left: 3px solid var(--accent);
        }

        .client-list-table th,
        .client-list-table td {
          padding: 12px 8px;
          text-align: left;
        }

        .client-name {
          font-weight: 600;
        }

        .upgrade-actions {
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
        }

        .info-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 12px 0;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }

        .info-row .label {
          font-weight: 600;
          min-width: 150px;
        }

        .info-row code {
          font-family: 'Courier New', monospace;
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 12px;
        }

        .release-notes {
          background: #f9f9f9;
          padding: 12px;
          border-radius: 4px;
          margin: 12px 0;
          max-height: 200px;
          overflow-y: auto;
        }

        .release-notes pre {
          margin: 0;
          font-size: 11px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .action-buttons button {
          flex: 1;
        }

        .version-history,
        .backup-history {
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
        }

        .version-history table,
        .backup-history table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .version-history th,
        .version-history td,
        .backup-history th,
        .backup-history td {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #e0e0e0;
        }

        .version-history th,
        .backup-history th {
          background: #f5f5f5;
          font-weight: 600;
        }

        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge-ok {
          background: #d4edda;
          color: #155724;
        }

        .badge-warning,
        .badge-warn {
          background: #fff3cd;
          color: #856404;
        }

        .badge-danger {
          background: #f8d7da;
          color: #721c24;
        }

        .badge-info {
          background: #d1ecf1;
          color: #0c5460;
        }

        .muted {
          color: #999;
          font-size: 13px;
        }

        .loading {
          padding: 20px;
          text-align: center;
          color: #666;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 13px;
        }

        .alert-error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        @media (max-width: 1200px) {
          .version-management-container {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
