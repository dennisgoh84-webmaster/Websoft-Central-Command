<?php

use App\Http\Controllers\AdvertisementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\CcUpgradeController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LicenseController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SystemMailController;
use App\Http\Controllers\VersionManagementController;
use Illuminate\Support\Facades\Route;

/*
 * Routes intentionally mirror the original FastAPI paths exactly
 * (including trailing slashes on collection routes) so the existing
 * React frontend (frontend/src/lib/api.ts) works completely unchanged.
 */

Route::get('/health', HealthController::class);

// ── Auth ─────────────────────────────────────────────────────────────
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/verify-otp', [AuthController::class, 'verifyOtp']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    Route::post('/forgot-username', [AuthController::class, 'forgotUsername']);
    Route::get('/me', [AuthController::class, 'me'])->middleware('cc.auth');
});

// Called only by scripts/upgrade-agent.sh on this server's own host,
// authenticated by X-Upgrade-Agent-Token (see CcUpgradeController).
Route::prefix('cc-upgrade/agent')->group(function () {
    Route::post('/heartbeat', [CcUpgradeController::class, 'heartbeat']);
    Route::post('/report', [CcUpgradeController::class, 'report']);
    Route::post('/progress', [CcUpgradeController::class, 'progress']);
});

Route::middleware('cc.auth')->group(function () {
    // ── Dashboard ────────────────────────────────────────────────────
    Route::get('/dashboard/', [DashboardController::class, 'index']);

    // ── Clients ──────────────────────────────────────────────────────
    Route::prefix('clients')->group(function () {
        Route::get('/', [ClientController::class, 'index']);
        Route::post('/', [ClientController::class, 'store']);
        Route::get('/{clientId}', [ClientController::class, 'show']);
        Route::patch('/{clientId}', [ClientController::class, 'update']);
        Route::delete('/{clientId}', [ClientController::class, 'destroy']);
        Route::post('/{clientId}/test-connection', [ClientController::class, 'testConnection']);
    });

    // ── Advertisements ───────────────────────────────────────────────
    Route::prefix('advertisements')->group(function () {
        Route::get('/', [AdvertisementController::class, 'index']);
        Route::post('/', [AdvertisementController::class, 'store']);
        Route::patch('/{adId}', [AdvertisementController::class, 'update']);
        Route::delete('/{adId}', [AdvertisementController::class, 'destroy']);
        Route::post('/{adId}/push', [AdvertisementController::class, 'push']);
        Route::post('/push-all', [AdvertisementController::class, 'pushAll']);

        Route::get('/videos', [AdvertisementController::class, 'listVideos']);
        Route::post('/videos', [AdvertisementController::class, 'storeVideo']);
        Route::patch('/videos/{videoId}', [AdvertisementController::class, 'updateVideo']);
        Route::delete('/videos/{videoId}', [AdvertisementController::class, 'destroyVideo']);
        Route::post('/videos/{videoId}/push', [AdvertisementController::class, 'pushVideo']);
    });

    // ── Licenses ─────────────────────────────────────────────────────
    Route::prefix('licenses')->group(function () {
        Route::get('/{clientId}/modules', [LicenseController::class, 'modules']);
        Route::post('/{clientId}/modules', [LicenseController::class, 'setModuleLicense']);
        Route::post('/{clientId}/companies/{companyId}/modules', [LicenseController::class, 'setCompanyModuleLicense']);
        Route::patch('/{clientId}/license-limit', [LicenseController::class, 'updateLicenseLimit']);
        Route::post('/{clientId}/license-limit/push', [LicenseController::class, 'pushLicenseLimit']);
    });

    // ── Version Management (Upgrade/Rollback) ────────────────────────
    Route::prefix('version-management')->group(function () {
        Route::get('/clients', [VersionManagementController::class, 'index']);
        Route::get('/clients/{clientId}', [VersionManagementController::class, 'show']);
        Route::post('/clients/{clientId}/upgrade', [VersionManagementController::class, 'upgrade']);
        Route::post('/clients/{clientId}/rollback', [VersionManagementController::class, 'rollback']);
        Route::post('/clients/{clientId}/requests/{requestId}/cancel', [VersionManagementController::class, 'cancel']);
    });

    // ── System Mail Settings ─────────────────────────────────────────
    Route::prefix('system-mail')->group(function () {
        Route::get('/', [SystemMailController::class, 'index']);
        Route::post('/', [SystemMailController::class, 'store']);
        Route::patch('/{settingId}', [SystemMailController::class, 'update']);
        Route::delete('/{settingId}', [SystemMailController::class, 'destroy']);
        Route::post('/{settingId}/push', [SystemMailController::class, 'push']);
        Route::post('/{settingId}/test-email', [SystemMailController::class, 'testEmail']);
        Route::post('/{settingId}/use-for-central-command', [SystemMailController::class, 'useForCentralCommand']);
    });

    // ── Staff Management ─────────────────────────────────────────────
    Route::prefix('staff')->group(function () {
        Route::get('/', [StaffController::class, 'index']);
        Route::post('/', [StaffController::class, 'store']);
        Route::patch('/{userId}', [StaffController::class, 'update']);
        Route::delete('/{userId}', [StaffController::class, 'destroy']);
        Route::post('/{userId}/change-password', [StaffController::class, 'changeAdminPassword']);
        Route::post('/{userId}/reset-username', [StaffController::class, 'resetAdminUsername']);

        Route::get('/support-logins', [StaffController::class, 'listSupportLogins']);
        Route::post('/support-logins', [StaffController::class, 'addSupportStaff']);
        Route::post('/support-logins/push', [StaffController::class, 'pushSupportLogin']);
        Route::post('/support-logins/{loginId}/revoke', [StaffController::class, 'revokeSupportLogin']);
        Route::patch('/support-logins/{loginId}', [StaffController::class, 'updateSupportLogin']);
        Route::post('/support-logins/{loginId}/reset-password', [StaffController::class, 'resetSupportLoginPassword']);
    });

    // ── Central Command Upgrade ──────────────────────────────────────
    Route::prefix('cc-upgrade')->group(function () {
        Route::get('/status', [CcUpgradeController::class, 'status']);
        Route::post('/upgrade', [CcUpgradeController::class, 'upgrade']);
        Route::post('/rollback', [CcUpgradeController::class, 'rollback']);
        Route::post('/requests/{requestId}/cancel', [CcUpgradeController::class, 'cancel']);
    });
});
