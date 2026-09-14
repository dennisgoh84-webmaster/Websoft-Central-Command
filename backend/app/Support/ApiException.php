<?php

namespace App\Support;

use RuntimeException;
use Throwable;

/**
 * Mirrors FastAPI's HTTPException: a status code + a "detail" message,
 * rendered by App\Exceptions\Handler as {"detail": "..."} — the shape
 * the React frontend's api.ts already expects (`body.detail`).
 */
class ApiException extends RuntimeException
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly int $status,
        string $detail,
        public readonly array $headers = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($detail, 0, $previous);
    }
}
