<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportLoginPasswordHistory extends Model
{
    protected $table = 'support_login_password_history';
    protected $keyType = 'string';
    public $incrementing = false;
    public $timestamps = false;

    protected $fillable = ['id', 'support_login_id', 'hashed_password', 'changed_at'];
    protected $casts = ['changed_at' => 'datetime'];

    public function supportLogin(): BelongsTo
    {
        return $this->belongsTo(SupportLogin::class);
    }
}
