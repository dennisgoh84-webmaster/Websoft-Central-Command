<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One log entry per push operation to a client DB. */
class PushLog extends CcModel
{
    public $timestamps = false;

    protected $table = 'push_logs';

    protected $fillable = [
        'client_id', 'push_type', 'detail', 'success', 'error_message', 'pushed_by',
    ];

    protected function casts(): array
    {
        return [
            'push_type' => UppercaseDbEnum::class,
            'success' => 'boolean',
            'pushed_at' => 'datetime',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
