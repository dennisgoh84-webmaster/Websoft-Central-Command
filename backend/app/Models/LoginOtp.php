<?php

namespace App\Models;

/**
 * Login OTP codes for Central Command admin authentication.
 *
 * After a successful username+password check, a 6-digit OTP is
 * generated and (in production) emailed to the admin's registered
 * address. The user must present the OTP to receive a JWT. In
 * development mode (no SMTP configured) the OTP is returned in the API
 * response so the flow can still be tested.
 *
 * The same model is reused for forgot-password reset OTPs.
 */
class LoginOtp extends CcModel
{
    public $timestamps = false;

    protected $table = 'login_otps';

    protected $fillable = ['admin_user_id', 'otp_code', 'purpose', 'is_used', 'expires_at'];

    protected function casts(): array
    {
        return [
            'is_used' => 'boolean',
            'expires_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }
}
