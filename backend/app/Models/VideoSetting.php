<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Master video URL setting pushed to one slot of a client's
 * ad_banner_settings -- `login` (the client's Login page) or `app`
 * (its in-app banner), mirroring websoft-service-erp's
 * App\Models\AdBannerSettings::SLOT_* split (2026-09-16).
 */
class VideoSetting extends CcModel
{
    public const SLOT_LOGIN = 'login';

    public const SLOT_APP = 'app';

    public const SLOTS = [self::SLOT_LOGIN, self::SLOT_APP];

    public $timestamps = false;

    protected $table = 'video_settings';

    protected $fillable = ['video_url', 'label', 'is_active', 'slot'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(VideoAssignment::class, 'video_setting_id');
    }
}
