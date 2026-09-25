<?php

namespace Tests\Feature;

use App\Models\CcUpgradeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The CC Upgrade screen and the host agent (scripts/upgrade-agent.sh)
 * that performs what it queues: heartbeat -> picks up a request ->
 * live progress -> final report.
 */
class CcUpgradeAgentTest extends TestCase
{
    use RefreshDatabase;

    private const CURRENT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private const LATEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    private function agent(string $path, array $body, string $token = 'test-agent-token')
    {
        return $this->postJson("/api/cc-upgrade/agent/{$path}", $body, ['X-Upgrade-Agent-Token' => $token]);
    }

    private function heartbeat()
    {
        return $this->agent('heartbeat', [
            'current_sha' => self::CURRENT, 'remote_sha' => self::LATEST, 'commits_behind' => 2, 'agent_host' => 'test-host',
        ]);
    }

    public function test_agent_endpoints_need_the_shared_token(): void
    {
        $this->agent('heartbeat', [], 'wrong')->assertStatus(401);
        $this->postJson('/api/cc-upgrade/agent/heartbeat', [])->assertStatus(401);

        config(['centralcommand.upgrade_agent_token' => '']);
        $this->agent('heartbeat', [])->assertStatus(503);
    }

    public function test_the_screen_shows_what_the_agent_reported(): void
    {
        $this->heartbeat()->assertOk()->assertJson(['request' => null]);

        $status = $this->getJson('/api/cc-upgrade/status', $this->as($this->admin()))->assertOk();
        $this->assertTrue($status->json('agent_online'));
        $this->assertSame(self::LATEST, $status->json('agent.remote_sha'));
        $this->assertTrue($status->json('can_upgrade'));
    }

    public function test_an_upgrade_runs_through_pickup_progress_and_report(): void
    {
        $admin = $this->admin();
        $this->heartbeat();

        $this->postJson('/api/cc-upgrade/upgrade', [], $this->as($admin))->assertOk()->assertJson(['active' => ['status' => 'pending']]);
        $this->postJson('/api/cc-upgrade/upgrade', [], $this->as($admin))->assertStatus(409);

        // The next tick hands it to the agent and marks it running.
        $picked = $this->heartbeat()->assertOk()->json('request');
        $this->assertSame(self::LATEST, $picked['target_ref']);
        $req = CcUpgradeRequest::findOrFail($picked['id']);
        $this->assertSame('running', $req->status);
        $this->assertSame(self::CURRENT, $req->from_sha);

        // Live progress while it runs...
        $this->agent('progress', ['id' => $req->id, 'log' => "==> Backing up the database\n"])->assertOk()->assertJson(['updated' => true]);
        $this->assertSame('==> Backing up the database', $this->getJson('/api/cc-upgrade/status', $this->as($admin))->json('active.log'));

        // ...then the final report replaces it with the whole log.
        $this->agent('report', ['id' => $req->id, 'success' => true, 'from_sha' => self::CURRENT, 'to_sha' => self::LATEST, 'log' => 'complete log'])
            ->assertOk()->assertJson(['status' => 'succeeded']);
        $this->assertSame('complete log', $req->fresh()->log);

        // Progress arriving late cannot overwrite a finished request.
        $this->agent('progress', ['id' => $req->id, 'log' => 'late'])->assertJson(['updated' => false]);
        $this->assertSame('complete log', $req->fresh()->log);

        $status = $this->getJson('/api/cc-upgrade/status', $this->as($admin))->json();
        $this->assertNull($status['active']);
        $this->assertSame('succeeded', $status['history'][0]['status']);
    }

    public function test_only_a_super_admin_can_upgrade_and_only_a_pending_request_can_be_cancelled(): void
    {
        $this->heartbeat();

        $this->postJson('/api/cc-upgrade/upgrade', [], $this->as($this->admin('admin', 'plainadmin')))->assertStatus(403);

        $super = $this->admin();
        $id = $this->postJson('/api/cc-upgrade/upgrade', [], $this->as($super))->json('active.id');
        $this->postJson("/api/cc-upgrade/requests/{$id}/cancel", [], $this->as($super))->assertOk()->assertJson(['active' => null]);
        $this->postJson("/api/cc-upgrade/requests/{$id}/cancel", [], $this->as($super))->assertStatus(400);
    }

    public function test_a_failed_upgrade_keeps_its_error(): void
    {
        $this->heartbeat();
        $this->postJson('/api/cc-upgrade/upgrade', [], $this->as($this->admin()));
        $id = $this->heartbeat()->json('request.id');

        $this->agent('report', ['id' => $id, 'success' => false, 'log' => 'boom', 'error' => 'upgrade.sh exited with status 1 -- see the log'])
            ->assertJson(['status' => 'failed']);
        $this->assertSame('upgrade.sh exited with status 1 -- see the log', CcUpgradeRequest::findOrFail($id)->error);
    }
}
