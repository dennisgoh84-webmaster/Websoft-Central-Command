<?php

namespace App\Services;

use App\Models\AdminPasswordHistory;
use App\Models\SupportLoginPasswordHistory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class PasswordHistoryService
{
    const PASSWORD_HISTORY_LIMIT = 5; // Prevent reuse of last 5 passwords

    /**
     * Check if an admin user is trying to reuse an old password
     */
    public static function isAdminPasswordReused(string $adminUserId, string $newPassword): bool
    {
        $history = AdminPasswordHistory::where('admin_user_id', $adminUserId)
            ->orderByDesc('changed_at')
            ->limit(self::PASSWORD_HISTORY_LIMIT)
            ->get();

        foreach ($history as $record) {
            if (Hash::check($newPassword, $record->hashed_password)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Record a password change for an admin user
     */
    public static function recordAdminPasswordChange(string $adminUserId, string $hashedPassword): void
    {
        AdminPasswordHistory::create([
            'id' => Str::uuid(),
            'admin_user_id' => $adminUserId,
            'hashed_password' => $hashedPassword,
            'changed_at' => now(),
        ]);

        // Clean up old history beyond limit
        $old = AdminPasswordHistory::where('admin_user_id', $adminUserId)
            ->orderByDesc('changed_at')
            ->offset(self::PASSWORD_HISTORY_LIMIT)
            ->pluck('id');

        if ($old->count() > 0) {
            AdminPasswordHistory::whereIn('id', $old)->delete();
        }
    }

    /**
     * Check if a support login is trying to reuse an old password
     */
    public static function isSupportPasswordReused(string $supportLoginId, string $newPassword): bool
    {
        $history = SupportLoginPasswordHistory::where('support_login_id', $supportLoginId)
            ->orderByDesc('changed_at')
            ->limit(self::PASSWORD_HISTORY_LIMIT)
            ->get();

        foreach ($history as $record) {
            if (Hash::check($newPassword, $record->hashed_password)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Record a password change for a support login
     */
    public static function recordSupportPasswordChange(string $supportLoginId, string $hashedPassword): void
    {
        SupportLoginPasswordHistory::create([
            'id' => Str::uuid(),
            'support_login_id' => $supportLoginId,
            'hashed_password' => $hashedPassword,
            'changed_at' => now(),
        ]);

        // Clean up old history beyond limit
        $old = SupportLoginPasswordHistory::where('support_login_id', $supportLoginId)
            ->orderByDesc('changed_at')
            ->offset(self::PASSWORD_HISTORY_LIMIT)
            ->pluck('id');

        if ($old->count() > 0) {
            SupportLoginPasswordHistory::whereIn('id', $old)->delete();
        }
    }
}
