<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks support staff logins pushed to client ERP databases.
 *
 * When a CC admin pushes a support login to a client, we create a user
 * in the client's `users` table and record it here. The login can
 * later be revoked (disabled) remotely.
 */
class SupportLogin extends CcModel
{
    public $timestamps = false;

    protected $table = 'support_logins';

    protected $fillable = [
        'admin_user_id', 'client_id', 'login_email', 'client_user_id',
        'status', 'reason', 'pushed_by', 'revoked_at', 'force_password_change_on_next_login',
    ];

    protected function casts(): array
    {
        return [
            'status' => UppercaseDbEnum::class,
            'force_password_change_on_next_login' => 'boolean',
            'pushed_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function adminUser(): BelongsTo
    {
        return $this->belongsTo(AdminUser::class, 'admin_user_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
