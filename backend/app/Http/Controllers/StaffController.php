<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\Client;
use App\Models\PushLog;
use App\Models\SupportLogin;
use App\Services\AuthService;
use App\Services\ClientDbService;
use App\Services\PasswordValidator;
use App\Services\PasswordHistoryService;
use App\Support\ApiException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use PDO;
use Throwable;

/** Staff Management — CC staff admin + push support logins to client DBs. */
class StaffController extends Controller
{
    private const VALID_ROLES = ['super_admin', 'admin', 'support_engineer', 'viewer'];

    private const SUPER_ADMIN = 'super_admin';

    public function __construct(private AuthService $auth, private ClientDbService $clientDb) {}

    // ── Staff CRUD ───────────────────────────────────────────────────

    public function index()
    {
        $staff = AdminUser::orderBy('created_at')->get();

        return response()->json($staff->map($this->userOut(...))->all());
    }

    public function store(Request $request)
    {
        $admin = $this->currentAdmin($request);
        if ($admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Only super admins can create staff');
        }

        $username = (string) $request->input('username');
        if (AdminUser::where('username', $username)->exists()) {
            throw new ApiException(400, "Username '{$username}' already exists");
        }

        $role = $request->input('role', 'admin');
        if (! in_array($role, self::VALID_ROLES, true)) {
            throw new ApiException(400, 'Invalid role. Must be one of: '.implode(', ', self::VALID_ROLES));
        }

        $password = (string) $request->input('password');
        $validation = PasswordValidator::validate($password);
        if (! $validation['valid']) {
            throw new ApiException(400, 'Password does not meet requirements: '.implode(', ', $validation['errors']));
        }

        $hashedPassword = $this->auth->hashPassword($password);
        $user = new AdminUser([
            'username' => $username,
            'full_name' => $request->input('full_name'),
            'email' => $request->input('email'),
            'hashed_password' => $hashedPassword,
            'role' => $role,
            'force_password_change_on_next_login' => false,
            'last_password_changed_at' => now(),
        ]);
        $user->save();
        $user->refresh();

        PasswordHistoryService::recordAdminPasswordChange((string) $user->id, $hashedPassword);

        return response()->json($this->userOut($user), 201);
    }

    public function update(string $userId, Request $request)
    {
        $admin = $this->currentAdmin($request);
        if ($admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Only super admins can update staff');
        }

        $user = AdminUser::find($userId);
        if (! $user) {
            throw new ApiException(404, 'Staff not found');
        }

        $role = $request->input('role');
        if ($role !== null && ! in_array($role, self::VALID_ROLES, true)) {
            throw new ApiException(400, 'Invalid role. Must be one of: '.implode(', ', self::VALID_ROLES));
        }

        // A super admin account can never be disabled or demoted — by
        // anyone, including another super admin or the account itself.
        // This keeps at least one fully-privileged login reachable at
        // all times.
        if ($user->role === self::SUPER_ADMIN) {
            if ($request->exists('is_active') && $request->boolean('is_active') === false) {
                throw new ApiException(403, 'Super admin accounts cannot be disabled');
            }
            if ($role !== null && $role !== self::SUPER_ADMIN) {
                throw new ApiException(403, 'Super admin accounts cannot be demoted');
            }
        }

        if ($request->exists('full_name') && $request->input('full_name') !== null) {
            $user->full_name = $request->input('full_name');
        }
        if ($request->exists('email') && $request->input('email') !== null) {
            $user->email = $request->input('email');
        }
        if ($role !== null) {
            $user->role = $role;
        }
        if ($request->exists('is_active') && $request->input('is_active') !== null) {
            $user->is_active = $request->boolean('is_active');
        }
        if ($request->filled('password')) {
            $newPassword = (string) $request->input('password');
            $validation = PasswordValidator::validate($newPassword);
            if (! $validation['valid']) {
                throw new ApiException(400, 'Password does not meet requirements: '.implode(', ', $validation['errors']));
            }
            if (PasswordHistoryService::isAdminPasswordReused((string) $user->id, $newPassword)) {
                throw new ApiException(400, 'Cannot reuse one of your last 5 passwords');
            }
            $hashedPassword = $this->auth->hashPassword($newPassword);
            $user->hashed_password = $hashedPassword;
            $user->last_password_changed_at = now();
            PasswordHistoryService::recordAdminPasswordChange((string) $user->id, $hashedPassword);
        }
        if ($request->exists('force_password_change_on_next_login')) {
            $user->force_password_change_on_next_login = $request->boolean('force_password_change_on_next_login');
        }
        $user->save();

        return response()->json($this->userOut($user));
    }

    public function destroy(string $userId, Request $request)
    {
        $admin = $this->currentAdmin($request);
        if ($admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Only super admins can delete staff');
        }

        $user = AdminUser::find($userId);
        if (! $user) {
            throw new ApiException(404, 'Staff not found');
        }
        if ((string) $user->id === (string) $admin->id) {
            throw new ApiException(400, 'Cannot delete yourself');
        }
        if ($user->role === self::SUPER_ADMIN) {
            throw new ApiException(403, 'Super admin accounts cannot be deleted');
        }

        $user->delete();

        return response()->noContent();
    }

    // ── Support Login Push ──────────────────────────────────────────

    public function listSupportLogins(Request $request)
    {
        $q = SupportLogin::orderByDesc('pushed_at');
        if ($clientId = $request->query('client_id')) {
            $q->where('client_id', $clientId);
        }

        $logins = $q->limit(100)->get();

        return response()->json($logins->map($this->supportLoginOut(...))->all());
    }

    /**
     * Push a support staff login to a client's ERP database.
     *
     * Creates a user row in the client's `users` table with the
     * SUPPORT_ENGINEER role, linked to the first company in that DB.
     * Records the push in Central Command's support_logins table.
     */
    public function pushSupportLogin(Request $request)
    {
        $admin = $this->currentAdmin($request);

        $client = Client::find((string) $request->input('client_id'));
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }
        $targetAdmin = AdminUser::find((string) $request->input('admin_user_id'));
        if (! $targetAdmin) {
            throw new ApiException(404, 'Staff member not found');
        }

        $loginEmail = (string) $request->input('login_email');
        $loginPassword = (string) $request->input('login_password');
        $reason = $request->input('reason');

        try {
            $pdo = $this->clientDb->connect($client);
            $this->clientDb->checkMigrationHead($pdo);

            $companyRow = $pdo->query("SELECT id FROM companies WHERE is_active = true LIMIT 1")->fetch(PDO::FETCH_NUM);
            if (! $companyRow) {
                throw new \RuntimeException('No active company found in client DB');
            }
            $companyId = (string) $companyRow[0];

            $existingStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email');
            $existingStmt->execute(['email' => $loginEmail]);
            $existing = $existingStmt->fetch(PDO::FETCH_NUM);

            $hashedPwd = $this->auth->hashPassword($loginPassword);

            if ($existing) {
                $clientUserId = (string) $existing[0];
                $update = $pdo->prepare(<<<'SQL'
                    UPDATE users SET is_active = true,
                        hashed_password = :pwd,
                        must_change_password = true
                    WHERE id = :uid
                SQL);
                $update->execute(['uid' => $clientUserId, 'pwd' => $hashedPwd]);
            } else {
                $insert = $pdo->prepare(<<<'SQL'
                    INSERT INTO users (id, company_id, email, hashed_password,
                        full_name, role, must_change_password, is_active)
                    VALUES (gen_random_uuid(), :company_id::uuid, :email,
                        :pwd, :full_name, 'SUPPORT_ENGINEER', true, true)
                    RETURNING id
                SQL);
                $insert->execute([
                    'company_id' => $companyId,
                    'email' => $loginEmail,
                    'pwd' => $hashedPwd,
                    'full_name' => "[Support] {$targetAdmin->full_name}",
                ]);
                $clientUserId = (string) $insert->fetch(PDO::FETCH_NUM)[0];

                $grant = $pdo->prepare(<<<'SQL'
                    INSERT INTO user_company_access (id, user_id, company_id)
                    VALUES (gen_random_uuid(), :user_id::uuid, :company_id::uuid)
                    ON CONFLICT DO NOTHING
                SQL);
                $grant->execute(['user_id' => $clientUserId, 'company_id' => $companyId]);
            }

            $supportLogin = new SupportLogin([
                'admin_user_id' => $request->input('admin_user_id'),
                'client_id' => $client->id,
                'login_email' => $loginEmail,
                'client_user_id' => $clientUserId,
                'reason' => $reason,
                'pushed_by' => $admin->id,
                'force_password_change_on_next_login' => true,
            ]);
            $supportLogin->save();

            PasswordHistoryService::recordSupportPasswordChange((string) $supportLogin->id, $hashedPwd);

            PushLog::create([
                'client_id' => $client->id,
                'push_type' => 'support_login',
                'detail' => "Pushed support login '{$loginEmail}' for {$targetAdmin->full_name}",
                'success' => true,
                'pushed_by' => $admin->id,
            ]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            return response()->json([
                'success' => true,
                'client' => $client->code,
                'login_email' => $loginEmail,
                'client_user_id' => $clientUserId,
            ]);
        } catch (Throwable $e) {
            PushLog::create([
                'client_id' => $client->id,
                'push_type' => 'support_login',
                'detail' => "Support login push failed for '{$loginEmail}'",
                'success' => false,
                'error_message' => $e->getMessage(),
                'pushed_by' => $admin->id,
            ]);
            throw new ApiException(500, "Failed to push support login: {$e->getMessage()}");
        }
    }

    /** Revoke (disable) a support login on a client's ERP database. */
    public function revokeSupportLogin(string $loginId, Request $request)
    {
        $admin = $this->currentAdmin($request);

        $supportLogin = SupportLogin::find($loginId);
        if (! $supportLogin) {
            throw new ApiException(404, 'Support login not found');
        }
        if ($supportLogin->status === 'revoked') {
            throw new ApiException(400, 'Already revoked');
        }

        $client = Client::find((string) $supportLogin->client_id);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }

        try {
            $pdo = $this->clientDb->connect($client);
            $stmt = $pdo->prepare('UPDATE users SET is_active = false WHERE id = :uid');
            $stmt->execute(['uid' => $supportLogin->client_user_id]);

            $supportLogin->status = 'revoked';
            $supportLogin->revoked_at = Carbon::now();
            $supportLogin->save();

            PushLog::create([
                'client_id' => $client->id,
                'push_type' => 'support_login',
                'detail' => "Revoked support login '{$supportLogin->login_email}'",
                'success' => true,
                'pushed_by' => $admin->id,
            ]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            return response()->json(['success' => true, 'client' => $client->code, 'login_email' => $supportLogin->login_email]);
        } catch (Throwable $e) {
            throw new ApiException(500, "Failed to revoke: {$e->getMessage()}");
        }
    }

    /** Update a support login's editable fields (currently just the reason). */
    public function updateSupportLogin(string $loginId, Request $request)
    {
        $supportLogin = SupportLogin::find($loginId);
        if (! $supportLogin) {
            throw new ApiException(404, 'Support login not found');
        }

        if ($request->exists('reason')) {
            $supportLogin->reason = $request->input('reason');
        }
        $supportLogin->save();

        return response()->json($this->supportLoginOut($supportLogin));
    }

    // ── Password & Username Management ──────────────────────────────

    public function changeAdminPassword(string $userId, Request $request)
    {
        $admin = $this->currentAdmin($request);
        $user = AdminUser::find($userId);
        if (! $user) {
            throw new ApiException(404, 'Staff not found');
        }

        if ((string) $admin->id !== (string) $user->id && $admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Can only change your own password or be a super admin');
        }

        $currentPassword = $request->input('current_password');
        if ($currentPassword !== null && ! $this->auth->verifyPassword((string) $currentPassword, $user->hashed_password)) {
            throw new ApiException(400, 'Current password is incorrect');
        }

        $newPassword = (string) $request->input('new_password');
        $validation = PasswordValidator::validate($newPassword);
        if (! $validation['valid']) {
            throw new ApiException(400, 'Password does not meet requirements: '.implode(', ', $validation['errors']));
        }

        if (PasswordHistoryService::isAdminPasswordReused((string) $user->id, $newPassword)) {
            throw new ApiException(400, 'Cannot reuse one of your last 5 passwords');
        }

        $hashedPassword = $this->auth->hashPassword($newPassword);
        $user->hashed_password = $hashedPassword;
        $user->last_password_changed_at = now();
        $user->force_password_change_on_next_login = false;
        $user->save();

        PasswordHistoryService::recordAdminPasswordChange((string) $user->id, $hashedPassword);

        return response()->json($this->userOut($user));
    }

    public function resetAdminUsername(string $userId, Request $request)
    {
        $admin = $this->currentAdmin($request);
        if ($admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Only super admins can reset usernames');
        }

        $user = AdminUser::find($userId);
        if (! $user) {
            throw new ApiException(404, 'Staff not found');
        }

        $newUsername = (string) $request->input('username');
        if (AdminUser::where('username', $newUsername)->where('id', '!=', $userId)->exists()) {
            throw new ApiException(400, "Username '{$newUsername}' already in use");
        }

        $user->username = $newUsername;
        $user->save();

        return response()->json($this->userOut($user));
    }

    public function addSupportStaff(Request $request)
    {
        $admin = $this->currentAdmin($request);
        if ($admin->role !== self::SUPER_ADMIN) {
            throw new ApiException(403, 'Only super admins can add support staff');
        }

        $email = (string) $request->input('email');
        if (AdminUser::where('email', $email)->exists()) {
            throw new ApiException(400, "Email '{$email}' already registered");
        }

        $username = (string) $request->input('username');
        if (AdminUser::where('username', $username)->exists()) {
            throw new ApiException(400, "Username '{$username}' already exists");
        }

        $password = (string) $request->input('password');
        $validation = PasswordValidator::validate($password);
        if (! $validation['valid']) {
            throw new ApiException(400, 'Password does not meet requirements: '.implode(', ', $validation['errors']));
        }

        $hashedPassword = $this->auth->hashPassword($password);
        $user = new AdminUser([
            'username' => $username,
            'full_name' => $request->input('full_name'),
            'email' => $email,
            'hashed_password' => $hashedPassword,
            'role' => 'support_engineer',
            'force_password_change_on_next_login' => true,
            'last_password_changed_at' => now(),
        ]);
        $user->save();
        $user->refresh();

        PasswordHistoryService::recordAdminPasswordChange((string) $user->id, $hashedPassword);

        return response()->json($this->userOut($user), 201);
    }

    /**
     * Reset the password of an already-pushed support login, without
     * creating a duplicate support_logins audit row (unlike pushing a
     * new login with the same email, which also re-enables the user).
     */
    public function resetSupportLoginPassword(string $loginId, Request $request)
    {
        $admin = $this->currentAdmin($request);

        $supportLogin = SupportLogin::find($loginId);
        if (! $supportLogin) {
            throw new ApiException(404, 'Support login not found');
        }
        if ($supportLogin->status === 'revoked') {
            throw new ApiException(400, 'Cannot reset the password of a revoked login');
        }

        $client = Client::find((string) $supportLogin->client_id);
        if (! $client) {
            throw new ApiException(404, 'Client not found');
        }

        $newPassword = (string) $request->input('new_password');
        $validation = PasswordValidator::validate($newPassword);
        if (! $validation['valid']) {
            throw new ApiException(400, 'Password does not meet requirements: '.implode(', ', $validation['errors']));
        }
        if (PasswordHistoryService::isSupportPasswordReused((string) $supportLogin->id, $newPassword)) {
            throw new ApiException(400, 'Cannot reuse one of the last 5 passwords');
        }

        try {
            $pdo = $this->clientDb->connect($client);
            $hashedPassword = $this->auth->hashPassword($newPassword);
            $stmt = $pdo->prepare(<<<'SQL'
                UPDATE users SET
                    hashed_password = :pwd,
                    must_change_password = true
                WHERE id = :uid
            SQL);
            $stmt->execute(['uid' => $supportLogin->client_user_id, 'pwd' => $hashedPassword]);

            PasswordHistoryService::recordSupportPasswordChange((string) $supportLogin->id, $hashedPassword);

            PushLog::create([
                'client_id' => $client->id,
                'push_type' => 'support_login',
                'detail' => "Reset password for support login '{$supportLogin->login_email}'",
                'success' => true,
                'pushed_by' => $admin->id,
            ]);

            $client->last_connected_at = Carbon::now();
            $client->save();

            return response()->json(['success' => true, 'client' => $client->code, 'login_email' => $supportLogin->login_email]);
        } catch (Throwable $e) {
            PushLog::create([
                'client_id' => $client->id,
                'push_type' => 'support_login',
                'detail' => "Password reset failed for support login '{$supportLogin->login_email}'",
                'success' => false,
                'error_message' => $e->getMessage(),
                'pushed_by' => $admin->id,
            ]);
            throw new ApiException(500, "Failed to reset password: {$e->getMessage()}");
        }
    }

    private function currentAdmin(Request $request): AdminUser
    {
        return $request->attributes->get('admin');
    }

    private function userOut(AdminUser $u): array
    {
        return [
            'id' => (string) $u->id,
            'username' => $u->username,
            'full_name' => $u->full_name,
            'email' => $u->email,
            'role' => $u->role,
            'is_active' => $u->is_active,
            'force_password_change_on_next_login' => $u->force_password_change_on_next_login,
            'last_password_changed_at' => $u->last_password_changed_at?->toISOString(),
            'created_at' => $u->created_at?->toISOString(),
        ];
    }

    private function supportLoginOut(SupportLogin $s): array
    {
        return [
            'id' => (string) $s->id,
            'admin_user_id' => (string) $s->admin_user_id,
            'client_id' => (string) $s->client_id,
            'login_email' => $s->login_email,
            'client_user_id' => $s->client_user_id,
            'status' => $s->status,
            'reason' => $s->reason,
            'force_password_change_on_next_login' => $s->force_password_change_on_next_login,
            'pushed_at' => $s->pushed_at?->toISOString(),
            'pushed_by' => $s->pushed_by ? (string) $s->pushed_by : null,
            'revoked_at' => $s->revoked_at?->toISOString(),
        ];
    }
}
