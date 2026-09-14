<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A master announcement record managed in Central Command, pushed to
 * client DBs. An advertisement is created once, then assigned to
 * specific clients via AdAssignment.
 */
class Advertisement extends CcModel
{
    public $timestamps = false;

    protected $table = 'advertisements';

    protected $fillable = ['tag', 'text', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(AdAssignment::class, 'advertisement_id');
    }
}
