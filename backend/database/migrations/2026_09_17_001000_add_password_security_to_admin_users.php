<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add password security fields to admin_users
        Schema::table('admin_users', function (Blueprint $table) {
            $table->boolean('force_password_change_on_next_login')->default(false)->after('password');
            $table->timestamp('last_password_changed_at')->nullable()->after('force_password_change_on_next_login');
        });

        // Create password history table
        Schema::create('admin_password_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('admin_user_id')->constrained('admin_users')->cascadeOnDelete();
            $table->string('hashed_password'); // Hashed old password
            $table->timestamp('changed_at');

            $table->index('admin_user_id');
            $table->index(['admin_user_id', 'changed_at']);
        });

        // Same for support logins
        Schema::table('support_logins', function (Blueprint $table) {
            $table->boolean('force_password_change_on_next_login')->default(false)->after('login_password');
            $table->timestamp('last_password_changed_at')->nullable()->after('force_password_change_on_next_login');
        });

        Schema::create('support_login_password_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('support_login_id')->constrained('support_logins')->cascadeOnDelete();
            $table->string('hashed_password');
            $table->timestamp('changed_at');

            $table->index('support_login_id');
            $table->index(['support_login_id', 'changed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_login_password_history');
        Schema::dropIfExists('admin_password_history');
        Schema::table('support_logins', function (Blueprint $table) {
            $table->dropColumn('force_password_change_on_next_login', 'last_password_changed_at');
        });
        Schema::table('admin_users', function (Blueprint $table) {
            $table->dropColumn('force_password_change_on_next_login', 'last_password_changed_at');
        });
    }
};
