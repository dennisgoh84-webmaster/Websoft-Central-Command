<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A named configuration change to push to client databases.
 *
 * The `sql_statement` is a parameterised SQL string (never user input)
 * written by the Central Command admin. It targets the client-side
 * schema (e.g. updating a tax rate, inserting a new default setting).
 */
class ConfigUpdate extends CcModel
{
    protected $table = 'config_updates';

    protected $fillable = ['title', 'description', 'sql_statement', 'status'];

    protected function casts(): array
    {
        return [
            'status' => UppercaseDbEnum::class,
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function pushLogs(): HasMany
    {
        return $this->hasMany(ConfigPushLog::class, 'config_update_id');
    }
}
