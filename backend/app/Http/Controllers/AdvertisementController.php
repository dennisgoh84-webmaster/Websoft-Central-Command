<?php

namespace App\Http\Controllers;

use App\Models\AdAssignment;
use App\Models\Advertisement;
use App\Models\Client;
use App\Models\VideoAssignment;
use App\Models\VideoSetting;
use App\Services\ClientDbService;
use App\Support\ApiException;
use App\Support\ClientDbException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Advertisement management + push to client DBs. */
class AdvertisementController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    // ── Announcements ────────────────────────────────────────────────

    public function index()
    {
        $ads = Advertisement::with('assignments')->orderBy('sort_order')->get();

        return response()->json($ads->map($this->adOut(...))->all());
    }

    public function store(Request $request)
    {
        $ad = new Advertisement([
            'tag' => $request->input('tag'),
            'text' => $request->input('text'),
            'sort_order' => $request->input('sort_order', 0),
            'is_active' => $request->boolean('is_active', true),
        ]);
        $ad->save();
        $ad->refresh();

        foreach ((array) $request->input('client_ids', []) as $clientId) {
            AdAssignment::create(['advertisement_id' => $ad->id, 'client_id' => $clientId]);
        }

        $ad->load('assignments');

        return response()->json($this->adOut($ad), 201);
    }

    public function update(string $adId, Request $request)
    {
        $ad = Advertisement::find($adId);
        if (! $ad) {
            throw new ApiException(404, 'Advertisement not found');
        }

        foreach (['tag', 'text', 'sort_order', 'is_active'] as $field) {
            if ($request->exists($field)) {
                $ad->{$field} = $request->input($field);
            }
        }
        $ad->save();

        if ($request->exists('client_ids')) {
            AdAssignment::where('advertisement_id', $ad->id)->delete();
            foreach ((array) $request->input('client_ids', []) as $clientId) {
                AdAssignment::create(['advertisement_id' => $ad->id, 'client_id' => $clientId]);
            }
        }

        $ad->load('assignments');

        return response()->json($this->adOut($ad));
    }

    public function destroy(string $adId)
    {
        $ad = Advertisement::find($adId);
        if (! $ad) {
            throw new ApiException(404, 'Advertisement not found');
        }
        $ad->delete();

        return response()->noContent();
    }

    /** Push this advertisement to all assigned clients. */
    public function push(string $adId, Request $request)
    {
        $ad = Advertisement::with('assignments')->find($adId);
        if (! $ad) {
            throw new ApiException(404, 'Advertisement not found');
        }
        $adminId = (string) $request->attributes->get('admin')->id;

        $results = [];
        foreach ($ad->assignments as $assignment) {
            $client = Client::find($assignment->client_id);
            if (! $client) {
                continue;
            }
            try {
                $this->clientDb->pushAnnouncements($client, [[
                    'id' => (string) $ad->id,
                    'tag' => $ad->tag,
                    'text' => $ad->text,
                    'sort_order' => $ad->sort_order,
                    'is_active' => $ad->is_active,
                ]], $adminId);
                $assignment->pushed_at = Carbon::now();
                $assignment->save();
                $results[] = ['client' => $client->name, 'success' => true];
            } catch (ClientDbException $e) {
                $results[] = ['client' => $client->name, 'success' => false, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['results' => $results]);
    }

    /** Push ALL active advertisements to their assigned clients. */
    public function pushAll(Request $request)
    {
        $ads = Advertisement::with('assignments')->where('is_active', true)->get();
        $adminId = (string) $request->attributes->get('admin')->id;

        // Group announcements by client
        $byClient = [];
        foreach ($ads as $ad) {
            foreach ($ad->assignments as $assignment) {
                $byClient[$assignment->client_id][] = [
                    'id' => (string) $ad->id,
                    'tag' => $ad->tag,
                    'text' => $ad->text,
                    'sort_order' => $ad->sort_order,
                    'is_active' => $ad->is_active,
                ];
            }
        }

        $results = [];
        foreach ($byClient as $clientId => $announcements) {
            $client = Client::find($clientId);
            if (! $client) {
                continue;
            }
            try {
                $this->clientDb->pushAnnouncements($client, $announcements, $adminId);
                $results[] = ['client' => $client->name, 'success' => true, 'count' => count($announcements)];
            } catch (ClientDbException $e) {
                $results[] = ['client' => $client->name, 'success' => false, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['results' => $results]);
    }

    // ── Video Settings ───────────────────────────────────────────────

    public function listVideos()
    {
        $videos = VideoSetting::with('assignments')->orderByDesc('created_at')->get();

        return response()->json($videos->map($this->videoOut(...))->all());
    }

    public function storeVideo(Request $request)
    {
        $video = new VideoSetting([
            'video_url' => $request->input('video_url'),
            'label' => $request->input('label', 'Default'),
        ]);
        $video->save();
        $video->refresh();

        foreach ((array) $request->input('client_ids', []) as $clientId) {
            VideoAssignment::create(['video_setting_id' => $video->id, 'client_id' => $clientId]);
        }
        $video->load('assignments');

        return response()->json($this->videoOut($video), 201);
    }

    /** Push video URL to assigned clients. */
    public function pushVideo(string $videoId, Request $request)
    {
        $video = VideoSetting::find($videoId);
        if (! $video) {
            throw new ApiException(404, 'Video setting not found');
        }
        $adminId = (string) $request->attributes->get('admin')->id;

        $assignments = VideoAssignment::where('video_setting_id', $video->id)->get();
        $results = [];
        foreach ($assignments as $assignment) {
            $client = Client::find($assignment->client_id);
            if (! $client) {
                continue;
            }
            try {
                $this->clientDb->pushVideoUrl($client, $video->video_url, $adminId);
                $assignment->pushed_at = Carbon::now();
                $assignment->save();
                $results[] = ['client' => $client->name, 'success' => true];
            } catch (ClientDbException $e) {
                $results[] = ['client' => $client->name, 'success' => false, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['results' => $results]);
    }

    private function adOut(Advertisement $ad): array
    {
        return [
            'id' => (string) $ad->id,
            'tag' => $ad->tag,
            'text' => $ad->text,
            'sort_order' => $ad->sort_order,
            'is_active' => $ad->is_active,
            'created_at' => $ad->created_at?->toISOString(),
            'assignments' => $ad->assignments->map(fn (AdAssignment $a) => [
                'client_id' => (string) $a->client_id,
                'pushed_at' => $a->pushed_at?->toISOString(),
            ])->all(),
        ];
    }

    private function videoOut(VideoSetting $v): array
    {
        return [
            'id' => (string) $v->id,
            'video_url' => $v->video_url,
            'label' => $v->label,
            'is_active' => $v->is_active,
            'created_at' => $v->created_at?->toISOString(),
            'assignments' => $v->relationLoaded('assignments') ? $v->assignments->map(fn (VideoAssignment $a) => [
                'client_id' => (string) $a->client_id,
                'pushed_at' => $a->pushed_at?->toISOString(),
            ])->all() : [],
        ];
    }
}
