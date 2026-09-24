<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Shapes the "where is this install, and what can I do to it" payload
 * the two upgrade screens share -- for Central Command itself (from
 * its own tables) and for a client (read from that client's DB). Both
 * feed plain arrays in so the shape is identical either way.
 */
final class UpgradeStatus
{
    public const AGENT_OFFLINE_AFTER_MINUTES = 5;

    public const ACTIVE = ['pending', 'running'];

    public static function unsupported(string $message): array
    {
        return [
            'supported' => false,
            'message' => $message,
            'agent' => null,
            'agent_online' => false,
            'active' => null,
            'history' => [],
            'can_upgrade' => false,
            'can_rollback' => false,
            'rollback_to' => null,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $agent  one upgrade_agent_state row, ISO timestamps
     * @param  array<string, mixed>|null  $active  the pending/running request, if any
     * @param  list<array<string, mixed>>  $history  most recent first
     */
    public static function shape(?array $agent, ?array $active, array $history): array
    {
        $lastSeen = $agent['last_heartbeat_at'] ?? null;
        $online = $lastSeen !== null
            && Carbon::parse($lastSeen)->gt(Carbon::now()->subMinutes(self::AGENT_OFFLINE_AFTER_MINUTES));

        $current = $agent['current_sha'] ?? null;
        $remote = $agent['remote_sha'] ?? null;

        // Roll back to where the last successful upgrade started from --
        // but only if that isn't where we already are.
        $rollbackTo = null;
        foreach ($history as $h) {
            if (($h['status'] ?? null) === 'succeeded' && ! empty($h['from_sha']) && $h['from_sha'] !== $current) {
                $rollbackTo = $h['from_sha'];
                break;
            }
        }

        return [
            'supported' => true,
            'message' => null,
            'agent' => $agent,
            'agent_online' => $online,
            'active' => $active,
            'history' => $history,
            'can_upgrade' => $active === null && $remote !== null && $remote !== $current,
            'can_rollback' => $active === null && $rollbackTo !== null,
            'rollback_to' => $rollbackTo,
        ];
    }
}
