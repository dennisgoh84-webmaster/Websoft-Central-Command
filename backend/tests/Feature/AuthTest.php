<?php

namespace Tests\Feature;

use App\Models\LoginOtp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Sign-in: password first, then the one-time code, then a bearer token. */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function login(string $password = self::PASSWORD)
    {
        return $this->postJson('/api/auth/login', ['username' => 'tester', 'password' => $password]);
    }

    /** The code as stored -- not from the response, so this keeps passing once codes are really emailed. */
    private function codeFor(string $session): string
    {
        return LoginOtp::findOrFail($session)->otp_code;
    }

    public function test_sign_in_needs_the_password_then_the_one_time_code(): void
    {
        $this->admin();

        $session = $this->login()->assertOk()->assertJson(['status' => 'otp_required'])->json('otp_session');
        $token = $this->postJson('/api/auth/verify-otp', ['otp_session' => $session, 'otp_code' => $this->codeFor($session)])
            ->assertOk()->json('access_token');

        $this->assertNotEmpty($token);
        $this->getJson('/api/auth/me', ['Authorization' => "Bearer {$token}"])->assertOk()->assertJson(['username' => 'tester']);
    }

    public function test_a_wrong_password_is_refused(): void
    {
        $this->admin();

        $this->login('not-the-password')->assertStatus(401);
    }

    public function test_a_wrong_or_reused_code_is_refused(): void
    {
        $this->admin();
        $session = $this->login()->json('otp_session');

        $this->postJson('/api/auth/verify-otp', ['otp_session' => $session, 'otp_code' => '000000x'])->assertStatus(400);
        $this->postJson('/api/auth/verify-otp', ['otp_session' => $session, 'otp_code' => $this->codeFor($session)])->assertOk();
        $this->postJson('/api/auth/verify-otp', ['otp_session' => $session, 'otp_code' => $this->codeFor($session)])->assertStatus(400);
    }

    public function test_a_disabled_account_cannot_sign_in(): void
    {
        $this->admin()->update(['is_active' => false]);

        $this->login()->assertStatus(403);
    }

    public function test_screens_need_a_valid_token(): void
    {
        $this->getJson('/api/dashboard/')->assertStatus(401);
        $this->getJson('/api/dashboard/', ['Authorization' => 'Bearer not-a-token'])->assertStatus(401);
        $this->getJson('/api/dashboard/', $this->as($this->admin()))->assertOk();
    }
}
