<?php

namespace App\Http\Controllers;

use App\Models\CcVersionHistory;
use App\Services\CcUpgradeService;
use App\Support\ApiException;
use Illuminate\Http\Request;

class CcUpgradeController extends Controller
{
    public function __construct(private CcUpgradeService $upgradeService) {}

    public function getVersion()
    {
        $current = $this->upgradeService->getCurrentVersion();

        return response()->json([
            'current_version' => $current?->version,
            'current_status' => $current?->status,
            'last_upgraded_at' => $current?->upgraded_at?->toISOString(),
        ]);
    }

    public function checkUpgrade()
    {
        $info = $this->upgradeService->canUpgrade();

        return response()->json($info);
    }

    public function getVersionHistory()
    {
        $history = CcVersionHistory::orderByDesc('upgraded_at')->limit(20)->get();

        return response()->json($history->map(function ($v) {
            return [
                'id' => (string) $v->id,
                'version' => $v->version,
                'status' => $v->status,
                'release_notes' => $v->release_notes,
                'error_message' => $v->error_message,
                'upgraded_at' => $v->upgraded_at->toISOString(),
                'created_at' => $v->created_at->toISOString(),
            ];
        })->all());
    }

    public function upgrade(Request $request)
    {
        $admin = $request->attributes->get('admin');
        if ($admin->role !== 'super_admin') {
            throw new ApiException(403, 'Only super admins can upgrade Central Command');
        }

        $targetVersion = $request->input('target_version');
        if (!$targetVersion) {
            throw new ApiException(400, 'target_version is required');
        }

        try {
            $this->upgradeService->upgrade($targetVersion);

            return response()->json([
                'success' => true,
                'message' => "Successfully upgraded to {$targetVersion}",
                'new_version' => $targetVersion,
            ]);
        } catch (\RuntimeException $e) {
            throw new ApiException(500, $e->getMessage());
        }
    }

    public function rollback(Request $request)
    {
        $admin = $request->attributes->get('admin');
        if ($admin->role !== 'super_admin') {
            throw new ApiException(403, 'Only super admins can rollback Central Command');
        }

        try {
            $this->upgradeService->rollback();

            $current = $this->upgradeService->getCurrentVersion();

            return response()->json([
                'success' => true,
                'message' => 'Successfully rolled back',
                'current_version' => $current->version,
            ]);
        } catch (\RuntimeException $e) {
            throw new ApiException(500, $e->getMessage());
        }
    }
}
