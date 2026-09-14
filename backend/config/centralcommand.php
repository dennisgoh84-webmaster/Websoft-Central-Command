<?php

/**
 * Central Command application configuration.
 *
 * Values are read from environment variables (or the .env file).
 * Central Command has its OWN PostgreSQL database (separate from any
 * client ERP database) — see config/database.php for that connection.
 */
return [
    'app_name' => env('CC_APP_NAME', 'Web Master Central Command'),
    'environment' => env('CC_ENVIRONMENT', 'development'),

    // JWT for admin login
    'jwt_secret_key' => env('CC_JWT_SECRET_KEY', 'dev-only-secret-do-not-use-in-production'),
    'jwt_algorithm' => 'HS256',
    'access_token_expire_minutes' => env('CC_ACCESS_TOKEN_EXPIRE_MINUTES', 60 * 8),

    // Minimum Alembic migration head the client DB must be at for
    // Central Command to write to it. Updated whenever the client-side
    // schema contract changes.
    'min_client_alembic_head' => env('CC_MIN_CLIENT_ALEMBIC_HEAD', 'b2c3d4e5f6a7'),

    // Origins allowed to call the API with credentials (dev frontend server).
    'cors_allowed_origins' => ['http://localhost:5174'],
];
