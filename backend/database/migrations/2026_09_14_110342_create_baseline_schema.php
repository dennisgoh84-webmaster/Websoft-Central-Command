<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Mirrors Alembic revision d4d7f9e535f6 (baseline schema for all
 * remaining tables) from the original Python backend, so a database
 * created by this migration has the identical schema (same tables,
 * columns, enum types, and foreign keys).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("CREATE TYPE client_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DECOMMISSIONED')");
        DB::statement("CREATE TYPE config_update_status AS ENUM ('DRAFT', 'READY', 'PUSHED', 'PARTIAL')");
        DB::statement("CREATE TYPE version_status AS ENUM ('DRAFT', 'RELEASED', 'DEPRECATED')");
        DB::statement("CREATE TYPE push_type AS ENUM ('ADVERTISEMENT', 'VIDEO', 'LICENSE', 'CONFIG', 'VERSION', 'SUPPORT_LOGIN')");
        DB::statement("CREATE TYPE support_login_status AS ENUM ('ACTIVE', 'REVOKED')");

        DB::statement(<<<'SQL'
            CREATE TABLE admin_users (
                id UUID NOT NULL PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                full_name VARCHAR(200) NOT NULL,
                email VARCHAR(255),
                hashed_password VARCHAR(200) NOT NULL,
                role VARCHAR(30) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE advertisements (
                id UUID NOT NULL PRIMARY KEY,
                tag VARCHAR(30),
                text TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE clients (
                id UUID NOT NULL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                code VARCHAR(20) NOT NULL UNIQUE,
                db_host VARCHAR(255) NOT NULL,
                db_port INTEGER NOT NULL DEFAULT 5432,
                db_name VARCHAR(100) NOT NULL,
                db_username VARCHAR(100) NOT NULL,
                db_password VARCHAR(500) NOT NULL,
                db_use_tls BOOLEAN NOT NULL DEFAULT TRUE,
                status client_status NOT NULL DEFAULT 'ACTIVE',
                notes TEXT,
                max_licenses INTEGER,
                last_connected_at TIMESTAMPTZ,
                last_known_alembic_head VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE config_updates (
                id UUID NOT NULL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                sql_statement TEXT NOT NULL,
                status config_update_status NOT NULL DEFAULT 'DRAFT',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE video_settings (
                id UUID NOT NULL PRIMARY KEY,
                video_url VARCHAR(1000),
                label VARCHAR(200) NOT NULL DEFAULT 'Default',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE ad_assignments (
                id UUID NOT NULL PRIMARY KEY,
                advertisement_id UUID NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                pushed_at TIMESTAMPTZ
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE client_upgrade_logs (
                id UUID NOT NULL PRIMARY KEY,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                from_version VARCHAR(50),
                to_version VARCHAR(20) NOT NULL,
                to_alembic_head VARCHAR(50) NOT NULL,
                success BOOLEAN NOT NULL DEFAULT FALSE,
                error_message TEXT,
                upgraded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                upgraded_by UUID REFERENCES admin_users(id)
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE config_push_logs (
                id UUID NOT NULL PRIMARY KEY,
                config_update_id UUID NOT NULL REFERENCES config_updates(id) ON DELETE CASCADE,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                success BOOLEAN NOT NULL DEFAULT FALSE,
                error_message TEXT,
                pushed_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE erp_versions (
                id UUID NOT NULL PRIMARY KEY,
                version_number VARCHAR(20) NOT NULL UNIQUE,
                alembic_head VARCHAR(50) NOT NULL,
                release_notes TEXT,
                status version_status NOT NULL DEFAULT 'DRAFT',
                is_latest BOOLEAN NOT NULL DEFAULT FALSE,
                released_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_by UUID REFERENCES admin_users(id)
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE push_logs (
                id UUID NOT NULL PRIMARY KEY,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                push_type push_type NOT NULL,
                detail VARCHAR(500) NOT NULL,
                success BOOLEAN NOT NULL DEFAULT TRUE,
                error_message TEXT,
                pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                pushed_by UUID REFERENCES admin_users(id)
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE support_logins (
                id UUID NOT NULL PRIMARY KEY,
                admin_user_id UUID NOT NULL REFERENCES admin_users(id),
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                login_email VARCHAR(255) NOT NULL,
                client_user_id VARCHAR(100),
                status support_login_status NOT NULL DEFAULT 'ACTIVE',
                reason TEXT,
                pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                pushed_by UUID REFERENCES admin_users(id),
                revoked_at TIMESTAMPTZ
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE video_assignments (
                id UUID NOT NULL PRIMARY KEY,
                video_setting_id UUID NOT NULL REFERENCES video_settings(id) ON DELETE CASCADE,
                client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                pushed_at TIMESTAMPTZ
            )
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS video_assignments');
        DB::statement('DROP TABLE IF EXISTS support_logins');
        DB::statement('DROP TABLE IF EXISTS push_logs');
        DB::statement('DROP TABLE IF EXISTS erp_versions');
        DB::statement('DROP TABLE IF EXISTS config_push_logs');
        DB::statement('DROP TABLE IF EXISTS client_upgrade_logs');
        DB::statement('DROP TABLE IF EXISTS ad_assignments');
        DB::statement('DROP TABLE IF EXISTS video_settings');
        DB::statement('DROP TABLE IF EXISTS config_updates');
        DB::statement('DROP TABLE IF EXISTS clients');
        DB::statement('DROP TABLE IF EXISTS advertisements');
        DB::statement('DROP TABLE IF EXISTS admin_users');

        DB::statement('DROP TYPE IF EXISTS support_login_status');
        DB::statement('DROP TYPE IF EXISTS push_type');
        DB::statement('DROP TYPE IF EXISTS version_status');
        DB::statement('DROP TYPE IF EXISTS config_update_status');
        DB::statement('DROP TYPE IF EXISTS client_status');
    }
};
