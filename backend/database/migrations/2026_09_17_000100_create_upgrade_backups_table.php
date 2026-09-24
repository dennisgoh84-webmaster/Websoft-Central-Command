<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('upgrade_backups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('client_id')->constrained('clients')->cascadeOnDelete();
            $table->uuid('version_history_id')->nullable()->constrained('version_history')->cascadeOnDelete();

            // Backup metadata
            $table->string('from_version', 50); // Version being upgraded FROM
            $table->string('to_version', 50); // Version being upgraded TO
            $table->enum('backup_type', ['database', 'code', 'full'])->default('full');
            $table->bigInteger('backup_size_bytes')->nullable(); // Size of backup
            $table->string('backup_path', 500); // Path on client server where backup is stored

            // Status tracking
            $table->enum('status', ['pending', 'completed', 'failed', 'restored'])->default('pending');
            $table->text('error_message')->nullable();
            $table->timestamp('created_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('restored_at')->nullable();

            $table->index('client_id');
            $table->index(['client_id', 'status']);
            $table->index('version_history_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('upgrade_backups');
    }
};
