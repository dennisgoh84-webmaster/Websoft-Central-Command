<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\ConfigPushLog;
use App\Models\ConfigUpdate;
use App\Services\ClientDbService;
use App\Support\ApiException;
use App\Support\ClientDbException;
use Illuminate\Http\Request;

/** Config update management + push to client DBs. */
class ConfigUpdateController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    public function index()
    {
        $updates = ConfigUpdate::with('pushLogs')->orderByDesc('created_at')->get();

        return response()->json($updates->map($this->out(...))->all());
    }

    public function show(string $updateId)
    {
        return response()->json($this->out($this->findOrFail($updateId, with: true)));
    }

    public function store(Request $request)
    {
        $cu = new ConfigUpdate([
            'title' => $request->input('title'),
            'description' => $request->input('description'),
            'sql_statement' => $request->input('sql_statement'),
            'status' => 'draft',
        ]);
        $cu->save();
        $cu->load('pushLogs');

        return response()->json($this->out($cu), 201);
    }

    public function update(string $updateId, Request $request)
    {
        $cu = $this->findOrFail($updateId);

        foreach (['title', 'description', 'sql_statement', 'status'] as $field) {
            if ($request->exists($field)) {
                $cu->{$field} = $request->input($field);
            }
        }
        $cu->save();
        $cu->load('pushLogs');

        return response()->json($this->out($cu));
    }

    /** Push a config update to ALL active clients. */
    public function push(string $updateId, Request $request)
    {
        $cu = $this->findOrFail($updateId);
        if ($cu->status === 'draft') {
            throw new ApiException(400, "Config update is still in draft — set status to 'ready' first");
        }
        $adminId = (string) $request->attributes->get('admin')->id;

        $clients = Client::where('status', 'ACTIVE')->get();
        $results = [];
        $successes = 0;

        foreach ($clients as $client) {
            try {
                $this->clientDb->pushConfigSql($client, $cu->sql_statement, $adminId);
                ConfigPushLog::create(['config_update_id' => $cu->id, 'client_id' => $client->id, 'success' => true]);
                $results[] = ['client' => $client->name, 'success' => true];
                $successes++;
            } catch (ClientDbException $e) {
                ConfigPushLog::create([
                    'config_update_id' => $cu->id, 'client_id' => $client->id,
                    'success' => false, 'error_message' => $e->getMessage(),
                ]);
                $results[] = ['client' => $client->name, 'success' => false, 'error' => $e->getMessage()];
            }
        }

        $cu->status = $successes === $clients->count() ? 'pushed' : ($successes > 0 ? 'partial' : $cu->status);
        $cu->save();

        return response()->json(['results' => $results, 'total' => $clients->count(), 'successes' => $successes]);
    }

    /** Push a config update to a specific client. */
    public function pushToClient(string $updateId, string $clientId, Request $request)
    {
        $cu = $this->findOrFail($updateId);
        $client = Client::find($clientId);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }
        $adminId = (string) $request->attributes->get('admin')->id;

        try {
            $result = $this->clientDb->pushConfigSql($client, $cu->sql_statement, $adminId);
            ConfigPushLog::create(['config_update_id' => $cu->id, 'client_id' => $client->id, 'success' => true]);

            return response()->json($result);
        } catch (ClientDbException $e) {
            ConfigPushLog::create([
                'config_update_id' => $cu->id, 'client_id' => $client->id,
                'success' => false, 'error_message' => $e->getMessage(),
            ]);
            throw new ApiException(502, "Push failed: {$e->getMessage()}");
        }
    }

    private function findOrFail(string $updateId, bool $with = false): ConfigUpdate
    {
        $cu = $with ? ConfigUpdate::with('pushLogs')->find($updateId) : ConfigUpdate::find($updateId);
        if (! $cu) {
            throw new ApiException(404, 'Config update not found');
        }

        return $cu;
    }

    private function out(ConfigUpdate $cu): array
    {
        return [
            'id' => (string) $cu->id,
            'title' => $cu->title,
            'description' => $cu->description,
            'sql_statement' => $cu->sql_statement,
            'status' => $cu->status,
            'created_at' => $cu->created_at?->toISOString(),
            'updated_at' => $cu->updated_at?->toISOString(),
            'push_logs' => $cu->relationLoaded('pushLogs') ? $cu->pushLogs->map(fn (ConfigPushLog $l) => [
                'id' => (string) $l->id,
                'client_id' => (string) $l->client_id,
                'success' => $l->success,
                'error_message' => $l->error_message,
                'pushed_at' => $l->pushed_at?->toISOString(),
            ])->all() : [],
        ];
    }
}
