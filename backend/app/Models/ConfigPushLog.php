<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tracks the result of pushing a config update to each client. */
class ConfigPushLog extends CcModel
{
    public $timestamps = false;

    protected $table = 'config_push_logs';

    protected $fillable = ['config_update_id', 'client_id', 'success', 'error_message'];

    protected function casts(): array
    {
        return [
            'success' => 'boolean',
            'pushed_at' => 'datetime',
        ];
    }

    public function configUpdate(): BelongsTo
    {
        return $this->belongsTo(ConfigUpdate::class, 'config_update_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
