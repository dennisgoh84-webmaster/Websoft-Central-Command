<?php

namespace App\Models;

/**
 * Central Command admin users.
 *
 * These are Web Master Consultancy staff who operate Central Command,
 * NOT end-users of any client ERP. Very small table: Dennis + a handful
 * of IT staff.
 *
 * `role` controls what each staff member can do in Central Command:
 * - super_admin: full access, manage other staff, push anything
 * - admin: manage clients, push ads/licenses/config/versions
 * - support_engineer: view clients, push support logins for tech support
 * - viewer: read-only dashboard and client info
 */
class AdminUser extends CcModel
{
    public $timestamps = false;

    protected $table = 'admin_users';

    protected $fillable = [
        'username', 'full_name', 'email', 'hashed_password', 'role', 'is_active',
    ];

    protected $hidden = ['hashed_password'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_at' => 'datetime',
        ];
    }
}
