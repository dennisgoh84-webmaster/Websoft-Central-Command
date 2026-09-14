<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Links an advertisement to a specific client for targeting. */
class AdAssignment extends CcModel
{
    public $timestamps = false;

    protected $table = 'ad_assignments';

    protected $fillable = ['advertisement_id', 'client_id', 'pushed_at'];

    protected function casts(): array
    {
        return ['pushed_at' => 'datetime'];
    }

    public function advertisement(): BelongsTo
    {
        return $this->belongsTo(Advertisement::class, 'advertisement_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
