<?php

namespace App\Models;

class CcVersionHistory extends CcModel
{
    public $timestamps = false;

    protected $table = 'cc_version_history';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['id', 'version', 'status', 'release_notes', 'backup_path', 'error_message', 'upgraded_at', 'created_at'];

    protected function casts(): array
    {
        return [
            'upgraded_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    public static function getCurrentVersion()
    {
        return self::where('status', 'current')->first();
    }

    public static function getPreviousVersion()
    {
        return self::where('status', 'previous')->first();
    }
}
