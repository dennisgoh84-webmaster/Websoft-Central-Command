<?php

use App\Http\Controllers\AdvertisementController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\ConfigUpdateController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LicenseController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SystemMailController;
use App\Http\Controllers\VersionController;
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

    // ── Config Updates ───────────────────────────────────────────────
    Route::prefix('config-updates')->group(function () {
        Route::get('/', [ConfigUpdateController::class, 'index']);
        Route::post('/', [ConfigUpdateController::class, 'store']);
        Route::get('/{updateId}', [ConfigUpdateController::class, 'show']);
        Route::patch('/{updateId}', [ConfigUpdateController::class, 'update']);
        Route::post('/{updateId}/push', [ConfigUpdateController::class, 'push']);
        Route::post('/{updateId}/push/{clientId}', [ConfigUpdateController::class, 'pushToClient']);
    });

    // ── Version Control ──────────────────────────────────────────────
    Route::prefix('versions')->group(function () {
        Route::get('/', [VersionController::class, 'index']);
        Route::post('/', [VersionController::class, 'store']);
        Route::get('/clients', [VersionController::class, 'clientVersions']);
        Route::post('/clients/{clientId}/upgrade', [VersionController::class, 'upgradeClient']);
        Route::get('/upgrade-logs', [VersionController::class, 'upgradeLogs']);
        Route::patch('/{versionId}', [VersionController::class, 'update']);
        Route::delete('/{versionId}', [VersionController::class, 'destroy']);
    });

    // ── System Mail Settings ─────────────────────────────────────────
    Route::prefix('system-mail')->group(function () {
        Route::get('/', [SystemMailController::class, 'index']);
        Route::post('/', [SystemMailController::class, 'store']);
        Route::patch('/{settingId}', [SystemMailController::class, 'update']);
        Route::delete('/{settingId}', [SystemMailController::class, 'destroy']);
        Route::post('/{settingId}/push', [SystemMailController::class, 'push']);
    });

    // ── Staff Management ─────────────────────────────────────────────
    Route::prefix('staff')->group(function () {
        Route::get('/', [StaffController::class, 'index']);
        Route::post('/', [StaffController::class, 'store']);
        Route::get('/support-logins', [StaffController::class, 'listSupportLogins']);
        Route::post('/support-logins/push', [StaffController::class, 'pushSupportLogin']);
        Route::post('/support-logins/{loginId}/revoke', [StaffController::class, 'revokeSupportLogin']);
        Route::patch('/support-logins/{loginId}', [StaffController::class, 'updateSupportLogin']);
        Route::post('/support-logins/{loginId}/reset-password', [StaffController::class, 'resetSupportLoginPassword']);
        Route::patch('/{userId}', [StaffController::class, 'update']);
        Route::delete('/{userId}', [StaffController::class, 'destroy']);
    });
});
