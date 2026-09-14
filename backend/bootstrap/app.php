<?php

use App\Http\Middleware\AuthenticateAdmin;
use App\Support\ApiException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'cc.auth' => AuthenticateAdmin::class,
        ]);

        // This API is called cross-origin only by the Vite dev server
        // (nginx makes it same-origin in Docker) — see config/cors.php.
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Every error response uses {"detail": "..."} — the shape the
        // FastAPI backend used and the React frontend's api.ts already
        // reads (`body.detail`).
        $exceptions->render(function (ApiException $e, Request $request) {
            return response()->json(['detail' => $e->getMessage()], $e->status, $e->headers);
        });

        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            return response()->json(['detail' => 'Not found'], 404);
        });

        $exceptions->render(function (ValidationException $e, Request $request) {
            return response()->json(['detail' => $e->errors()], 422);
        });

        $exceptions->render(function (AuthorizationException $e, Request $request) {
            return response()->json(['detail' => $e->getMessage() ?: 'Forbidden'], 403);
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(
                ['detail' => $e->getMessage() ?: null],
                $e->getStatusCode(),
                $e->getHeaders(),
            );
        });

        $exceptions->render(function (\Throwable $e, Request $request) {
            if (! $request->is('api/*') || app()->hasDebugModeEnabled()) {
                return null;
            }

            report($e);

            return response()->json(['detail' => 'Internal server error'], 500);
        });
    })->create();
