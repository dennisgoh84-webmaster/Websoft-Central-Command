<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\SystemMailSetting;
use App\Models\SystemMailSettingAssignment;
use App\Services\ClientDbService;
use App\Support\ApiException;
use App\Support\ClientDbException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * System Mail Settings — the two system-level mailboxes (`otp`,
 * `helpdesk`) a client ERP install sends from, owned centrally and
 * pushed into that client's `system_mail_settings` table. See
 * docs/central-command-schema-contract.md §7 and
 * ClientDbService::pushSystemMailSetting().
 */
class SystemMailController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    public function index()
    {
        $settings = SystemMailSetting::with('assignments')->orderBy('purpose')->orderByDesc('created_at')->get();

        return response()->json($settings->map($this->settingOut(...))->all());
    }

    public function store(Request $request)
    {
        $purpose = (string) $request->input('purpose');
        if (! in_array($purpose, SystemMailSetting::PURPOSES, true)) {
            throw new ApiException(400, 'Invalid purpose. Must be one of: '.implode(', ', SystemMailSetting::PURPOSES));
        }

        $setting = new SystemMailSetting([
            'purpose' => $purpose,
            'label' => $request->input('label', ucfirst($purpose).' mailbox'),
            'host' => $request->input('host'),
            'port' => $request->input('port', 587),
            'username' => $request->input('username'),
            'password' => $request->filled('password') ? $request->input('password') : null,
            'use_tls' => $request->boolean('use_tls', true),
            'from_email' => $request->input('from_email'),
            'from_name' => $request->input('from_name'),
        ]);
        $setting->save();
        $setting->refresh();

        foreach ((array) $request->input('client_ids', []) as $clientId) {
            SystemMailSettingAssignment::create(['system_mail_setting_id' => $setting->id, 'client_id' => $clientId]);
        }
        $setting->load('assignments');

        return response()->json($this->settingOut($setting), 201);
    }

    public function update(string $settingId, Request $request)
    {
        $setting = SystemMailSetting::find($settingId);
        if (! $setting) {
            throw new ApiException(404, 'System mail setting not found');
        }

        foreach (['label', 'host', 'port', 'username', 'from_email', 'from_name'] as $field) {
            if ($request->exists($field)) {
                $setting->{$field} = $request->input($field);
            }
        }
        if ($request->exists('use_tls')) {
            $setting->use_tls = $request->boolean('use_tls');
        }
        // Same "leave blank to keep current" contract as Client::db_password —
        // the API never returns the stored password, so only overwrite it
        // when the admin actually typed a new one.
        if ($request->filled('password')) {
            $setting->password = $request->input('password');
        }

        if ($request->exists('client_ids')) {
            SystemMailSettingAssignment::where('system_mail_setting_id', $setting->id)->delete();
            foreach ((array) $request->input('client_ids', []) as $clientId) {
                SystemMailSettingAssignment::create(['system_mail_setting_id' => $setting->id, 'client_id' => $clientId]);
            }
        }

        $setting->save();
        $setting->load('assignments');

        return response()->json($this->settingOut($setting));
    }

    public function destroy(string $settingId)
    {
        $setting = SystemMailSetting::find($settingId);
        if (! $setting) {
            throw new ApiException(404, 'System mail setting not found');
        }
        $setting->delete();

        return response()->noContent();
    }

    /** Push this mailbox config to all assigned clients. */
    public function push(string $settingId, Request $request)
    {
        $setting = SystemMailSetting::with('assignments')->find($settingId);
        if (! $setting) {
            throw new ApiException(404, 'System mail setting not found');
        }
        $adminId = (string) $request->attributes->get('admin')->id;

        $results = [];
        foreach ($setting->assignments as $assignment) {
            $client = Client::find($assignment->client_id);
            if (! $client) {
                continue;
            }
            try {
                $this->clientDb->pushSystemMailSetting($client, $setting, $adminId);
                $assignment->pushed_at = Carbon::now();
                $assignment->save();
                $results[] = ['client' => $client->name, 'success' => true];
            } catch (ClientDbException $e) {
                $results[] = ['client' => $client->name, 'success' => false, 'error' => $e->getMessage()];
            }
        }

        return response()->json(['results' => $results]);
    }

    private function settingOut(SystemMailSetting $s): array
    {
        return [
            'id' => (string) $s->id,
            'purpose' => $s->purpose,
            'label' => $s->label,
            'host' => $s->host,
            'port' => $s->port,
            'username' => $s->username,
            'password_set' => $s->password_set,
            'use_tls' => $s->use_tls,
            'from_email' => $s->from_email,
            'from_name' => $s->from_name,
            'created_at' => $s->created_at?->toISOString(),
            'assignments' => $s->relationLoaded('assignments') ? $s->assignments->map(fn (SystemMailSettingAssignment $a) => [
                'client_id' => (string) $a->client_id,
                'pushed_at' => $a->pushed_at?->toISOString(),
            ])->all() : [],
        ];
    }
}
