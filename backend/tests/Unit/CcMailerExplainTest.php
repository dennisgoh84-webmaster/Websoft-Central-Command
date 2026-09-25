<?php

namespace Tests\Unit;

use App\Models\SystemMailSetting;
use App\Services\CcMailer;
use PHPUnit\Framework\TestCase;

class CcMailerExplainTest extends TestCase
{
    private function explain(string $serverSaid): string
    {
        $box = new SystemMailSetting(['username' => 'dennis@example.sg']);

        return CcMailer::explain(new \RuntimeException($serverSaid), $box);
    }

    public function test_microsoft_365_smtp_auth_switched_off_gets_the_fix(): void
    {
        $out = $this->explain('Failed to authenticate on SMTP server with username "dennis@example.sg" using the following authenticators: "LOGIN", "XOAUTH2". Authenticator "LOGIN" returned "Expected response code "235" but got code "535", with message "535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant. Visit https://aka.ms/smtp_auth_disabled for more information."');

        $this->assertStringStartsWith('Microsoft 365 has SMTP sending ("Authenticated SMTP") switched off.', $out);
        $this->assertStringContainsString('Users > Active users > dennis@example.sg > Mail > Manage email apps', $out);
        $this->assertStringContainsString('SmtpClientAuthentication is disabled for the Tenant', $out);
    }

    public function test_not_signed_in(): void
    {
        $this->assertStringStartsWith('The mail server needs a sign-in', $this->explain('Expected response code "250" but got code "530", with message "530 5.7.57 Client not authenticated to send mail."'));
    }

    public function test_wrong_password(): void
    {
        $this->assertStringStartsWith('The mail server rejected the username or password', $this->explain('535 5.7.3 Authentication unsuccessful'));
    }

    public function test_anything_else_is_passed_through(): void
    {
        $this->assertSame('the mail server said: Connection refused', $this->explain('Connection refused'));
    }
}
