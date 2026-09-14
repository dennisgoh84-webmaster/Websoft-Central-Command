<?php

namespace App\Services;

use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\SignatureInvalidException;
use UnexpectedValueException;

/** JWT auth for Central Command admin users. */
class AuthService
{
    public function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT);
    }

    public function verifyPassword(string $plain, string $hashed): bool
    {
        return password_verify($plain, $hashed);
    }

    public function createAccessToken(string $userId): string
    {
        $expireMinutes = (int) config('centralcommand.access_token_expire_minutes');
        $now = time();

        $payload = [
            'sub' => $userId,
            'exp' => $now + ($expireMinutes * 60),
        ];

        return JWT::encode($payload, config('centralcommand.jwt_secret_key'), config('centralcommand.jwt_algorithm'));
    }

    /** Decode an access token and return the admin user id ('sub'), or null if invalid/expired. */
    public function decodeAccessToken(string $token): ?string
    {
        try {
            $payload = JWT::decode(
                $token,
                new Key(config('centralcommand.jwt_secret_key'), config('centralcommand.jwt_algorithm'))
            );

            return $payload->sub ?? null;
        } catch (ExpiredException|SignatureInvalidException|UnexpectedValueException) {
            return null;
        }
    }
}
