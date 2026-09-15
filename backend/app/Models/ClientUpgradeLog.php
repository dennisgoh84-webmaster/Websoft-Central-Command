<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Records each upgrade push attempt to a client. */
class ClientUpgradeLog extends CcModel
{
    public $timestamps = false;

    protected $table = 'client_upgrade_logs';

    protected $fillable = [
        'client_id', 'from_version', 'to_version', 'to_migration_head',
        'success', 'error_message', 'upgraded_by',
    ];

    protected function casts(): array
    {
        return [
            'success' => 'boolean',
            'upgraded_at' => 'datetime',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
