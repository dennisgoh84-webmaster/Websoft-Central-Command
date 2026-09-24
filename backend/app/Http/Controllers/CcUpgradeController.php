<?php

namespace App\Http\Controllers;

use App\Models\CcUpgradeAgentState;
use App\Models\CcUpgradeRequest;
use App\Support\ApiException;
use App\Support\UpgradeStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Upgrading THIS Central Command install. Admin endpoints queue work
 * and read state; the two /agent endpoints are called only by
 * scripts/upgrade-agent.sh on the host (X-Upgrade-Agent-Token), which
 * is the only thing that can actually rebuild the containers. See the
 * migration that created cc_upgrade_requests.
 */
class CcUpgradeController extends Controller
{
    // ── Admin ────────────────────────────────────────────────────────

    public function status()
    {
        return response()->json($this->buildStatus());
    }

    public function upgrade(Request $request)
    {
        $admin = $this->requireSuperAdmin($request);
        $state = CcUpgradeAgentState::find(1);
        $target = (string) $request->input('target_ref', $state?->remote_sha ?? '');
        if ($target === '') {
            throw new ApiException(400, 'Nothing to upgrade to yet -- the upgrade agent has not reported what origin/main is at.');
        }

        return response()->json($this->enqueue(CcUpgradeRequest::KIND_UPGRADE, $target, $admin->username));
    }

    public function rollback(Request $request)
    {
        $admin = $this->requireSuperAdmin($request);
        $status = $this->buildStatus();
        if (! $status['can_rollback']) {
            throw new ApiException(400, 'Nothing to roll back to.');
        }

        return response()->json($this->enqueue(CcUpgradeRequest::KIND_ROLLBACK, $status['rollback_to'], $admin->username));
    }

    public function cancel(Request $request, string $requestId)
    {
        $this->requireSuperAdmin($request);
        $updated = CcUpgradeRequest::where('id', $requestId)
            ->where('status', CcUpgradeRequest::STATUS_PENDING)
            ->update(['status' => CcUpgradeRequest::STATUS_CANCELLED, 'finished_at' => Carbon::now()]);
        if (! $updated) {
            throw new ApiException(400, 'Only a request the agent has not picked up yet can be cancelled.');
        }

        return response()->json($this->buildStatus());
    }

    private function enqueue(string $kind, string $targetRef, string $requestedBy): array
    {
        if (CcUpgradeRequest::whereIn('status', CcUpgradeRequest::ACTIVE_STATUSES)->exists()) {
            throw new ApiException(409, 'An upgrade is already pending or running.');
        }
        CcUpgradeRequest::create([
            'kind' => $kind,
            'target_ref' => $targetRef,
            'status' => CcUpgradeRequest::STATUS_PENDING,
            'requested_by' => $requestedBy,
            'requested_at' => Carbon::now(),
        ]);

        return $this->buildStatus();
    }

    private function buildStatus(): array
    {
        if ((string) config('centralcommand.upgrade_agent_token') === '') {
            return UpgradeStatus::unsupported('CC_UPGRADE_AGENT_TOKEN is not set on this server. Run scripts/deploy.sh (or scripts/install-upgrade-agent.sh) once on the host to enable upgrades from here.');
        }
        $agent = CcUpgradeAgentState::find(1)?->toArray();
        $active = CcUpgradeRequest::whereIn('status', CcUpgradeRequest::ACTIVE_STATUSES)->orderBy('requested_at')->first()?->toArray();
        $history = CcUpgradeRequest::orderByDesc('requested_at')->limit(20)->get()->toArray();

        return UpgradeStatus::shape($agent, $active, $history);
    }

    private function requireSuperAdmin(Request $request)
    {
        $admin = $request->attributes->get('admin');
        if ($admin->role !== 'super_admin') {
            throw new ApiException(403, 'Only super admins can upgrade or roll back Central Command');
        }

        return $admin;
    }

    // ── Agent ────────────────────────────────────────────────────────

    private function requireAgentToken(Request $request): void
    {
        $expected = (string) config('centralcommand.upgrade_agent_token');
        if ($expected === '') {
            throw new ApiException(503, 'CC_UPGRADE_AGENT_TOKEN is not configured.');
        }
        $given = (string) $request->header('X-Upgrade-Agent-Token', '');
        if ($given === '' || ! hash_equals($expected, $given)) {
            throw new ApiException(401, 'Invalid upgrade agent token.');
        }
    }

    public function heartbeat(Request $request)
    {
        $this->requireAgentToken($request);
        $data = $request->validate([
            'current_sha' => 'nullable|string|max:40',
            'current_subject' => 'nullable|string|max:2000',
            'current_committed_at' => 'nullable|date',
            'remote_sha' => 'nullable|string|max:40',
            'remote_subject' => 'nullable|string|max:2000',
            'remote_committed_at' => 'nullable|date',
            'commits_behind' => 'nullable|integer|min:0',
            'agent_host' => 'nullable|string|max:200',
        ]);

        $next = DB::transaction(function () use ($data) {
            $state = CcUpgradeAgentState::singleton();
            $state->fill($data + ['commits_behind' => $data['commits_behind'] ?? 0]);
            $state->last_heartbeat_at = Carbon::now();
            $state->save();

            CcUpgradeRequest::where('status', CcUpgradeRequest::STATUS_RUNNING)
                ->where('started_at', '<', Carbon::now()->subMinutes(CcUpgradeRequest::STALE_RUNNING_MINUTES))
                ->update([
                    'status' => CcUpgradeRequest::STATUS_FAILED,
                    'finished_at' => Carbon::now(),
                    'error' => 'The agent never reported back (host restarted or agent stopped mid-upgrade).',
                ]);

            if (CcUpgradeRequest::where('status', CcUpgradeRequest::STATUS_RUNNING)->exists()) {
                return null;
            }
            $next = CcUpgradeRequest::where('status', CcUpgradeRequest::STATUS_PENDING)
                ->orderBy('requested_at')->lockForUpdate()->first();
            if (! $next) {
                return null;
            }
            $next->status = CcUpgradeRequest::STATUS_RUNNING;
            $next->started_at = Carbon::now();
            $next->from_sha = $data['current_sha'] ?? null;
            $next->save();

            return $next;
        });

        return response()->json([
            'request' => $next ? ['id' => (string) $next->id, 'kind' => $next->kind, 'target_ref' => $next->target_ref] : null,
        ]);
    }

    public function report(Request $request)
    {
        $this->requireAgentToken($request);
        $data = $request->validate([
            'id' => 'required|uuid',
            'success' => 'required|boolean',
            'from_sha' => 'nullable|string|max:40',
            'to_sha' => 'nullable|string|max:40',
            'log' => 'nullable|string|max:200000',
            'error' => 'nullable|string|max:2000',
        ]);

        $req = CcUpgradeRequest::find($data['id']);
        if (! $req) {
            throw new ApiException(404, 'No such upgrade request.');
        }
        if ($req->status !== CcUpgradeRequest::STATUS_RUNNING) {
            return response()->json(['status' => $req->status]);
        }
        $req->status = $data['success'] ? CcUpgradeRequest::STATUS_SUCCEEDED : CcUpgradeRequest::STATUS_FAILED;
        $req->finished_at = Carbon::now();
        $req->from_sha = $data['from_sha'] ?? $req->from_sha;
        $req->to_sha = $data['to_sha'] ?? null;
        $req->log = $data['log'] ?? null;
        $req->error = $data['error'] ?? null;
        $req->save();

        return response()->json(['status' => $req->status]);
    }
}
