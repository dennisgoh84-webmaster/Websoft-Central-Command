<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;

/** One published version of the Websoft Service ERP platform. */
class ErpVersion extends CcModel
{
    public $timestamps = false;

    protected $table = 'erp_versions';

    protected $fillable = [
        'version_number', 'alembic_head', 'release_notes', 'status',
        'is_latest', 'released_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => UppercaseDbEnum::class,
            'is_latest' => 'boolean',
            'released_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }
}
