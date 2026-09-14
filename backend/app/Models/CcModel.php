<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Base model for everything in Central Command's own database.
 * Every table uses a client-generated UUID primary key, mirroring the
 * Python models (`default=uuid.uuid4`, generated in the app, not the DB).
 */
abstract class CcModel extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';
}
