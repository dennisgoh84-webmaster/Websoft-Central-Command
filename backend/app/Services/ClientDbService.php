<?php

namespace App\Services;

use App\Models\Client;
use App\Models\PushLog;
use App\Models\SystemMailSetting;
use App\Support\ClientDbException;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Carbon;
use App\Support\UpgradeStatus;
use Illuminate\Support\Str;
use PDO;
use PDOException;
use Throwable;

/**
 * Client database connector.
 *
 * Connects to a client's PostgreSQL on demand, verifies schema
 * compatibility via Laravel's own `migrations` table (the client ERP
 * retired Python/Alembic on 2026-09-15 — there is no `alembic_version`
 * table on any client database any more), and executes push operations
 * (ads, licenses, config, system mail). Each connection is short-lived —
 * opened for the push, then closed.
 */
class ClientDbService
{
    /** Open a short-lived PDO connection to a client's PostgreSQL database. */
    public function connect(Client $client): PDO
    {
        $sslMode = $client->db_use_tls ? 'require' : 'prefer';
        $dsn = sprintf(
            // connect_timeout: an unreachable client must fail in
            // seconds, not hang the request until the OS gives up.
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s;connect_timeout=5',
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

    /** Test connectivity + read the current migration head + list companies. */
    public function testConnection(Client $client): array
    {
        try {
            $pdo = $this->connect($client);

            $migrationHead = $this->readMigrationHead($pdo);

            $companies = [];
            $stmt = $pdo->query('SELECT id, name, uen FROM companies LIMIT 50');
            foreach ($stmt->fetchAll(PDO::FETCH_NUM) as $r) {
                $companies[] = ['id' => (string) $r[0], 'name' => $r[1], 'uen' => $r[2]];
            }

            return [
                'success' => true,
                'message' => 'Connected successfully',
                'migration_head' => $migrationHead,
                'companies' => $companies,
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Read the client's latest applied Laravel migration, without
     * requiring one to exist — returns null on an otherwise-reachable
     * database that just hasn't been migrated yet, rather than throwing.
     */
    private function readMigrationHead(PDO $pdo): ?string
    {
        $row = $pdo->query('SELECT migration FROM migrations ORDER BY batch DESC, id DESC LIMIT 1')->fetch(PDO::FETCH_NUM);

        return $row ? $row[0] : null;
    }

    /**
     * Check schema compatibility before writing. Returns the migration
     * head or throws. When `centralcommand.min_client_migration_head`
     * is set, also refuses a client whose head sorts before it —
     * Laravel's date-prefixed migration filenames compare correctly as
     * plain strings, so this needs no version-number parsing.
     */
    public function checkMigrationHead(PDO $pdo): string
    {
        $head = $this->readMigrationHead($pdo);
        if ($head === null) {
            throw new ClientDbException('No migrations table found in client DB (or it is empty) — cannot verify schema compatibility before writing');
        }

        $minRequired = config('centralcommand.min_client_migration_head');
        if ($minRequired && strcmp($head, $minRequired) < 0) {
            throw new ClientDbException(
                "Client's schema is behind the minimum required migration ('{$minRequired}'); ".
                "latest applied there is '{$head}'. Run `php artisan migrate` on the client before pushing."
            );
        }

        return $head;
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
     * Every row is stamped `source = 'central'`, which the client ERP
     * treats as read-only (one-way push, 2026-09-24) -- its own
     * `source = 'local'` company announcements are never touched.
     *
     * @param  list<array{id: string, tag: ?string, text: string, sort_order: int, is_active: bool}>  $announcements
     */
    public function pushAnnouncements(Client $client, array $announcements, ?string $adminId = null): array
    {
        try {
            $pdo = $this->connect($client);
            $migrationHead = $this->checkMigrationHead($pdo);

            $pdo->beginTransaction();
            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO announcements (id, tag, text, sort_order, is_active, source, created_at)
                VALUES (:id, :tag, :text, :sort_order, :is_active, 'central', NOW())
                ON CONFLICT (id) DO UPDATE SET
                    tag = EXCLUDED.tag,
                    text = EXCLUDED.text,
                    sort_order = EXCLUDED.sort_order,
                    is_active = EXCLUDED.is_active,
                    source = EXCLUDED.source
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
            $client->last_known_migration_head = $migrationHead;
            $client->save();

            $this->logPush($client, 'advertisement', 'Pushed '.count($announcements).' announcement(s)', true, pushedBy: $adminId);

            return ['success' => true, 'count' => count($announcements)];
        } catch (Throwable $e) {
            $this->logPush($client, 'advertisement', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** The two independent ad_banner_settings rows a client DB carries since it split the promo video 2026-09-16 (websoft-service-erp). */
    private const VIDEO_SLOTS = ['login', 'app'];

    /**
     * Update one slot's row in ad_banner_settings on a client DB --
     * `login` is the client's Login page, `app` is its in-app banner
     * shown alongside the sidebar. Split 2026-09-16 at Dennis's direct
     * request ("this settings should be available from central command
     * to push out also") to mirror the client ERP's own two-slot video
     * setting (App\Models\AdBannerSettings there).
     *
     * A push is necessarily URL-only -- there is no mechanism here to
     * transfer an uploaded file's bytes to a remote client's server,
     * only to write a row into its database -- so this also clears
     * whatever the client had uploaded locally for that slot, the same
     * way the client's own local settings endpoint supersedes an
     * upload when a URL is saved.
     *
     * Pushing a URL also marks the slot `managed_by_central_command`,
     * which locks the client's own admin screen for it (one-way push,
     * 2026-09-24). Pushing an empty URL clears the slot AND that flag,
     * handing control back to the client.
     */
    public function pushVideoUrl(Client $client, string $slot, ?string $videoUrl, ?string $adminId = null): array
    {
        if (! in_array($slot, self::VIDEO_SLOTS, true)) {
            throw new ClientDbException("Unknown ad banner slot '{$slot}'");
        }

        try {
            $pdo = $this->connect($client);
            $this->checkMigrationHead($pdo);

            $stmt = $pdo->prepare(<<<'SQL'
                UPDATE ad_banner_settings
                SET video_url = :video_url,
                    video_stored_filename = NULL,
                    video_original_filename = NULL,
                    video_content_type = NULL,
                    video_file_size_bytes = NULL,
                    managed_by_central_command = :managed,
                    updated_at = NOW()
                WHERE slot = :slot
            SQL);
            $stmt->execute(['video_url' => $videoUrl, 'managed' => $videoUrl !== null && $videoUrl !== '' ? 't' : 'f', 'slot' => $slot]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            $detail = "slot={$slot} video_url=".($videoUrl ? substr($videoUrl, 0, 80) : '(cleared, released to client)');
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
            $this->checkMigrationHead($pdo);

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
            $this->checkMigrationHead($pdo);

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
            $this->checkMigrationHead($pdo);

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

    /**
     * Push one system mailbox (`otp` or `helpdesk`) into a client's
     * `system_mail_settings` table (UPSERT keyed on `purpose`).
     *
     * The password column there is behind that client's own Eloquent
     * `encrypted` cast — a plain-text write would leave a value the
     * client's app cannot decrypt, breaking OTP/helpdesk mail silently.
     * `encryptForClient()` reproduces Laravel's own encryption using
     * that client's stored `app_key`, so the ciphertext is exactly what
     * its own `SystemMailSetting::password` cast would have produced.
     * Requires `client.app_key` to be set — refuses with a clear error
     * otherwise rather than writing a password the client can't read.
     *
     * An empty password on the Central Command side is pushed as NULL
     * and the client's existing password (if any) is left untouched —
     * mirrors the "leave blank to keep current" pattern used for
     * db_password, so re-pushing other fields never clears it.
     */
    public function pushSystemMailSetting(Client $client, SystemMailSetting $setting, ?string $adminId = null): array
    {
        try {
            if (! $client->app_key) {
                throw new ClientDbException(
                    "Client '{$client->code}' has no APP_KEY on file — cannot encrypt the mailbox password ".
                    'compatibly with that install. Set it under that client\'s Details tab before pushing.'
                );
            }

            $pdo = $this->connect($client);
            $this->checkMigrationHead($pdo);

            $encryptedPassword = ($setting->password !== null && $setting->password !== '')
                ? $this->encryptForClient($client->app_key, $setting->password)
                : null;

            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO system_mail_settings (purpose, host, port, username, password, use_tls, from_email, from_name, updated_at)
                VALUES (:purpose, :host, :port, :username, :password, :use_tls, :from_email, :from_name, NOW())
                ON CONFLICT (purpose) DO UPDATE SET
                    host = EXCLUDED.host,
                    port = EXCLUDED.port,
                    username = EXCLUDED.username,
                    password = COALESCE(EXCLUDED.password, system_mail_settings.password),
                    use_tls = EXCLUDED.use_tls,
                    from_email = EXCLUDED.from_email,
                    from_name = EXCLUDED.from_name,
                    updated_at = NOW()
            SQL);
            $stmt->execute([
                'purpose' => $setting->purpose,
                'host' => $setting->host,
                'port' => $setting->port,
                'username' => $setting->username,
                'password' => $encryptedPassword,
                'use_tls' => $setting->use_tls ? 't' : 'f',
                'from_email' => $setting->from_email,
                'from_name' => $setting->from_name,
            ]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            $this->logPush($client, 'system_mail', "Pushed '{$setting->purpose}' mail settings ({$setting->label})", true, pushedBy: $adminId);

            return ['success' => true];
        } catch (Throwable $e) {
            $this->logPush($client, 'system_mail', 'Push failed', false, $e->getMessage(), $adminId);
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /**
     * Encrypt a value the way that client's own Eloquent `encrypted`
     * cast would (`Crypt::encryptString()`), using ITS `APP_KEY` — not
     * Central Command's own. Both apps are Laravel, so the exact same
     * `Encrypter` class (bundled with laravel/framework) reproduces the
     * client's own cast byte for byte; the client's later `->password`
     * read decrypts it transparently, same as if its own app had
     * written the row.
     */
    private function encryptForClient(string $appKey, string $value): string
    {
        $raw = str_starts_with($appKey, 'base64:') ? base64_decode(substr($appKey, 7)) : $appKey;

        return (new Encrypter($raw, 'aes-256-cbc'))->encryptString($value);
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

    // ── Remote upgrades (schema contract §1b) ──────────────────────

    private const UPGRADE_UNSUPPORTED = "This client's install does not have remote-upgrade support yet (tables upgrade_requests / upgrade_agent_state missing). Upgrade it once by hand on its server with ./deploy/upgrade.sh -- every upgrade after that can be started from here.";

    private function hasUpgradeTables(PDO $pdo): bool
    {
        return (bool) $pdo->query("SELECT to_regclass('public.upgrade_requests') IS NOT NULL AND to_regclass('public.upgrade_agent_state') IS NOT NULL")->fetchColumn();
    }

    /** @return array<string, mixed> the row with its timestamps as ISO-8601 strings */
    private function isoRow(array $row): array
    {
        foreach ($row as $k => $v) {
            if (is_string($v) && (str_ends_with($k, '_at')) && $v !== '') {
                $row[$k] = Carbon::parse($v)->toISOString();
            }
        }
        if (array_key_exists('commits_behind', $row)) {
            $row['commits_behind'] = (int) $row['commits_behind'];
        }

        return $row;
    }

    /** What a client's host agent last reported plus its request queue, in the shape App\Support\UpgradeStatus defines. */
    public function readUpgradeStatus(Client $client): array
    {
        try {
            $pdo = $this->connect($client);
            if (! $this->hasUpgradeTables($pdo)) {
                return UpgradeStatus::unsupported(self::UPGRADE_UNSUPPORTED);
            }

            $agent = $pdo->query('SELECT * FROM upgrade_agent_state WHERE id = 1')->fetch(PDO::FETCH_ASSOC) ?: null;
            $active = $pdo->query("SELECT * FROM upgrade_requests WHERE status IN ('pending','running') ORDER BY requested_at LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: null;
            $history = $pdo->query('SELECT * FROM upgrade_requests ORDER BY requested_at DESC LIMIT 20')->fetchAll(PDO::FETCH_ASSOC);

            return UpgradeStatus::shape(
                $agent ? $this->isoRow($agent) : null,
                $active ? $this->isoRow($active) : null,
                array_map($this->isoRow(...), $history),
            );
        } catch (ClientDbException $e) {
            throw $e;
        } catch (Throwable $e) {
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Queue an upgrade or rollback for the client's own host agent to perform. */
    public function requestUpgrade(Client $client, string $kind, string $targetRef, string $adminId): array
    {
        try {
            $pdo = $this->connect($client);
            if (! $this->hasUpgradeTables($pdo)) {
                throw new \RuntimeException(self::UPGRADE_UNSUPPORTED);
            }
            $active = $pdo->query("SELECT 1 FROM upgrade_requests WHERE status IN ('pending','running') LIMIT 1")->fetchColumn();
            if ($active) {
                // The client answered fine -- this is a conflict, not a connection problem.
                throw new ClientDbException('An upgrade is already pending or running on this client.', 409);
            }

            $id = (string) Str::uuid();
            $stmt = $pdo->prepare(<<<'SQL'
                INSERT INTO upgrade_requests (id, kind, target_ref, status, requested_by, requested_at)
                VALUES (:id, :kind, :target_ref, 'pending', :requested_by, NOW())
            SQL);
            $stmt->execute(['id' => $id, 'kind' => $kind, 'target_ref' => $targetRef, 'requested_by' => "central-command:{$adminId}"]);

            $client->last_connected_at = Carbon::now();
            $client->save();
            $this->logPush($client, 'version', ucfirst($kind).' requested to '.substr($targetRef, 0, 12), true, pushedBy: $adminId);

            return ['success' => true, 'request_id' => $id];
        } catch (Throwable $e) {
            $this->logPush($client, 'version', ucfirst($kind).' request failed', false, $e->getMessage(), $adminId);
            throw $e instanceof ClientDbException ? $e : new ClientDbException($e->getMessage(), 0, $e);
        }
    }

    /** Withdraw a request the client's agent has not picked up yet. */
    public function cancelUpgradeRequest(Client $client, string $requestId, string $adminId): array
    {
        try {
            $pdo = $this->connect($client);
            $stmt = $pdo->prepare("UPDATE upgrade_requests SET status = 'cancelled', finished_at = NOW() WHERE id = :id AND status = 'pending'");
            $stmt->execute(['id' => $requestId]);
            if ($stmt->rowCount() === 0) {
                throw new \RuntimeException('Only a request the agent has not picked up yet can be cancelled.');
            }
            $this->logPush($client, 'version', 'Upgrade request cancelled', true, pushedBy: $adminId);

            return ['success' => true];
        } catch (Throwable $e) {
            throw new ClientDbException($e->getMessage(), 0, $e);
        }
    }
}
