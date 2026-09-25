<?php

namespace Tests\Concerns;

use App\Models\Client;
use PDO;

/**
 * A stand-in client ERP database (CC_TEST_CLIENT_DB) holding just the
 * tables Central Command reads and writes there, shaped like the ERP's
 * own migrations (docs/central-command-schema-contract.md). Rebuilt for
 * every test that uses it.
 */
trait UsesClientDatabase
{
    protected function clientPdo(): PDO
    {
        $c = config('database.connections.pgsql');

        return new PDO(
            sprintf('pgsql:host=%s;port=%d;dbname=%s', $c['host'], $c['port'], env('CC_TEST_CLIENT_DB')),
            $c['username'],
            $c['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
        );
    }

    protected function freshClientDatabase(string $latestMigration = '2026_09_30_001900_create_upgrade_requests_and_agent_state'): PDO
    {
        $pdo = $this->clientPdo();
        $pdo->exec(<<<'SQL'
            DROP TABLE IF EXISTS migrations, companies, announcements, upgrade_requests, upgrade_agent_state CASCADE;
            CREATE TABLE migrations (id serial PRIMARY KEY, migration varchar(255) NOT NULL, batch integer NOT NULL);
            CREATE TABLE companies (id uuid PRIMARY KEY, name varchar(200) NOT NULL, uen varchar(50));
            CREATE TABLE announcements (
                id uuid PRIMARY KEY, tag varchar(40), text text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
                is_active boolean NOT NULL DEFAULT true, source varchar(20) NOT NULL DEFAULT 'local',
                created_at timestamptz
            );
            CREATE TABLE upgrade_agent_state (
                id smallint PRIMARY KEY, current_sha varchar(40), current_subject text, current_committed_at timestamptz,
                remote_sha varchar(40), remote_subject text, remote_committed_at timestamptz,
                commits_behind integer NOT NULL DEFAULT 0, agent_host varchar(200), last_heartbeat_at timestamptz
            );
            CREATE TABLE upgrade_requests (
                id uuid PRIMARY KEY, kind varchar(10) NOT NULL DEFAULT 'upgrade', target_ref varchar(80) NOT NULL,
                status varchar(10) NOT NULL DEFAULT 'pending', requested_by varchar(200),
                requested_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
                from_sha varchar(40), to_sha varchar(40), log text, error text
            );
            INSERT INTO companies (id, name, uen) VALUES ('11111111-1111-1111-1111-111111111111', 'Acme Trading Pte Ltd', '201912345A');
        SQL);
        $stmt = $pdo->prepare('INSERT INTO migrations (migration, batch) VALUES (:m, 1)');
        $stmt->execute(['m' => '2026_09_14_000000_earlier_migration']);
        $stmt->execute(['m' => $latestMigration]);

        return $pdo;
    }

    protected function clientRecord(): Client
    {
        $c = config('database.connections.pgsql');

        return Client::create([
            'name' => 'Acme Trading Pte Ltd',
            'code' => 'ACME',
            'db_host' => $c['host'],
            'db_port' => (int) $c['port'],
            'db_name' => env('CC_TEST_CLIENT_DB'),
            'db_username' => $c['username'],
            'db_password' => $c['password'],
            'db_use_tls' => false,
            'status' => 'active',
        ]);
    }
}
