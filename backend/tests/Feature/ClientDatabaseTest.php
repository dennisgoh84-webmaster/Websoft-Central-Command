<?php

namespace Tests\Feature;

use App\Services\ClientDbService;
use App\Support\ClientDbException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\UsesClientDatabase;
use Tests\TestCase;

/**
 * What Central Command writes into a client ERP's database, against a
 * real (stand-in) client database -- the schema contract in
 * docs/central-command-schema-contract.md.
 */
class ClientDatabaseTest extends TestCase
{
    use RefreshDatabase;
    use UsesClientDatabase;

    public function test_test_connection_reports_the_latest_migration_and_the_companies(): void
    {
        $this->freshClientDatabase();
        $client = $this->clientRecord();

        $result = $this->postJson("/api/clients/{$client->id}/test-connection", [], $this->as($this->admin()))->assertOk()->json();

        $this->assertTrue($result['success']);
        $this->assertSame('2026_09_30_001900_create_upgrade_requests_and_agent_state', $result['migration_head']);
        $this->assertSame('Acme Trading Pte Ltd', $result['companies'][0]['name']);
    }

    public function test_test_connection_says_why_when_the_client_cannot_be_reached(): void
    {
        $client = $this->clientRecord();
        $client->update(['db_port' => 1]);

        $result = $this->postJson("/api/clients/{$client->id}/test-connection", [], $this->as($this->admin()))->json();

        $this->assertFalse($result['success']);
        $this->assertNotEmpty($result['message']);
    }

    public function test_announcements_are_pushed_as_read_only_central_rows_and_updated_in_place(): void
    {
        $pdo = $this->freshClientDatabase();
        $client = $this->clientRecord();
        $svc = app(ClientDbService::class);
        $id = '22222222-2222-2222-2222-222222222222';

        $svc->pushAnnouncements($client, [['id' => $id, 'tag' => 'NEW', 'text' => 'First text', 'sort_order' => 1, 'is_active' => true]]);
        $svc->pushAnnouncements($client, [['id' => $id, 'tag' => 'UPDATE', 'text' => 'Second text', 'sort_order' => 2, 'is_active' => false]]);

        $rows = $pdo->query('SELECT tag, text, sort_order, is_active, source FROM announcements')->fetchAll(\PDO::FETCH_ASSOC);
        $this->assertSame([['tag' => 'UPDATE', 'text' => 'Second text', 'sort_order' => 2, 'is_active' => false, 'source' => 'central']], $rows);
        $this->assertSame('2026_09_30_001900_create_upgrade_requests_and_agent_state', $client->fresh()->last_known_migration_head);
    }

    public function test_a_push_is_refused_to_a_client_older_than_the_minimum_migration(): void
    {
        $pdo = $this->freshClientDatabase('2026_09_14_000000_old_schema');
        $client = $this->clientRecord();
        config(['centralcommand.min_client_migration_head' => '2026_09_20_000000_needed_since']);

        try {
            app(ClientDbService::class)->pushAnnouncements($client, [['id' => '33333333-3333-3333-3333-333333333333', 'tag' => null, 'text' => 'x', 'sort_order' => 0, 'is_active' => true]]);
            $this->fail('The push should have been refused.');
        } catch (ClientDbException $e) {
            $this->assertStringContainsString('behind the minimum required migration', $e->getMessage());
        }
        $this->assertSame(0, (int) $pdo->query('SELECT count(*) FROM announcements')->fetchColumn());
    }

    public function test_client_upgrades_are_queued_in_the_clients_own_database(): void
    {
        $pdo = $this->freshClientDatabase();
        $pdo->exec("INSERT INTO upgrade_agent_state (id, current_sha, remote_sha, commits_behind, last_heartbeat_at)
                    VALUES (1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 3, now())");
        $client = $this->clientRecord();
        $admin = $this->admin();

        $status = $this->getJson("/api/version-management/clients/{$client->id}", $this->as($admin))->assertOk()->json();
        $this->assertTrue($status['agent_online']);
        $this->assertTrue($status['can_upgrade']);

        $this->postJson("/api/version-management/clients/{$client->id}/upgrade", [], $this->as($admin))->assertOk();
        $row = $pdo->query('SELECT kind, target_ref, status, requested_by FROM upgrade_requests')->fetch(\PDO::FETCH_ASSOC);
        $this->assertSame(['kind' => 'upgrade', 'target_ref' => 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'status' => 'pending', 'requested_by' => "central-command:{$admin->id}"], $row);

        // One at a time: the client answers, so it is a conflict (409), not a connection error (502).
        $this->postJson("/api/version-management/clients/{$client->id}/upgrade", [], $this->as($admin))
            ->assertStatus(409)->assertJsonFragment(['detail' => 'An upgrade is already pending or running on this client.']);
    }

    public function test_a_client_without_the_upgrade_tables_shows_as_not_supported(): void
    {
        $pdo = $this->freshClientDatabase();
        $pdo->exec('DROP TABLE upgrade_requests, upgrade_agent_state');
        $client = $this->clientRecord();

        $status = $this->getJson("/api/version-management/clients/{$client->id}", $this->as($this->admin()))->assertOk()->json();
        $this->assertFalse($status['supported']);
    }
}
