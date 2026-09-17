<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Exception;

class GitHubVersionProvider
{
    private const GITHUB_API_URL = 'https://api.github.com/repos/dennisgoh84-webmaster/websoft-service-erp/releases/latest';
    private const CACHE_TTL = 3600; // 1 hour

    public function getLatestRelease(): array
    {
        try {
            $cached = Cache::get('github_latest_release');
            if ($cached) {
                return $cached;
            }

            $response = Http::withHeaders([
                'Accept' => 'application/vnd.github.v3+json',
            ])->timeout(10)->get(self::GITHUB_API_URL);

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

            Cache::put('github_latest_release', $release, self::CACHE_TTL);

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
