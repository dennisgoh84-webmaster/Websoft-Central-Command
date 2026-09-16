<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The client ERP's promo video split into two independent settings on
 * 2026-09-16 (websoft-service-erp App\Models\AdBannerSettings::SLOT_*)
 * -- one for the Login page, one for the in-app banner shown alongside
 * the sidebar -- and Dennis asked the same day for Central Command to
 * be able to push either one out ("this settings should be available
 * from central command to push out also"). A VideoSetting here now
 * targets exactly one client-side slot; existing rows (pushed before
 * the split existed) default to `login`, since that's the slot the
 * single shared setting always mapped onto client-side.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE video_settings ADD COLUMN slot VARCHAR(20) NOT NULL DEFAULT 'login'");
        DB::statement('ALTER TABLE video_settings ALTER COLUMN slot DROP DEFAULT');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE video_settings DROP COLUMN slot');
    }
};
