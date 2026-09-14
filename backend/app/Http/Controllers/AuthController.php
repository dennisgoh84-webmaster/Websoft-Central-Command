<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\LoginOtp;
use App\Services\AuthService;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Auth endpoints for Central Command admin login.
 *
 * Login flow:
 * 1. POST /login — validates credentials, generates 6-digit OTP,
 *    "sends" it to the admin's registered email. In dev mode (no SMTP)
 *    the OTP is returned in the response body so the flow can still be
 *    tested without email infrastructure.
 * 2. POST /verify-otp — validates the OTP and returns a JWT.
 *
 * Recovery flows:
 * - POST /forgot-password — sends a reset OTP to the admin's email
 * - POST /reset-password — validates the OTP and sets a new password
 * - POST /forgot-username — sends the username to the admin's email
 */
class AuthController extends Controller
{
    private const OTP_EXPIRY_MINUTES = 5;

    public function __construct(private AuthService $auth) {}

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
        $emailSent = $this->sendOtpEmail($user, $otp->otp_code, 'login');

        $response = [
            'status' => 'otp_required',
            'otp_session' => (string) $otp->id,
            'email_sent' => $emailSent,
            'email_hint' => $user->email ? $this->maskEmail($user->email) : null,
        ];
        if (! $emailSent) {
            $response['_dev_otp'] = $otp->otp_code;
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

        $otp = $this->createOtp($user, 'reset_password');
        $emailSent = $this->sendOtpEmail($user, $otp->otp_code, 'reset_password');

        $response = [
            'status' => 'ok',
            'message' => 'If the username exists, an OTP has been sent to the registered email.',
            'email_hint' => $this->maskEmail($user->email),
        ];
        if (! $emailSent) {
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
            if (! $emailSent) {
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

    /**
     * Send OTP via email. Returns true if sent, false if no SMTP
     * configured.
     *
     * In this development environment SMTP is not available, so the
     * OTP is logged instead. Production would integrate a real mailer
     * here.
     */
    private function sendOtpEmail(AdminUser $user, string $otpCode, string $purpose): bool
    {
        $subject = match ($purpose) {
            'login' => 'Central Command Login OTP',
            'reset_password' => 'Central Command Password Reset OTP',
            default => 'Central Command OTP',
        };

        Log::info(sprintf(
            '📧 [DEV] Email to %s (%s): %s — OTP: %s',
            $user->email ?: '(no email)',
            $user->full_name,
            $subject,
            $otpCode,
        ));

        return false; // no actual email sent
    }

    /** Send username recovery email. Dev mode: logged instead of sent. */
    private function sendUsernameEmail(AdminUser $user): bool
    {
        Log::info(sprintf(
            "📧 [DEV] Username recovery email to %s: Your username is '%s'",
            $user->email,
            $user->username,
        ));

        return false;
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
