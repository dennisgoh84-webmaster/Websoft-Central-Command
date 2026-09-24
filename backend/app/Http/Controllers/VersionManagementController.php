<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\Client;
use App\Services\ClientDbService;
use App\Support\ApiException;
use App\Support\ClientDbException;
use Illuminate\Http\Request;

/**
 * Upgrading CLIENT installs from here. Central Command never runs code
 * on a client: it queues a row in the client's own `upgrade_requests`
 * table and reads back what the client's host agent reports -- see
 * docs/central-command-schema-contract.md §1b.
 */
class VersionManagementController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    /**
     * Just the registry -- no client DB is touched here, so the page
     * renders at once; it then asks show() for each client in parallel.
     */
    public function index()
    {
        $rows = Client::orderBy('name')->get()->map(fn (Client $c) => [
            'id' => (string) $c->id, 'name' => $c->name, 'code' => $c->code, 'status' => $c->status,
            'last_connected_at' => $c->last_connected_at?->toISOString(),
        ]);

        return response()->json($rows->all());
    }

    public function show(string $clientId)
    {
        $client = $this->clientOr404($clientId);
        try {
            return response()->json($this->withAdminNames($this->clientDb->readUpgradeStatus($client)));
        } catch (ClientDbException $e) {
            throw new ApiException(502, "Cannot read {$client->code}: {$e->getMessage()}");
        }
    }

    /** The client DB only knows our admin's id ('central-command:<uuid>'); show the username instead. */
    private function withAdminNames(array $status): array
    {
        $names = AdminUser::pluck('username', 'id')->all();
        $resolve = function (?array $req) use ($names): ?array {
            if ($req && preg_match('/^central-command:(.+)$/', (string) ($req['requested_by'] ?? ''), $m)) {
                $req['requested_by'] = $names[$m[1]] ?? $req['requested_by'];
            }

            return $req;
        };
        $status['active'] = $resolve($status['active']);
        $status['history'] = array_map($resolve, $status['history']);

        return $status;
    }

    public function upgrade(string $clientId, Request $request)
    {
        $client = $this->clientOr404($clientId);
        $admin = $this->requireSuperAdmin($request);
        try {
            $status = $this->clientDb->readUpgradeStatus($client);
            $target = (string) $request->input('target_ref', $status['agent']['remote_sha'] ?? '');
            if ($target === '') {
                throw new ApiException(400, "Nothing to upgrade to yet -- {$client->code}'s agent has not reported what origin/main is at.");
            }
            $this->clientDb->requestUpgrade($client, 'upgrade', $target, (string) $admin->id);

            return response()->json($this->withAdminNames($this->clientDb->readUpgradeStatus($client)));
        } catch (ClientDbException $e) {
            throw new ApiException(502, $e->getMessage());
        }
    }

    public function rollback(string $clientId, Request $request)
    {
        $client = $this->clientOr404($clientId);
        $admin = $this->requireSuperAdmin($request);
        try {
            $status = $this->clientDb->readUpgradeStatus($client);
            if (! $status['can_rollback']) {
                throw new ApiException(400, 'Nothing to roll back to.');
            }
            $this->clientDb->requestUpgrade($client, 'rollback', $status['rollback_to'], (string) $admin->id);

            return response()->json($this->withAdminNames($this->clientDb->readUpgradeStatus($client)));
        } catch (ClientDbException $e) {
            throw new ApiException(502, $e->getMessage());
        }
    }

    public function cancel(string $clientId, string $requestId, Request $request)
    {
        $client = $this->clientOr404($clientId);
        $admin = $this->requireSuperAdmin($request);
        try {
            $this->clientDb->cancelUpgradeRequest($client, $requestId, (string) $admin->id);

            return response()->json($this->withAdminNames($this->clientDb->readUpgradeStatus($client)));
        } catch (ClientDbException $e) {
            throw new ApiException(502, $e->getMessage());
        }
    }

    private function clientOr404(string $clientId): Client
    {
        $client = Client::find($clientId);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }

        return $client;
    }

    private function requireSuperAdmin(Request $request)
    {
        $admin = $request->attributes->get('admin');
        if ($admin->role !== 'super_admin') {
            throw new ApiException(403, 'Only super admins can upgrade or roll back a client');
        }

        return $admin;
    }
}
