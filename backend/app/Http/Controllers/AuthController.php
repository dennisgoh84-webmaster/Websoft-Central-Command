<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\LoginOtp;
use App\Services\AuthService;
use App\Services\CcMailer;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Auth endpoints for Central Command admin login.
 *
 * Login flow:
 * 1. POST /login — validates credentials, generates a 6-digit OTP and
 *    emails it through the System Mail mailbox marked for Central
 *    Command (App\Services\CcMailer).
 * 2. POST /verify-otp — validates the OTP and returns a JWT.
 *
 * What may appear on screen (2026-09-25 -- before this the email was a
 * stub, every code was returned in the response, and "forgot password"
 * let anyone who knew a username reset its password):
 * - a sign-in code: only while NO mailbox is marked for Central Command,
 *   so a fresh install is not locked out (the password is still needed);
 * - a password-reset code or a username: never.
 * A code that could not be emailed is written to the server log, which
 * only someone with access to the server can read -- the way back in.
 * CC_SHOW_CODES_ON_SCREEN=true shows every code (development and tests).
 *
 * Recovery flows:
 * - POST /forgot-password — sends a reset OTP to the admin's email
 * - POST /reset-password — validates the OTP and sets a new password
 * - POST /forgot-username — sends the username to the admin's email
 */
class AuthController extends Controller
{
    private const OTP_EXPIRY_MINUTES = 5;

    public function __construct(private AuthService $auth, private CcMailer $mailer) {}

    public function login(Request $request)
    {
        $username = (string) $request->input('username');
        $password = (string) $request->input('password');

        $user = AdminUser::where('username', $username)->first();
        if (! $user || ! $this->auth->verifyPassword($password, $user->hashed_password)) {
            throw new ApiException(401, 'Bad credentials');
        }
        if (! $user->is_active) {
            throw new ApiException(403, 'Account disabled');
        }

        $otp = $this->createOtp($user, 'login');
        [$emailSent, $error] = $this->sendOtpEmail($user, $otp->otp_code, 'login');
        $configured = $this->mailer->mailbox() !== null;

        $response = [
            'status' => 'otp_required',
            'otp_session' => (string) $otp->id,
            'email_sent' => $emailSent,
            'email_hint' => $user->email ? $this->maskEmail($user->email) : null,
            'email_configured' => $configured,
        ];
        if (! $emailSent) {
            if (! $configured || $this->showCodes()) {
                $response['_dev_otp'] = $otp->otp_code;
            } else {
                $response['delivery_error'] = "Your sign-in code could not be emailed ({$error}). Try again shortly, or ask whoever runs the Central Command server -- the code is in its log.";
            }
        }

        return response()->json($response);
    }

    public function verifyOtp(Request $request)
    {
        $otp = LoginOtp::find((string) $request->input('otp_session'));
        if (! $otp) {
            throw new ApiException(400, 'Invalid OTP session');
        }
        if ($otp->is_used) {
            throw new ApiException(400, 'OTP already used');
        }
        if ($otp->expires_at->lt(Carbon::now())) {
            throw new ApiException(400, 'OTP has expired');
        }
        if ($otp->otp_code !== (string) $request->input('otp_code')) {
            throw new ApiException(400, 'Invalid OTP code');
        }

        $otp->is_used = true;
        $otp->save();

        $user = AdminUser::find($otp->admin_user_id);
        if (! $user || ! $user->is_active) {
            throw new ApiException(403, 'Account disabled');
        }

        $token = $this->auth->createAccessToken((string) $user->id);

        return response()->json([
            'status' => 'ok',
            'access_token' => $token,
            'token_type' => 'bearer',
            'full_name' => $user->full_name,
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $username = (string) $request->input('username');
        $user = AdminUser::where('username', $username)->first();
        if (! $user) {
            // Don't reveal whether the username exists
            return response()->json([
                'status' => 'ok',
                'message' => 'If the username exists, an OTP has been sent to the registered email.',
            ]);
        }
        if (! $user->email) {
            throw new ApiException(400, 'No email address registered for this account. Contact a super admin.');
        }

        if ($this->mailer->mailbox() === null && ! $this->showCodes()) {
            // Never put a reset code on screen: that would let anyone who
            // knows a username set its password.
            throw new ApiException(400, 'Password reset by email is not available yet -- no mailbox has been set up for Central Command (System Mail). Ask a super admin to reset your password.');
        }

        $otp = $this->createOtp($user, 'reset_password');
        [$emailSent] = $this->sendOtpEmail($user, $otp->otp_code, 'reset_password');

        $response = [
            'status' => 'ok',
            'message' => 'If the username exists, an OTP has been sent to the registered email.',
            'email_hint' => $this->maskEmail($user->email),
        ];
        if (! $emailSent && $this->showCodes()) {
            $response['_dev_otp'] = $otp->otp_code;
        }

        return response()->json($response);
    }

    public function resetPassword(Request $request)
    {
        $username = (string) $request->input('username');
        $user = AdminUser::where('username', $username)->first();
        if (! $user) {
            throw new ApiException(400, 'Invalid request');
        }

        $otp = LoginOtp::where('admin_user_id', $user->id)
            ->where('purpose', 'reset_password')
            ->where('is_used', false)
            ->where('otp_code', (string) $request->input('otp_code'))
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if (! $otp) {
            throw new ApiException(400, 'Invalid or expired OTP');
        }

        $pwd = (string) $request->input('new_password');
        if (strlen($pwd) < 8) {
            throw new ApiException(400, 'Password must be at least 8 characters');
        }
        if (! preg_match('/[A-Za-z]/', $pwd) || ! preg_match('/[0-9]/', $pwd)) {
            throw new ApiException(400, 'Password must contain both letters and numbers');
        }

        $user->hashed_password = $this->auth->hashPassword($pwd);
        $user->save();
        $otp->is_used = true;
        $otp->save();

        return response()->json(['status' => 'ok', 'message' => 'Password has been reset successfully. You can now log in.']);
    }

    public function forgotUsername(Request $request)
    {
        $email = (string) $request->input('email');
        $user = AdminUser::where('email', $email)->first();

        // Always return success to avoid email enumeration
        $response = [
            'status' => 'ok',
            'message' => 'If the email is registered, the username has been sent to it.',
        ];

        if ($user) {
            $emailSent = $this->sendUsernameEmail($user);
            if (! $emailSent && $this->showCodes()) {
                $response['_dev_username'] = $user->username;
            }
        }

        return response()->json($response);
    }

    public function me(Request $request)
    {
        /** @var AdminUser $admin */
        $admin = $request->attributes->get('admin');

        return response()->json([
            'id' => (string) $admin->id,
            'username' => $admin->username,
            'full_name' => $admin->full_name,
            'email' => $admin->email,
            'role' => $admin->role,
            'is_active' => $admin->is_active,
            'created_at' => $admin->created_at?->toISOString(),
        ]);
    }

    private function createOtp(AdminUser $user, string $purpose): LoginOtp
    {
        $otp = new LoginOtp([
            'admin_user_id' => $user->id,
            'otp_code' => $this->generateOtp(),
            'purpose' => $purpose,
            'expires_at' => Carbon::now()->addMinutes(self::OTP_EXPIRY_MINUTES),
        ]);
        $otp->save();
        $otp->refresh();

        return $otp;
    }

    private function generateOtp(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    private function showCodes(): bool
    {
        return (bool) config('centralcommand.show_codes_on_screen');
    }

    /**
     * Email a one-time code through Central Command's mailbox.
     *
     * @return array{0: bool, 1: ?string} [sent, why not]
     */
    private function sendOtpEmail(AdminUser $user, string $otpCode, string $purpose): array
    {
        [$subject, $intro] = match ($purpose) {
            'reset_password' => ['Central Command password reset code', 'Use this code to reset your Central Command password'],
            default => ['Central Command sign-in code', 'Use this code to finish signing in to Central Command'],
        };
        $text = "Hello {$user->full_name},\n\n{$intro}:\n\n    {$otpCode}\n\n"
            .'It expires in '.self::OTP_EXPIRY_MINUTES." minutes. If you did not ask for it, someone may know your password -- change it.\n";

        $error = $this->deliver($user, $subject, $text);
        if ($error !== null) {
            // The way back in when email is not set up or fails: only
            // someone with access to the server can read this log.
            Log::warning(sprintf('Central Command %s code for %s NOT emailed (%s): %s', $purpose, $user->username, $error, $otpCode));
        }

        return [$error === null, $error];
    }

    private function sendUsernameEmail(AdminUser $user): bool
    {
        $error = $this->deliver($user, 'Your Central Command username',
            "Hello {$user->full_name},\n\nYour Central Command username is: {$user->username}\n");
        if ($error !== null) {
            Log::warning(sprintf('Central Command username reminder for %s NOT emailed (%s)', $user->email, $error));
        }

        return $error === null;
    }

    /** @return ?string null when sent, otherwise why not */
    private function deliver(AdminUser $user, string $subject, string $text): ?string
    {
        $box = $this->mailer->mailbox();
        if ($box === null) {
            return 'no mailbox is set up for Central Command';
        }
        if (! $user->email) {
            return 'no email address on this account';
        }
        try {
            $this->mailer->send($box, $user->email, $subject, $text);

            return null;
        } catch (\Throwable $e) {
            return CcMailer::explain($e, $box);
        }
    }

    /** Mask email for display: 'admin@webmaster.com.sg' -> 'a****@w******.com.sg' */
    private function maskEmail(?string $email): ?string
    {
        if (! $email || ! str_contains($email, '@')) {
            return null;
        }
        [$local, $domain] = explode('@', $email, 2);
        $maskedLocal = strlen($local) > 1 ? $local[0].'****' : $local;
        $parts = explode('.', $domain);
        if (count($parts) >= 2) {
            $maskedDomain = $parts[0][0].'******.'.implode('.', array_slice($parts, 1));
        } else {
            $maskedDomain = $domain[0].'******';
        }

        return "{$maskedLocal}@{$maskedDomain}";
    }
}
