<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\ClientUpgradeLog;
use App\Models\ErpVersion;
use App\Models\PushLog;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Version Control — manage ERP releases and push upgrades to clients. */
class VersionController extends Controller
{
    public function index()
    {
        $versions = ErpVersion::orderByDesc('created_at')->get();

        return response()->json($versions->map($this->versionOut(...))->all());
    }

    public function store(Request $request)
    {
        $admin = $request->attributes->get('admin');
        $versionNumber = (string) $request->input('version_number');

        if (ErpVersion::where('version_number', $versionNumber)->exists()) {
            throw new ApiException(400, "Version {$versionNumber} already exists");
        }

        $version = new ErpVersion([
            'version_number' => $versionNumber,
            'alembic_head' => $request->input('alembic_head'),
            'release_notes' => $request->input('release_notes'),
            'created_by' => $admin->id,
        ]);
        $version->save();
        $version->refresh();

        return response()->json($this->versionOut($version), 201);
    }

    public function update(string $versionId, Request $request)
    {
        $version = ErpVersion::find($versionId);
        if (! $version) {
            throw new ApiException(404, 'Version not found');
        }

        if ($request->filled('version_number')) {
            $version->version_number = $request->input('version_number');
        }
        if ($request->filled('alembic_head')) {
            $version->alembic_head = $request->input('alembic_head');
        }
        if ($request->exists('release_notes') && $request->input('release_notes') !== null) {
            $version->release_notes = $request->input('release_notes');
        }
        if ($request->filled('status')) {
            $status = $request->input('status');
            $version->status = $status;
            if ($status === 'released') {
                $version->released_at = Carbon::now();
            }
        }
        if ($request->exists('is_latest') && $request->input('is_latest') !== null) {
            $isLatest = $request->boolean('is_latest');
            if ($isLatest) {
                // Clear is_latest from all other versions
                ErpVersion::where('id', '!=', $version->id)->update(['is_latest' => false]);
            }
            $version->is_latest = $isLatest;
        }
        $version->save();

        return response()->json($this->versionOut($version));
    }

    public function destroy(string $versionId)
    {
        $version = ErpVersion::find($versionId);
        if (! $version) {
            throw new ApiException(404, 'Version not found');
        }
        $version->delete();

        return response()->noContent();
    }

    /** Compare all clients' current Alembic head against known versions. */
    public function clientVersions()
    {
        $clients = Client::where('status', '!=', 'DECOMMISSIONED')->get();
        $versions = ErpVersion::where('status', 'RELEASED')->get();
        $latest = ErpVersion::where('is_latest', true)->first();

        $headToVersion = [];
        foreach ($versions as $v) {
            $headToVersion[$v->alembic_head] = $v->version_number;
        }
        $latestVersion = $latest?->version_number;

        $result = [];
        foreach ($clients as $c) {
            $currentVersion = $c->last_known_alembic_head ? ($headToVersion[$c->last_known_alembic_head] ?? null) : null;
            $isUpToDate = $currentVersion && $latestVersion ? $currentVersion === $latestVersion : false;

            $result[] = [
                'client_id' => (string) $c->id,
                'client_name' => $c->name,
                'client_code' => $c->code,
                'current_alembic_head' => $c->last_known_alembic_head,
                'current_version' => $currentVersion,
                'latest_version' => $latestVersion,
                'is_up_to_date' => $isUpToDate,
                'status' => $c->status,
            ];
        }

        return response()->json($result);
    }

    /**
     * Push a version upgrade to a client's ERP database.
     *
     * This records the upgrade intent and updates the client's known
     * Alembic head. The actual migration execution depends on the
     * client's deployment setup (Alembic upgrade command run on the
     * client side). Central Command records the push and updates the
     * version tracking.
     */
    public function upgradeClient(string $clientId, Request $request)
    {
        $admin = $request->attributes->get('admin');

        $client = Client::find($clientId);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }
        $version = ErpVersion::find((string) $request->input('version_id'));
        if (! $version) {
            throw new ApiException(404, 'Version not found');
        }
        if ($version->status !== 'released') {
            throw new ApiException(400, 'Can only upgrade to a released version');
        }

        $fromVersion = $client->last_known_alembic_head;

        $log = new ClientUpgradeLog([
            'client_id' => $client->id,
            'from_version' => $fromVersion,
            'to_version' => $version->version_number,
            'to_alembic_head' => $version->alembic_head,
            'success' => true,
            'upgraded_by' => $admin->id,
        ]);
        $log->save();

        $client->last_known_alembic_head = $version->alembic_head;
        $client->last_connected_at = Carbon::now();
        $client->save();

        PushLog::create([
            'client_id' => $client->id,
            'push_type' => 'version',
            'detail' => "Upgraded to v{$version->version_number} (head: {$version->alembic_head})",
            'success' => true,
            'pushed_by' => $admin->id,
        ]);

        return response()->json([
            'success' => true,
            'client' => $client->code,
            'from_version' => $fromVersion,
            'to_version' => $version->version_number,
        ]);
    }

    public function upgradeLogs(Request $request)
    {
        $q = ClientUpgradeLog::orderByDesc('upgraded_at');
        if ($clientId = $request->query('client_id')) {
            $q->where('client_id', $clientId);
        }
        $logs = $q->limit(100)->get();

        return response()->json($logs->map(fn (ClientUpgradeLog $l) => [
            'id' => (string) $l->id,
            'client_id' => (string) $l->client_id,
            'from_version' => $l->from_version,
            'to_version' => $l->to_version,
            'to_alembic_head' => $l->to_alembic_head,
            'success' => $l->success,
            'error_message' => $l->error_message,
            'upgraded_at' => $l->upgraded_at?->toISOString(),
            'upgraded_by' => $l->upgraded_by ? (string) $l->upgraded_by : null,
        ])->all());
    }

    private function versionOut(ErpVersion $v): array
    {
        return [
            'id' => (string) $v->id,
            'version_number' => $v->version_number,
            'alembic_head' => $v->alembic_head,
            'release_notes' => $v->release_notes,
            'status' => $v->status,
            'is_latest' => $v->is_latest,
            'released_at' => $v->released_at?->toISOString(),
            'created_at' => $v->created_at?->toISOString(),
        ];
    }
}
