<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Server/system configuration push (planned-work.md #8c): the client
 * ERP now has its own `system_mail_settings` table (one row per
 * purpose — `otp`, `helpdesk`) with the password behind Eloquent's
 * `encrypted` cast, keyed to *that client's own* APP_KEY. Central
 * Command is meant to hold the master copy and push it down — see
 * docs/central-command-schema-contract.md §7.
 *
 * This migration adds:
 *   - `clients.app_key` — the target install's Laravel APP_KEY, needed
 *     so ClientDbService can encrypt the password the same way that
 *     client's own Eloquent cast would (see
 *     ClientDbService::encryptForClient()). Never returned by the API,
 *     same as db_password.
 *   - `system_mail_settings` / `system_mail_setting_assignments` —
 *     Central Command's own record of what to push, mirroring the
 *     video_settings / ad_assignments pattern (create once, target
 *     clients, push, track when each client last received it).
 *   - `SYSTEM_MAIL` added to the `push_type` enum for push_logs.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE clients ADD COLUMN app_key VARCHAR(500)');

        DB::statement("ALTER TYPE push_type ADD VALUE IF NOT EXISTS 'SYSTEM_MAIL'");

        DB::statement("CREATE TYPE mail_purpose AS ENUM ('OTP', 'HELPDESK')");

        DB::statement(<<<'SQL'
            CREATE TABLE system_mail_settings (
                id UUID NOT NULL PRIMARY KEY,
                purpose mail_purpose NOT NULL,
                label VARCHAR(200) NOT NULL,
                host VARCHAR(255),
                port INTEGER NOT NULL DEFAULT 587,
                username VARCHAR(255),
                password VARCHAR(500),
                use_tls BOOLEAN NOT NULL DEFAULT TRUE,
                from_email VARCHAR(255),
                from_name VARCHAR(255),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE system_mail_setting_assignments (
                id UUID NOT NULL PRIMARY KEY,
                system_mail_setting_id UUID NOT NULL REFERENCES system_mail_settings(id) ON DELETE CASCADE,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                pushed_at TIMESTAMPTZ
            )
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS system_mail_setting_assignments');
        DB::statement('DROP TABLE IF EXISTS system_mail_settings');
        DB::statement('DROP TYPE IF EXISTS mail_purpose');
        // push_type's added enum value and clients.app_key are left in
        // place — Postgres cannot drop a single enum value, and the
        // column is harmless to leave (nullable, unused once this
        // migration is rolled back).
    }
};
