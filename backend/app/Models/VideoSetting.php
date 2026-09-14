<?php

namespace App\Models;

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
}
