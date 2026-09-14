<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Mirrors Alembic revision 8c24275f88c3 (add_login_otps_table) from the
 * original Python backend, so a database created by this migration has
 * the identical schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE login_otps (
                id UUID NOT NULL PRIMARY KEY,
                admin_user_id UUID NOT NULL,
                otp_code VARCHAR(10) NOT NULL,
                purpose VARCHAR(30) NOT NULL,
                is_used BOOLEAN NOT NULL DEFAULT FALSE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS login_otps');
    }
};
