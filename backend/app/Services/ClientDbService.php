<?php

namespace App\Services;

use App\Models\Client;
use App\Models\PushLog;
use App\Support\ClientDbException;
use Illuminate\Support\Carbon;
use PDO;
use PDOException;
use Throwable;

/**
 * Client database connector.
 *
 * Connects to a client's PostgreSQL on demand, verifies Alembic version
 * compatibility, and executes push operations (ads, licenses, config).
 * Each connection is short-lived — opened for the push, then closed.
 */
class ClientDbService
{
    /** Open a short-lived PDO connection to a client's PostgreSQL database. */
    public function connect(Client $client): PDO
    {
        $sslMode = $client->db_use_tls ? 'require' : 'prefer';
        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s',
            $client->db_host,
            $client->db_port,
            $client->db_name,
            $sslMode,
        );

        return new PDO($dsn, $client->db_username, $client->db_password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            // Allows the same named placeholder to repeat within one
            // query (used below), and is the most portable mode across
            // PDO drivers.
            PDO::ATTR_EMULATE_PREPARES => true,
        ]);
    }

    /** Test connectivity + read Alembic version + list companies. */
    public function testConnection(Client $client): array
    {
        try {
            $pdo = $this->connect($client);

            $row = $pdo->query('SELECT version_num FROM alembic_version LIMIT 1')->fetch(PDO::FETCH_NUM);
            $alembicHead = $row ? $row[0] : null;

            $companies = [];
            $stmt = $pdo->query('SELECT id, name, registration_number FROM companies LIMIT 50');
            foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $r) {
                $companies[] = ['id' => (string) $r[0], 'name' => $r[1], 'registration_number' => $r[2]];
            }

            return [
                'success' => true,
                'message' => 'Connected successfully',
                'alembic_head' => $alembicHead,
                'companies' => $companies,
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /** Read the Alembic version and check compatibility. Returns the head or throws. */
    public function checkAlembicVersion(PDO $pdo): string
    {
        $row = $pdo->query('SELECT version_num FROM alembic_version LIMIT 1')->fetch(PDO::FETCH_NUM);
        if (! $row) {
            throw new ClientDbException('No alembic_version found in client DB');
        }

        return $row[0];
    }

    /** Record a push attempt in Central Command's push_logs. */
    private function logPush(Client $client, string $pushType, string $detail, bool $success, ?string $error = null, ?string $pushedBy = null): void
    {
        PushLog::create([
            'client_id' => $client->id,
            'push_type' => $pushType,
            'detail' => $detail,
            'success' => $success,
            'error_message' => $error,
            'pushed_by' => $pushedBy,
        ]);
    }

    /**
     * Push announcement rows into a client's `announcements` table.
     * Uses UPSERT (INSERT ON CONFLICT UPDATE) keyed on announcement id.
     *
     * @param  list<array{id: string, tag: ?string, text: string, sort_order: int, is_active: bool}>  $announcements
     */
    public function pushAnnouncements(Client $client, array $announcements, ?string $adminId = null): array
    {
        try {
            $pdo = $this->connect($client);
            $alembicHead = $this->checkAlembicVersion($pdo);

            $pdo->beginTransaction();
            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO announcements (id, tag, text, sort_order, is_active, created_at)
                VALUES (:id, :tag, :text, :sort_order, :is_active, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    tag = EXCLUDED.tag,
                    text = EXCLUDED.text,
                    sort_order = EXCLUDED.sort_order,
                    is_active = EXCLUDED.is_active
            SQL);
            foreach ($announcements as $ann) {
                $stmt->execute([
                    'id' => $ann['id'],
                    'tag' => $ann['tag'],
                    'text' => $ann['text'],
                    'sort_order' => $ann['sort_order'],
                    'is_active' => $ann['is_active'] ? 't' : 'f',
                ]);
            }
            $pdo->commit();

            $client->last_connected_at = Carbon::now();
            $client->last_known_alembic_head = $alembicHead;
            $client->save();

            $this->logPush($client, 'advertisement', 'Pushed '.count($announcements).' announcement(s)', true, pushedBy: $adminId);

            return ['success' => true, 'count' => count($announcements)];
        } catch (Throwable $e) {
            $this->logPush($client, 'advertisement', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Update the ad_banner_settings singleton row in a client DB. */
    public function pushVideoUrl(Client $client, ?string $videoUrl, ?string $adminId = null): array
    {
        try {
            $pdo = $this->connect($client);
            $this->checkAlembicVersion($pdo);

            $stmt = $pdo->prepare(<<<'SQL'
                UPDATE ad_banner_settings
                SET video_url = :video_url, updated_at = NOW()
                WHERE id = 1
            SQL);
            $stmt->execute(['video_url' => $videoUrl]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            $detail = 'Set video_url='.($videoUrl ? substr($videoUrl, 0, 80) : '(cleared)');
            $this->logPush($client, 'video', $detail, true, pushedBy: $adminId);

            return ['success' => true];
        } catch (Throwable $e) {
            $this->logPush($client, 'video', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Enable or disable a module for a company in the client DB. */
    public function pushLicenseChange(
        Client $client,
        string $companyId,
        string $moduleKey,
        bool $enabled,
        ?string $licenseType = null,
        ?string $notes = null,
        ?string $adminId = null,
    ): array {
        try {
            $pdo = $this->connect($client);
            $this->checkAlembicVersion($pdo);

            $check = $pdo->prepare('SELECT key FROM modules WHERE key = :key');
            $check->execute(['key' => $moduleKey]);
            if (! $check->fetch()) {
                throw new ClientDbException("Module '{$moduleKey}' not found in client DB");
            }

            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO company_modules (id, company_id, module_key, enabled,
                    license_type, notes, enabled_at, updated_at)
                VALUES (gen_random_uuid(), :company_id::uuid, :module_key, :enabled,
                    :license_type, :notes,
                    CASE WHEN :enabled THEN NOW() ELSE NULL END, NOW())
                ON CONFLICT ON CONSTRAINT uq_company_module DO UPDATE SET
                    enabled = EXCLUDED.enabled,
                    license_type = COALESCE(EXCLUDED.license_type, company_modules.license_type),
                    notes = COALESCE(EXCLUDED.notes, company_modules.notes),
                    enabled_at = CASE WHEN EXCLUDED.enabled AND NOT company_modules.enabled
                                 THEN NOW() ELSE company_modules.enabled_at END,
                    updated_at = NOW()
            SQL);
            $stmt->execute([
                'company_id' => $companyId,
                'module_key' => $moduleKey,
                'enabled' => $enabled ? 't' : 'f',
                'license_type' => $licenseType ?: 'included',
                'notes' => $notes,
            ]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            $action = $enabled ? 'enabled' : 'disabled';
            $this->logPush($client, 'license', "{$action} module '{$moduleKey}' for company {$companyId}", true, pushedBy: $adminId);

            return ['success' => true, 'action' => $action];
        } catch (Throwable $e) {
            $this->logPush($client, 'license', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Execute a config update SQL statement on a client DB. */
    public function pushConfigSql(Client $client, string $sqlStatement, ?string $adminId = null): array
    {
        try {
            $pdo = $this->connect($client);
            $this->checkAlembicVersion($pdo);

            $stmt = $pdo->prepare($sqlStatement);
            $stmt->execute();
            $rowCount = $stmt->rowCount();

            $client->last_connected_at = Carbon::now();
            $client->save();

            $this->logPush($client, 'config', "Config SQL executed, {$rowCount} row(s) affected", true, pushedBy: $adminId);

            return ['success' => true, 'rows_affected' => $rowCount];
        } catch (Throwable $e) {
            $this->logPush($client, 'config', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /**
     * Push the concurrent-login license limit to a client DB.
     *
     * Writes to the `license_settings` table (UPSERT). If the table
     * does not exist yet in the client schema the push creates it on
     * the fly — a single key/value row keyed `max_concurrent_logins`.
     */
    public function pushLicenseLimit(Client $client, ?int $maxLicenses, ?string $adminId = null): array
    {
        try {
            $pdo = $this->connect($client);
            $this->checkAlembicVersion($pdo);

            $pdo->exec(<<<'SQL'
                CREATE TABLE IF NOT EXISTS license_settings (
                    key   VARCHAR(100) PRIMARY KEY,
                    value VARCHAR(255),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            SQL);

            $val = $maxLicenses !== null ? (string) $maxLicenses : null;
            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO license_settings (key, value, updated_at)
                VALUES ('max_concurrent_logins', :val, NOW())
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = NOW()
            SQL);
            $stmt->execute(['val' => $val]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            $label = $maxLicenses ?: 'unlimited';
            $this->logPush($client, 'license', "Set max concurrent logins to {$label}", true, pushedBy: $adminId);

            return ['success' => true, 'max_licenses' => $maxLicenses];
        } catch (Throwable $e) {
            $this->logPush($client, 'license', 'Push license limit failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Read modules + company_modules from a client DB for the license overview. */
    public function readClientModules(Client $client): array
    {
        try {
            $pdo = $this->connect($client);
            $stmt = $pdo->query(<<<'SQL'
                SELECT m.key, m.name, m.is_built,
                       cm.enabled, cm.license_type, cm.notes, cm.updated_at,
                       c.id as company_id, c.name as company_name
                FROM modules m
                CROSS JOIN companies c
                LEFT JOIN company_modules cm
                    ON cm.module_key = m.key AND cm.company_id = c.id
                ORDER BY c.name, m.key
            SQL);

            $rows = [];
            foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $r) {
                $rows[] = [
                    'module_key' => $r[0],
                    'module_name' => $r[1],
                    'is_built' => $this->pgBool($r[2]),
                    'enabled' => $r[3] !== null ? $this->pgBool($r[3]) : false,
                    'license_type' => $r[4] ?: 'included',
                    'notes' => $r[5],
                    'updated_at' => $r[6],
                    'company_id' => (string) $r[7],
                    'company_name' => $r[8],
                ];
            }

            return $rows;
        } catch (Throwable $e) {
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    private function pgBool(mixed $value): bool
    {
        return $value === true || $value === 't' || $value === '1' || $value === 1;
    }
}
