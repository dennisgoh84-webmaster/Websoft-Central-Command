<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VersionHistory extends Model
{
    protected $table = 'version_history';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'client_id',
        'version',
        'status',
        'release_notes',
        'deployed_at',
        'deployed_by',
    ];

    protected $casts = [
        'deployed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function backups(): HasMany
    {
        return $this->hasMany(UpgradeBackup::class, 'version_history_id');
    }

    public static function getCurrentVersion(string $clientId): ?self
    {
        return self::where('client_id', $clientId)
            ->where('status', 'current')
            ->latest('deployed_at')
            ->first();
    }

    public static function getPreviousVersion(string $clientId): ?self
    {
        return self::where('client_id', $clientId)
            ->where('status', 'previous')
            ->latest('deployed_at')
            ->first();
    }
}
