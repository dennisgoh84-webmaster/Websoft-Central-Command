<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The client ERP retired its Python/Alembic backend (2026-09-15) — there
 * is no `alembic_version` table on any client database any more, and
 * schema compatibility is now checked against Laravel's own `migrations`
 * table instead (see docs/central-command-schema-contract.md §5). The
 * columns here that held an Alembic revision hash now hold the name of
 * the client's latest applied migration file, so "alembic head" is the
 * wrong word for what they store — rename to "migration head" to match.
 *
 * Also widens them from VARCHAR(50) to VARCHAR(255): 50 chars was sized
 * for Alembic's short revision hashes (e.g. `c3d4e5f6g7h8`), but a
 * Laravel migration filename is much longer — e.g.
 * `2026_09_30_000100_create_system_mail_settings_table` is 52 chars on
 * its own — and the old width raised "value too long for type character
 * varying(50)" on the very first real write. 255 matches Laravel's own
 * `migrations.migration` column.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE clients RENAME COLUMN last_known_alembic_head TO last_known_migration_head');
        DB::statement('ALTER TABLE client_upgrade_logs RENAME COLUMN to_alembic_head TO to_migration_head');
        DB::statement('ALTER TABLE erp_versions RENAME COLUMN alembic_head TO migration_head');

        DB::statement('ALTER TABLE clients ALTER COLUMN last_known_migration_head TYPE VARCHAR(255)');
        DB::statement('ALTER TABLE client_upgrade_logs ALTER COLUMN to_migration_head TYPE VARCHAR(255)');
        DB::statement('ALTER TABLE erp_versions ALTER COLUMN migration_head TYPE VARCHAR(255)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE erp_versions RENAME COLUMN migration_head TO alembic_head');
        DB::statement('ALTER TABLE client_upgrade_logs RENAME COLUMN to_migration_head TO to_alembic_head');
        DB::statement('ALTER TABLE clients RENAME COLUMN last_known_migration_head TO last_known_alembic_head');
    }
};
