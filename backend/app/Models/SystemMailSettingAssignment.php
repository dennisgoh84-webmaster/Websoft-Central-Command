<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Links a system mail setting to a specific client for targeting. */
class SystemMailSettingAssignment extends CcModel
{
    public $timestamps = false;

    protected $table = 'system_mail_setting_assignments';

    protected $fillable = ['system_mail_setting_id', 'client_id', 'pushed_at'];

    protected function casts(): array
    {
        return ['pushed_at' => 'datetime'];
    }

    public function systemMailSetting(): BelongsTo
    {
        return $this->belongsTo(SystemMailSetting::class, 'system_mail_setting_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
