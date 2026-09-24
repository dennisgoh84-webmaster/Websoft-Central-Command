<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The single row scripts/upgrade-agent.sh keeps fresh on every heartbeat. */
class CcUpgradeAgentState extends Model
{
    public $timestamps = false;

    public $incrementing = false;

    protected $table = 'cc_upgrade_agent_state';

    protected $fillable = [
        'id', 'current_sha', 'current_subject', 'current_committed_at',
        'remote_sha', 'remote_subject', 'remote_committed_at', 'commits_behind',
        'agent_host', 'last_heartbeat_at',
    ];

    protected function casts(): array
    {
        return [
            'current_committed_at' => 'datetime',
            'remote_committed_at' => 'datetime',
            'commits_behind' => 'integer',
            'last_heartbeat_at' => 'datetime',
        ];
    }

    public static function singleton(): self
    {
        return self::firstOrCreate(['id' => 1]);
    }
}
