<?php

namespace App\Services;

use App\Models\SystemMailSetting;
use Illuminate\Support\Facades\Mail;

/**
 * Central Command's own outgoing email -- sign-in codes, password-reset
 * codes, username reminders (2026-09-25). Sent through the System Mail
 * mailbox marked `used_by_central_command`; with none marked, Central
 * Command cannot email and says so.
 *
 * Tests swap this class out in the container, so nothing here needs a
 * real SMTP server to be exercised.
 */
class CcMailer
{
    public function mailbox(): ?SystemMailSetting
    {
        return SystemMailSetting::where('used_by_central_command', true)->first();
    }

    /**
     * Send a plain-text email through the given mailbox. Throws with the
     * SMTP server's own reason when it fails.
     */
    public function send(SystemMailSetting $box, string $to, string $subject, string $text): void
    {
        $mailer = Mail::build([
            'transport' => 'smtp',
            'host' => $box->host,
            'port' => $box->port,
            'username' => $box->username ?: null,
            'password' => $box->password ?: null,
            // 465 = TLS from the first byte; otherwise STARTTLS whenever the
            // server offers it (Microsoft 365 and Gmail only accept a sign-in
            // after it), which "Use TLS" makes mandatory.
            'scheme' => (int) $box->port === 465 ? 'smtps' : 'smtp',
            'auto_tls' => 'true',
            'require_tls' => $box->use_tls && (int) $box->port !== 465 ? 'true' : 'false',
            'timeout' => 15,
        ]);

        $from = $box->from_email ?: $box->username;
        $mailer->raw($text, function ($m) use ($to, $subject, $from, $box) {
            $m->to($to)->from($from, $box->from_name ?: 'Central Command')->subject($subject);
        });
    }

    /**
     * What went wrong, in words an admin can act on: the usual Microsoft
     * 365 / Gmail refusals get the fix spelled out, followed by the
     * server's own reply.
     */
    public static function explain(\Throwable $e, SystemMailSetting $box): string
    {
        $raw = trim(preg_replace('/\s+/', ' ', $e->getMessage()));
        $user = $box->username ?: 'this mailbox';
        $hint = match (true) {
            str_contains($raw, 'SmtpClientAuthentication is disabled') => 'Microsoft 365 has SMTP sending ("Authenticated SMTP") switched off. A Microsoft 365 admin must switch it on: '
                .'in the Exchange admin center, Settings > Mail flow, untick "Turn off SMTP AUTH protocol for your organization"; '
                ."then in the Microsoft 365 admin center, Users > Active users > {$user} > Mail > Manage email apps, tick \"Authenticated SMTP\". "
                .'Allow 15-60 minutes for it to take effect.',
            str_contains($raw, 'basic authentication is disabled') || str_contains($raw, 'security defaults') => 'Microsoft 365 refuses password sign-in for SMTP on this account (Security defaults or a sign-in policy blocks it). '
                .'Use a mailbox from a provider that allows SMTP with a password, or ask your Microsoft 365 admin to exempt this account.',
            str_contains($raw, '5.7.57') => 'The mail server needs a sign-in before it sends. Make sure the mailbox has a username and password saved, and uses port 587 with Use TLS on.',
            str_contains($raw, '5.7.9') || str_contains($raw, 'Application-specific password') => 'Gmail needs an app password here, not your normal password: Google Account > Security > 2-Step Verification > App passwords.',
            str_contains($raw, '535') => "The mail server rejected the username or password for {$user}. Re-enter the password on this mailbox and try again.",
            default => null,
        };

        $said = 'the mail server said: '.mb_substr($raw, 0, 400);

        return $hint ? "{$hint} ({$said})" : $said;
    }
}
