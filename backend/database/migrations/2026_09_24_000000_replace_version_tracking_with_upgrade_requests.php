<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self-upgrade, done properly (Dennis, 2026-09-24). Central Command
 * runs inside Docker images, so the earlier in-container design
 * (git checkout + migrate from PHP -- cc_version_history) could never
 * have worked and is dropped here along with the client-side tables
 * that went with it (version_history, upgrade_backups). The replacement
 * mirrors what the client ERP now does:
 *
 *   - `cc_upgrade_requests` is a queue the CC Upgrade screen writes to.
 *   - scripts/upgrade-agent.sh, a systemd timer on the HOST, polls
 *     POST /api/cc-upgrade/agent/heartbeat once a minute, takes the next
 *     pending row, runs scripts/upgrade.sh <target_ref>, and reports.
 *   - `cc_upgrade_agent_state` is the single row the heartbeat keeps
 *     fresh: commit checked out, origin/main head, agent last seen.
 *
 * Client installs are driven the same way, but through their own
 * `upgrade_requests` / `upgrade_agent_state` tables written directly
 * by ClientDbService -- see docs/central-command-schema-contract.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('cc_version_history');
        Schema::dropIfExists('upgrade_backups');
        Schema::dropIfExists('version_history');

        Schema::create('cc_upgrade_agent_state', function (Blueprint $table) {
            $table->smallInteger('id')->primary();
            $table->string('current_sha', 40)->nullable();
            $table->text('current_subject')->nullable();
            $table->timestampTz('current_committed_at')->nullable();
            $table->string('remote_sha', 40)->nullable();
            $table->text('remote_subject')->nullable();
            $table->timestampTz('remote_committed_at')->nullable();
            $table->integer('commits_behind')->default(0);
            $table->string('agent_host', 200)->nullable();
            $table->timestampTz('last_heartbeat_at')->nullable();
        });

        Schema::create('cc_upgrade_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('kind', 10)->default('upgrade');
            $table->string('target_ref', 80);
            $table->string('status', 10)->default('pending');
            $table->string('requested_by', 200)->nullable();
            $table->timestampTz('requested_at')->useCurrent();
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('finished_at')->nullable();
            $table->string('from_sha', 40)->nullable();
            $table->string('to_sha', 40)->nullable();
            $table->text('log')->nullable();
            $table->text('error')->nullable();
            $table->index(['status', 'requested_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cc_upgrade_requests');
        Schema::dropIfExists('cc_upgrade_agent_state');
    }
};
