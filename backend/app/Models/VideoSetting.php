<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

/** Master video URL setting pushed to client ad_banner_settings. */
class VideoSetting extends CcModel
{
    public $timestamps = false;

    protected $table = 'video_settings';

    protected $fillable = ['video_url', 'label', 'is_active'];

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
