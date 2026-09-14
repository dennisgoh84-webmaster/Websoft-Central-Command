<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Services\ClientDbService;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Client registry CRUD + connection testing. */
class ClientController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    public function index()
    {
        $clients = Client::orderBy('name')->get();

        return response()->json($clients->map($this->summary(...))->all());
    }

    public function show(string $clientId)
    {
        return response()->json($this->full($this->findOrFail($clientId)));
    }

    public function store(Request $request)
    {
        $code = (string) $request->input('code');
        if (Client::where('code', $code)->exists()) {
            throw new ApiException(400, "Client code '{$code}' already exists");
        }

        $client = new Client([
            'name' => $request->input('name'),
            'code' => $code,
            'db_host' => $request->input('db_host'),
            'db_port' => $request->input('db_port', 5432),
            'db_name' => $request->input('db_name'),
            'db_username' => $request->input('db_username'),
            'db_password' => $request->input('db_password'),
            'db_use_tls' => $request->boolean('db_use_tls', true),
            'status' => 'active',
            'notes' => $request->input('notes'),
            'max_licenses' => $request->input('max_licenses'),
        ]);
        $client->save();

        return response()->json($this->full($client), 201);
    }

    public function update(string $clientId, Request $request)
    {
        $client = $this->findOrFail($clientId);

        foreach ([
            'name', 'db_host', 'db_port', 'db_name', 'db_username', 'db_password',
            'db_use_tls', 'status', 'notes', 'max_licenses',
        ] as $field) {
            if ($request->exists($field)) {
                $client->{$field} = $request->input($field);
            }
        }
        $client->save();

        return response()->json($this->full($client));
    }

    public function testConnection(string $clientId)
    {
        $client = $this->findOrFail($clientId);
        $result = $this->clientDb->testConnection($client);

        if ($result['success']) {
            $client->last_connected_at = Carbon::now();
            $client->last_known_alembic_head = $result['alembic_head'] ?? null;
            $client->save();
        }

        return response()->json($result);
    }

    public function destroy(string $clientId)
    {
        $client = $this->findOrFail($clientId);
        $client->delete();

        return response()->noContent();
    }

    private function findOrFail(string $clientId): Client
    {
        $client = Client::find($clientId);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }

        return $client;
    }

    private function summary(Client $c): array
    {
        return [
            'id' => (string) $c->id,
            'name' => $c->name,
            'code' => $c->code,
            'status' => $c->status,
            'max_licenses' => $c->max_licenses,
            'last_connected_at' => $c->last_connected_at?->toISOString(),
            'last_known_alembic_head' => $c->last_known_alembic_head,
        ];
    }

    private function full(Client $c): array
    {
        return [
            'id' => (string) $c->id,
            'name' => $c->name,
            'code' => $c->code,
            'db_host' => $c->db_host,
            'db_port' => $c->db_port,
            'db_name' => $c->db_name,
            'db_username' => $c->db_username,
            'db_use_tls' => $c->db_use_tls,
            'status' => $c->status,
            'notes' => $c->notes,
            'max_licenses' => $c->max_licenses,
            'last_connected_at' => $c->last_connected_at?->toISOString(),
            'last_known_alembic_head' => $c->last_known_alembic_head,
            'created_at' => $c->created_at?->toISOString(),
            'updated_at' => $c->updated_at?->toISOString(),
        ];
    }
}
