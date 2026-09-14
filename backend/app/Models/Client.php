<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;

/**
 * Client registry — one row per deployed ERP instance.
 *
 * Central Command connects to each client's PostgreSQL to push ads,
 * manage licenses, and push config updates. Connection credentials are
 * stored here (encrypted at rest in production via env-level encryption
 * or a secrets manager — not in Central Command's app layer).
 */
class Client extends CcModel
{
    protected $table = 'clients';

    protected $fillable = [
        'name', 'code', 'db_host', 'db_port', 'db_name', 'db_username',
        'db_password', 'db_use_tls', 'status', 'notes', 'max_licenses',
        'last_connected_at', 'last_known_alembic_head',
    ];

    protected function casts(): array
    {
        return [
            'db_port' => 'integer',
            'db_use_tls' => 'boolean',
            'status' => UppercaseDbEnum::class,
            'max_licenses' => 'integer',
            'last_connected_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
