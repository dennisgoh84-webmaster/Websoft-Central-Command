<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Services\ClientDbService;
use App\Support\ApiException;
use App\Support\ClientDbException;
use Illuminate\Http\Request;

/** License management — view and toggle module licenses on client DBs. */
class LicenseController extends Controller
{
    public function __construct(private ClientDbService $clientDb) {}

    /** Read all modules + their enabled state from a client DB. */
    public function modules(string $clientId)
    {
        $client = $this->findOrFail($clientId);
        try {
            return response()->json($this->clientDb->readClientModules($client));
        } catch (ClientDbException $e) {
            throw new ApiException(502, "Client DB error: {$e->getMessage()}");
        }
    }

    /** Enable or disable a module for a company in the client DB (uses the first company). */
    public function setModuleLicense(string $clientId, Request $request)
    {
        $client = $this->findOrFail($clientId);

        try {
            $modules = $this->clientDb->readClientModules($client);
            if (empty($modules)) {
                throw new ApiException(400, 'No companies found in client DB');
            }
            $companyId = $modules[0]['company_id'];

            $adminId = (string) $request->attributes->get('admin')->id;
            $result = $this->clientDb->pushLicenseChange(
                $client,
                $companyId,
                (string) $request->input('module_key'),
                $request->boolean('enabled'),
                $request->input('license_type'),
                $request->input('notes'),
                $adminId,
            );

            return response()->json($result);
        } catch (ClientDbException $e) {
            throw new ApiException(502, "Client DB error: {$e->getMessage()}");
        }
    }

    /** Enable or disable a specific module for a specific company. */
    public function setCompanyModuleLicense(string $clientId, string $companyId, Request $request)
    {
        $client = $this->findOrFail($clientId);

        try {
            $adminId = (string) $request->attributes->get('admin')->id;
            $result = $this->clientDb->pushLicenseChange(
                $client,
                $companyId,
                (string) $request->input('module_key'),
                $request->boolean('enabled'),
                $request->input('license_type'),
                $request->input('notes'),
                $adminId,
            );

            return response()->json($result);
        } catch (ClientDbException $e) {
            throw new ApiException(502, "Client DB error: {$e->getMessage()}");
        }
    }

    /** Set the max concurrent-login limit on a client (CC-side only). */
    public function updateLicenseLimit(string $clientId, Request $request)
    {
        $client = $this->findOrFail($clientId);
        $client->max_licenses = $request->input('max_licenses');
        $client->save();

        return response()->json([
            'success' => true,
            'client_code' => $client->code,
            'max_licenses' => $client->max_licenses,
        ]);
    }

    /** Push the current max_licenses value to the client's database. */
    public function pushLicenseLimit(string $clientId, Request $request)
    {
        $client = $this->findOrFail($clientId);
        try {
            $adminId = (string) $request->attributes->get('admin')->id;
            $result = $this->clientDb->pushLicenseLimit($client, $client->max_licenses, $adminId);

            return response()->json($result);
        } catch (ClientDbException $e) {
            throw new ApiException(502, "Client DB error: {$e->getMessage()}");
        }
    }

    private function findOrFail(string $clientId): Client
    {
        $client = Client::find($clientId);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }

        return $client;
    }
}
