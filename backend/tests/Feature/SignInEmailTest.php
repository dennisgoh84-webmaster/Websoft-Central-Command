<?php

namespace Tests\Feature;

use App\Models\LoginOtp;
use App\Models\SystemMailSetting;
use App\Services\CcMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Records what would be emailed, or fails like a mail server would. */
class FakeMailer extends CcMailer
{
    /** @var list<array{to: string, subject: string, text: string}> */
    public array $sent = [];

    public ?string $failWith = null;

    public function send(SystemMailSetting $box, string $to, string $subject, string $text): void
    {
        if ($this->failWith !== null) {
            throw new \RuntimeException($this->failWith);
        }
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'text' => $text];
    }
}

/**
 * Central Command's own email (2026-09-25): sign-in and reset codes go
 * by email through the System Mail mailbox marked for Central Command,
 * and are no longer handed out on screen.
 */
class SignInEmailTest extends TestCase
{
    use RefreshDatabase;

    private FakeMailer $mail;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mail = new FakeMailer;
        $this->app->instance(CcMailer::class, $this->mail);
    }

    private function mailbox(bool $forCentralCommand = true, string $label = 'Office mailbox'): SystemMailSetting
    {
        $box = SystemMailSetting::create([
            'purpose' => 'otp', 'label' => $label, 'host' => 'smtp.example.test', 'port' => 587,
            'username' => 'noreply@example.test', 'password' => 'secret', 'use_tls' => true,
            'from_email' => 'noreply@example.test', 'from_name' => 'Central Command',
        ]);
        $box->used_by_central_command = $forCentralCommand;
        $box->save();

        return $box;
    }

    private function login()
    {
        return $this->postJson('/api/auth/login', ['username' => 'tester', 'password' => self::PASSWORD]);
    }

    public function test_without_a_mailbox_the_sign_in_code_is_still_shown_so_nobody_is_locked_out(): void
    {
        $this->admin();

        $res = $this->login()->assertOk()->assertJson(['email_sent' => false, 'email_configured' => false]);
        $this->assertSame(LoginOtp::findOrFail($res->json('otp_session'))->otp_code, $res->json('_dev_otp'));
    }

    public function test_with_a_mailbox_the_sign_in_code_is_emailed_and_not_shown(): void
    {
        $this->admin();
        $this->mailbox();

        $res = $this->login()->assertOk()->assertJson(['email_sent' => true, 'email_configured' => true]);
        $this->assertArrayNotHasKey('_dev_otp', $res->json());

        $code = LoginOtp::findOrFail($res->json('otp_session'))->otp_code;
        $this->assertCount(1, $this->mail->sent);
        $this->assertSame('tester@example.test', $this->mail->sent[0]['to']);
        $this->assertStringContainsString($code, $this->mail->sent[0]['text']);

        $this->postJson('/api/auth/verify-otp', ['otp_session' => $res->json('otp_session'), 'otp_code' => $code])->assertOk();
    }

    public function test_when_the_email_fails_the_code_is_not_shown_and_the_reason_is(): void
    {
        $this->admin();
        $this->mailbox();
        $this->mail->failWith = 'Authentication failed';

        $res = $this->login()->assertOk()->assertJson(['email_sent' => false]);
        $this->assertArrayNotHasKey('_dev_otp', $res->json());
        $this->assertStringContainsString('Authentication failed', $res->json('delivery_error'));
    }

    public function test_a_password_reset_code_is_never_shown_on_screen(): void
    {
        $this->admin();

        // No mailbox: refused outright, instead of handing the code to whoever typed the username.
        $this->postJson('/api/auth/forgot-password', ['username' => 'tester'])->assertStatus(400);

        // With one: emailed, not shown, and it works.
        $this->mailbox();
        $res = $this->postJson('/api/auth/forgot-password', ['username' => 'tester'])->assertOk();
        $this->assertArrayNotHasKey('_dev_otp', $res->json());
        preg_match('/\b(\d{6})\b/', $this->mail->sent[0]['text'], $m);
        $this->postJson('/api/auth/reset-password', ['username' => 'tester', 'otp_code' => $m[1], 'new_password' => 'New-pass-456'])->assertOk();
        $this->postJson('/api/auth/login', ['username' => 'tester', 'password' => 'New-pass-456'])->assertOk();
    }

    public function test_a_forgotten_username_is_emailed_never_shown(): void
    {
        $this->admin();

        $res = $this->postJson('/api/auth/forgot-username', ['email' => 'tester@example.test'])->assertOk();
        $this->assertArrayNotHasKey('_dev_username', $res->json());

        $this->mailbox();
        $this->postJson('/api/auth/forgot-username', ['email' => 'tester@example.test'])->assertOk();
        $this->assertStringContainsString('tester', $this->mail->sent[0]['text']);
    }

    public function test_marking_a_mailbox_for_central_command_needs_a_working_test_email(): void
    {
        $super = $this->admin();
        $first = $this->mailbox(false, 'First');
        $second = $this->mailbox(true, 'Second');

        // A broken mailbox is refused, and nothing changes.
        $this->mail->failWith = 'Connection refused';
        $this->postJson("/api/system-mail/{$first->id}/use-for-central-command", ['enabled' => true], $this->as($super))
            ->assertStatus(422)->assertJsonFragment(['detail' => 'The test email could not be sent. the mail server said: Connection refused']);
        $this->assertFalse($first->fresh()->used_by_central_command);
        $this->assertTrue($second->fresh()->used_by_central_command);

        // A working one takes over; only one is ever marked.
        $this->mail->failWith = null;
        $this->postJson("/api/system-mail/{$first->id}/use-for-central-command", ['enabled' => true], $this->as($super))
            ->assertOk()->assertJson(['used_by_central_command' => true]);
        $this->assertSame('Central Command test email', $this->mail->sent[0]['subject']);
        $this->assertTrue($first->fresh()->used_by_central_command);
        $this->assertFalse($second->fresh()->used_by_central_command);
    }

    public function test_only_a_super_admin_can_change_central_commands_email_but_anyone_can_send_a_test(): void
    {
        $admin = $this->admin('admin', 'plainadmin');
        $box = $this->mailbox(false);

        $this->postJson("/api/system-mail/{$box->id}/use-for-central-command", ['enabled' => true], $this->as($admin))->assertStatus(403);
        $this->postJson("/api/system-mail/{$box->id}/test-email", [], $this->as($admin))
            ->assertOk()->assertJson(['sent' => true, 'to' => 'plainadmin@example.test']);
    }
}
