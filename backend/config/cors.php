<?php

// Mirrors the CORSMiddleware config in the original FastAPI app.main:
// only the Vite dev server needs cross-origin access — in Docker, nginx
// makes the API same-origin, so this middleware is a no-op there.
return [
    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => config('centralcommand.cors_allowed_origins', []),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
