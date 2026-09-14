<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Links a video setting to a specific client. */
class VideoAssignment extends CcModel
{
    public $timestamps = false;

    protected $table = 'video_assignments';

    protected $fillable = ['video_setting_id', 'client_id', 'pushed_at'];

    protected function casts(): array
    {
        return ['pushed_at' => 'datetime'];
    }

    public function videoSetting(): BelongsTo
    {
        return $this->belongsTo(VideoSetting::class, 'video_setting_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }
}
