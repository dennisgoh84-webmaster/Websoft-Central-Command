<?php

namespace Tests;

use App\Models\AdminUser;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected const PASSWORD = 'Test-pass-123!';

    /** RefreshDatabase: also drop the Postgres enum types (client_status etc.), or the next run cannot recreate them. */
    protected bool $dropTypes = true;

    protected function admin(string $role = 'super_admin', string $username = 'tester'): AdminUser
    {
        return AdminUser::create([
            'username' => $username,
            'full_name' => ucfirst($username),
            'email' => "{$username}@example.test",
            'hashed_password' => app(AuthService::class)->hashPassword(self::PASSWORD),
            'role' => $role,
            'is_active' => true,
        ]);
    }

    /** @return array<string, string> Authorization header for that admin. */
    protected function as(AdminUser $admin): array
    {
        return ['Authorization' => 'Bearer '.app(AuthService::class)->createAccessToken((string) $admin->id)];
    }
}
