<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\VersionHistory;
use App\Models\UpgradeBackup;
use App\Services\VersionManagementService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class VersionManagementController extends Controller
{
    private VersionManagementService $versionService;

    public function __construct(VersionManagementService $versionService)
    {
        $this->versionService = $versionService;
    }

    /**
     * Get upgrade info for a specific client
     */
    public function getUpgradeInfo(Request $request, string $clientId): JsonResponse
    {
        $client = Client::findOrFail($clientId);

        return response()->json([
            'client_id' => $client->id,
            'client_name' => $client->name,
            'upgrade_info' => $this->versionService->getUpgradeInfo($client),
        ]);
    }

    /**
     * Get version history for a client
     */
    public function getVersionHistory(Request $request, string $clientId): JsonResponse
    {
        $client = Client::findOrFail($clientId);

        $versionHistory = VersionHistory::where('client_id', $clientId)
            ->orderByDesc('deployed_at')
            ->limit(20)
            ->get()
            ->map(fn($v) => [
                'id' => $v->id,
                'version' => $v->version,
                'status' => $v->status,
                'deployed_at' => $v->deployed_at,
                'deployed_by' => $v->deployed_by,
                'release_notes' => $v->release_notes,
            ]);

        return response()->json([
            'client_id' => $clientId,
            'history' => $versionHistory,
        ]);
    }

    /**
     * Get backup history for a client
     */
    public function getBackupHistory(Request $request, string $clientId): JsonResponse
    {
        $client = Client::findOrFail($clientId);

        $backups = UpgradeBackup::where('client_id', $clientId)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn($b) => [
                'id' => $b->id,
                'from_version' => $b->from_version,
                'to_version' => $b->to_version,
                'status' => $b->status,
                'backup_size_bytes' => $b->backup_size_bytes,
                'backup_path' => $b->backup_path,
                'created_at' => $b->created_at,
                'completed_at' => $b->completed_at,
                'restored_at' => $b->restored_at,
                'error_message' => $b->error_message,
            ]);

        return response()->json([
            'client_id' => $clientId,
            'backups' => $backups,
        ]);
    }

    /**
     * Initiate upgrade to a specific version
     */
    public function upgrade(Request $request, string $clientId): JsonResponse
    {
        $client = Client::findOrFail($clientId);

        $validated = $request->validate([
            'target_version' => 'required|string|min:1|max:50',
        ]);

        $result = $this->versionService->initiateUpgrade(
            $client,
            $validated['target_version'],
            auth()->id()
        );

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        return response()->json($result);
    }

    /**
     * Rollback to previous version
     */
    public function rollback(Request $request, string $clientId): JsonResponse
    {
        $client = Client::findOrFail($clientId);

        $result = $this->versionService->rollback($client, auth()->id());

        if (!$result['success']) {
            return response()->json([
                'success' => false,
                'error' => $result['error'],
            ], 400);
        }

        return response()->json($result);
    }

    /**
     * List all clients with their version info (for dashboard)
     */
    public function listClientVersions(Request $request): JsonResponse
    {
        $clients = Client::select('id', 'name', 'host')->get();

        $clientVersions = $clients->map(fn($client) => [
            'id' => $client->id,
            'name' => $client->name,
            'host' => $client->host,
            'upgrade_info' => $this->versionService->getUpgradeInfo($client),
        ]);

        return response()->json([
            'clients' => $clientVersions,
        ]);
    }
}
