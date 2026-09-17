<?php

namespace App\Services;

use App\Models\Client;
use App\Models\VersionHistory;
use App\Models\UpgradeBackup;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Exception;

class VersionManagementService
{
    private GitHubVersionProvider $githubProvider;

    public function __construct(GitHubVersionProvider $githubProvider)
    {
        $this->githubProvider = $githubProvider;
    }

    /**
     * Get current version of a client
     */
    public function getCurrentVersion(Client $client): ?string
    {
        $versionHistory = VersionHistory::getCurrentVersion($client->id);
        return $versionHistory?->version;
    }

    /**
     * Get available upgrade options for a client
     */
    public function getUpgradeInfo(Client $client): array
    {
        $current = $this->getCurrentVersion($client);
        $latest = $this->githubProvider->getLatestRelease();

        $canUpgrade = false;
        if ($latest['version'] && $current) {
            $canUpgrade = $this->githubProvider->compareVersions($current, $latest['version']) < 0;
        }

        return [
            'current_version' => $current,
            'latest_available' => $latest['version'] ?? null,
            'can_upgrade' => $canUpgrade,
            'latest_release' => $latest,
            'previous_version' => VersionHistory::getPreviousVersion($client->id)?->version,
            'can_rollback' => VersionHistory::getPreviousVersion($client->id) !== null,
        ];
    }

    /**
     * Initiate an upgrade for a client
     */
    public function initiateUpgrade(Client $client, string $targetVersion, ?string $adminId = null): array
    {
        try {
            $current = $this->getCurrentVersion($client);

            if (!$current) {
                throw new Exception('Cannot determine current version');
            }

            if ($current === $targetVersion) {
                throw new Exception('Target version is same as current version');
            }

            // Create backup record
            $backup = UpgradeBackup::create([
                'id' => Str::uuid(),
                'client_id' => $client->id,
                'from_version' => $current,
                'to_version' => $targetVersion,
                'backup_type' => 'full',
                'backup_path' => "backups/{$client->id}/{$current}/" . now()->format('YmdHis'),
                'status' => 'pending',
                'created_at' => now(),
            ]);

            // Call client's upgrade endpoint
            $upgradeResponse = $this->callClientUpgradeEndpoint($client, [
                'action' => 'upgrade',
                'target_version' => $targetVersion,
                'backup_id' => $backup->id,
            ]);

            if (!$upgradeResponse['success']) {
                $backup->update([
                    'status' => 'failed',
                    'error_message' => $upgradeResponse['error'] ?? 'Unknown error',
                    'completed_at' => now(),
                ]);

                throw new Exception('Client upgrade failed: ' . ($upgradeResponse['error'] ?? 'Unknown error'));
            }

            // Mark old version as previous, create new current version
            VersionHistory::where('client_id', $client->id)
                ->where('status', 'current')
                ->update(['status' => 'previous']);

            $versionHistory = VersionHistory::create([
                'id' => Str::uuid(),
                'client_id' => $client->id,
                'version' => $targetVersion,
                'status' => 'current',
                'release_notes' => $upgradeResponse['release_notes'] ?? null,
                'deployed_at' => now(),
                'deployed_by' => $adminId,
            ]);

            $backup->update([
                'version_history_id' => $versionHistory->id,
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            return [
                'success' => true,
                'message' => "Successfully upgraded to version {$targetVersion}",
                'backup_id' => $backup->id,
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Rollback to previous version
     */
    public function rollback(Client $client, ?string $adminId = null): array
    {
        try {
            $previousVersion = VersionHistory::getPreviousVersion($client->id);

            if (!$previousVersion) {
                throw new Exception('No previous version available for rollback');
            }

            $current = $this->getCurrentVersion($client);
            $latestBackup = UpgradeBackup::where('client_id', $client->id)
                ->where('to_version', $current)
                ->where('status', 'completed')
                ->latest('created_at')
                ->first();

            if (!$latestBackup) {
                throw new Exception('No backup found for current version');
            }

            // Call client's rollback endpoint
            $rollbackResponse = $this->callClientUpgradeEndpoint($client, [
                'action' => 'rollback',
                'from_version' => $current,
                'to_version' => $previousVersion->version,
                'backup_id' => $latestBackup->id,
            ]);

            if (!$rollbackResponse['success']) {
                throw new Exception('Client rollback failed: ' . ($rollbackResponse['error'] ?? 'Unknown error'));
            }

            // Update version history
            VersionHistory::where('client_id', $client->id)
                ->where('status', 'current')
                ->update(['status' => 'failed']);

            $previousVersion->update(['status' => 'current']);

            $latestBackup->update([
                'status' => 'restored',
                'restored_at' => now(),
            ]);

            return [
                'success' => true,
                'message' => "Successfully rolled back to version {$previousVersion->version}",
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Call the client ERP's upgrade manager endpoint
     */
    private function callClientUpgradeEndpoint(Client $client, array $payload): array
    {
        try {
            $url = "https://{$client->host}:{$client->port}/api/admin/system/upgrade-manager";

            $response = Http::withBasicAuth($client->username, $client->password)
                ->withoutVerifying() // Handle self-signed certs
                ->timeout(120) // 2-minute timeout for upgrade
                ->post($url, $payload);

            if (!$response->successful()) {
                return [
                    'success' => false,
                    'error' => 'HTTP ' . $response->status() . ': ' . $response->body(),
                ];
            }

            return $response->json();

        } catch (Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
