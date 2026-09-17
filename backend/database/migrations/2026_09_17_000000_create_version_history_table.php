<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('version_history', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('client_id')->constrained('clients')->cascadeOnDelete();
            $table->string('version', 50); // e.g. "v1.2.3" or git commit hash
            $table->enum('status', ['current', 'previous', 'failed'])->default('previous');
            $table->text('release_notes')->nullable();
            $table->timestamp('deployed_at');
            $table->string('deployed_by', 255)->nullable();
            $table->timestamps();

            $table->index('client_id');
            $table->index(['client_id', 'deployed_at']);
            $table->unique(['client_id', 'status']); // Only one current/failed per client at a time
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('version_history');
    }
};
