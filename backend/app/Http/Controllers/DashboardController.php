<?php

namespace App\Http\Controllers;

use App\Models\Advertisement;
use App\Models\Client;
use App\Models\PushLog;

/** Central Command dashboard — summary statistics. */
class DashboardController extends Controller
{
    public function index()
    {
        $totalClients = Client::count();
        $activeClients = Client::where('status', 'ACTIVE')->count();
        $suspendedClients = Client::where('status', 'SUSPENDED')->count();

        $totalAds = Advertisement::count();
        $activeAds = Advertisement::where('is_active', true)->count();

        $recentPushes = PushLog::orderByDesc('pushed_at')->limit(20)->get();

        return response()->json([
            'total_clients' => $totalClients,
            'active_clients' => $activeClients,
            'suspended_clients' => $suspendedClients,
            'total_ads' => $totalAds,
            'active_ads' => $activeAds,
            'recent_pushes' => $recentPushes->map(fn (PushLog $p) => [
                'id' => (string) $p->id,
                'client_id' => (string) $p->client_id,
                'push_type' => $p->push_type,
                'detail' => $p->detail,
                'success' => $p->success,
                'error_message' => $p->error_message,
                'pushed_at' => $p->pushed_at?->toISOString(),
                'pushed_by' => $p->pushed_by ? (string) $p->pushed_by : null,
            ])->all(),
        ]);
    }
}
