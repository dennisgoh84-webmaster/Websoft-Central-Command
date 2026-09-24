<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UpgradeBackup extends Model
{
    protected $table = 'upgrade_backups';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = [
        'client_id',
        'version_history_id',
        'from_version',
        'to_version',
        'backup_type',
        'backup_size_bytes',
        'backup_path',
        'status',
        'error_message',
        'created_at',
        'completed_at',
        'restored_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'completed_at' => 'datetime',
        'restored_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function versionHistory(): BelongsTo
    {
        return $this->belongsTo(VersionHistory::class, 'version_history_id');
    }

    public static function getLatestBackup(string $clientId): ?self
    {
        return self::where('client_id', $clientId)
            ->where('status', '!=', 'failed')
            ->latest('created_at')
            ->first();
    }
}
