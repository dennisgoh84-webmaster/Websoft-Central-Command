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
            // 465 = TLS from the first byte; otherwise STARTTLS, which
            // "Use TLS" makes mandatory rather than opportunistic.
            'scheme' => (int) $box->port === 465 ? 'smtps' : 'smtp',
            'auto_tls' => $box->use_tls ? 'true' : 'false',
            'require_tls' => $box->use_tls && (int) $box->port !== 465 ? 'true' : 'false',
            'timeout' => 15,
        ]);

        $from = $box->from_email ?: $box->username;
        $mailer->raw($text, function ($m) use ($to, $subject, $from, $box) {
            $m->to($to)->from($from, $box->from_name ?: 'Central Command')->subject($subject);
        });
    }
}
