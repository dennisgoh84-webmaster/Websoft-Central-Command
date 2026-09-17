<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('cc_version_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('version')->index();
            $table->string('status')->default('current'); // current, previous, failed, rollback
            $table->text('release_notes')->nullable();
            $table->string('backup_path')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('upgraded_at');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['status', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cc_version_history');
    }
};
