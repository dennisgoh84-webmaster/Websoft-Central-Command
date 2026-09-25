<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Which System Mail mailbox Central Command sends its OWN email through
 * -- sign-in codes, password-reset codes, username reminders
 * (2026-09-25). At most one; none = Central Command cannot email yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE system_mail_settings ADD COLUMN IF NOT EXISTS used_by_central_command BOOLEAN NOT NULL DEFAULT FALSE');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE system_mail_settings DROP COLUMN IF EXISTS used_by_central_command');
    }
};
