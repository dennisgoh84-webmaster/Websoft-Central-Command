<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Exception;

/**
 * Latest GitHub release of one repository -- the client ERP by default
 * (what VersionManagementService pushes to clients), or Central Command
 * itself via forCentralCommand() (what CcUpgradeService upgrades).
 */
class GitHubVersionProvider
{
    public const ERP_REPO = 'dennisgoh84-webmaster/websoft-service-erp';

    public const CENTRAL_COMMAND_REPO = 'dennisgoh84-webmaster/Websoft-Central-Command';

    private const CACHE_TTL = 3600; // 1 hour

    public function __construct(private string $repo = self::ERP_REPO) {}

    public static function forCentralCommand(): self
    {
        return new self(self::CENTRAL_COMMAND_REPO);
    }

    public function getLatestRelease(): array
    {
        try {
            $cacheKey = 'github_latest_release:'.$this->repo;
            $cached = Cache::get($cacheKey);
            if ($cached) {
                return $cached;
            }

            $response = Http::withHeaders([
                'Accept' => 'application/vnd.github.v3+json',
            ])->timeout(10)->get("https://api.github.com/repos/{$this->repo}/releases/latest");

            if (!$response->successful()) {
                throw new Exception('Failed to fetch from GitHub API');
            }

            $data = $response->json();
            $release = [
                'version' => $data['tag_name'] ?? 'unknown',
                'name' => $data['name'] ?? $data['tag_name'] ?? 'Unknown Release',
                'url' => $data['html_url'] ?? null,
                'published_at' => $data['published_at'] ?? null,
                'prerelease' => $data['prerelease'] ?? false,
                'draft' => $data['draft'] ?? false,
                'release_notes' => $data['body'] ?? '',
                'download_url' => $this->getDownloadUrl($data),
            ];

            Cache::put($cacheKey, $release, self::CACHE_TTL);

            return $release;
        } catch (Exception $e) {
            return [
                'error' => $e->getMessage(),
                'version' => null,
            ];
        }
    }

    private function getDownloadUrl(array $release): ?string
    {
        if (isset($release['zipball_url'])) {
            return $release['zipball_url'];
        }
        return null;
    }

    public function compareVersions(string $current, string $latest): int
    {
        // Simple semantic versioning comparison
        // Returns: -1 if current < latest, 0 if equal, 1 if current > latest
        $currentParts = $this->parseVersion($current);
        $latestParts = $this->parseVersion($latest);

        for ($i = 0; $i < 3; $i++) {
            $c = $currentParts[$i] ?? 0;
            $l = $latestParts[$i] ?? 0;

            if ($c < $l) return -1;
            if ($c > $l) return 1;
        }

        return 0;
    }

    private function parseVersion(string $version): array
    {
        // Remove 'v' prefix if present
        $version = ltrim($version, 'v');

        $parts = explode('.', $version);
        return [
            intval($parts[0] ?? 0),
            intval($parts[1] ?? 0),
            intval($parts[2] ?? 0),
        ];
    }
}
