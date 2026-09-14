<?php

namespace App\Http\Middleware;

use App\Models\AdminUser;
use App\Services\AuthService;
use App\Support\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of the FastAPI `get_current_admin` dependency: reads the
 * Bearer token, decodes it, and loads the admin user. Rejects with the
 * same 401 "Could not validate credentials" the Python backend used.
 *
 * Resolves the authenticated admin into `$request->attributes->get('admin')`.
 */
class AuthenticateAdmin
{
    public function __construct(private AuthService $auth) {}

    public function handle(Request $request, Closure $next): Response
    {
        $unauthorized = fn () => throw new ApiException(401, 'Could not validate credentials', ['WWW-Authenticate' => 'Bearer']);

        $header = $request->header('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            $unauthorized();
        }
        $token = substr($header, 7);

        $userId = $this->auth->decodeAccessToken($token);
        if ($userId === null) {
            $unauthorized();
        }

        $user = AdminUser::find($userId);
        if (! $user || ! $user->is_active) {
            $unauthorized();
        }

        $request->attributes->set('admin', $user);

        return $next($request);
    }
}
