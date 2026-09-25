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

    // Minimum Laravel migration filename the client DB must have
    // applied for Central Command to write to it (compared as a plain
    // string against `migrations.migration` — safe because Laravel's
    // date-prefixed filenames already sort chronologically). Enforced
    // in App\Services\ClientDbService::checkMigrationHead(). Empty by
    // default (no floor) so upgrading Central Command never suddenly
    // locks out an older-but-otherwise-fine client fleet; set it once
    // every client is confirmed to have run a given migration and you
    // want pushes to refuse anything older. Updated whenever the
    // client-side schema contract changes — see
    // docs/central-command-schema-contract.md.
    'min_client_migration_head' => env('CC_MIN_CLIENT_MIGRATION_HEAD'),

    // Show one-time codes on screen even when they could be emailed --
    // local development and tests only (2026-09-25). Off by default:
    // sign-in codes then appear on screen only while no System Mail
    // mailbox is marked for Central Command, and password-reset codes
    // and username reminders never do.
    'show_codes_on_screen' => (bool) env('CC_SHOW_CODES_ON_SCREEN', false),

    // Shared secret for the host-side upgrade agent (scripts/upgrade-agent.sh),
    // sent as X-Upgrade-Agent-Token. Empty = agent endpoints disabled (503).
    'upgrade_agent_token' => env('CC_UPGRADE_AGENT_TOKEN'),

    // Origins allowed to call the API with credentials (dev frontend server).
    'cors_allowed_origins' => ['http://localhost:5174'],
];
