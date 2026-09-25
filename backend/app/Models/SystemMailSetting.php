<?php

namespace App\Models;

use App\Casts\UppercaseDbEnum;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One system-mailbox configuration (`otp` or `helpdesk`), pushed into
 * a client's `system_mail_settings` table. This is Central Command's
 * own "master copy" — see docs/central-command-schema-contract.md §7.
 *
 * The password is never returned by the API (`$hidden`), same as
 * `Client::db_password` — only whether one is on file (`password_set`).
 */
class SystemMailSetting extends CcModel
{
    public const PURPOSE_OTP = 'otp';

    public const PURPOSE_HELPDESK = 'helpdesk';

    public const PURPOSES = [self::PURPOSE_OTP, self::PURPOSE_HELPDESK];

    public $timestamps = false;

    protected $table = 'system_mail_settings';

    protected $fillable = [
        'purpose', 'label', 'host', 'port', 'username', 'password',
        'use_tls', 'from_email', 'from_name',
    ];

    protected $hidden = ['password'];

    protected $appends = ['password_set'];

    protected function casts(): array
    {
        return [
            'purpose' => UppercaseDbEnum::class,
            'port' => 'integer',
            'use_tls' => 'boolean',
            'used_by_central_command' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function getPasswordSetAttribute(): bool
    {
        return (bool) $this->password;
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(SystemMailSettingAssignment::class, 'system_mail_setting_id');
    }
}
