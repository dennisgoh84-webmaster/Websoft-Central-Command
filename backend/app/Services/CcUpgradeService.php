<?php

namespace App\Services;

use App\Models\CcVersionHistory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Upgrades THIS Central Command install from its own GitHub releases
 * (the client-ERP counterpart is VersionManagementService). Only code
 * and config are backed up and swapped; the database is never
 * restored, only migrated forward, so existing data survives.
 */
class CcUpgradeService
{
    private GitHubVersionProvider $githubProvider;

    public function __construct()
    {
        $this->githubProvider = GitHubVersionProvider::forCentralCommand();
    }

    /**
     * The tracked current row, seeded from the checked-out git tag the
     * first time nothing is tracked yet (an install that predates
     * version tracking) so the page has something to compare against.
     */
    public function getCurrentVersion(): ?CcVersionHistory
    {
        $current = CcVersionHistory::getCurrentVersion();
        if ($current) {
            return $current;
        }

        $tag = $this->getGitCurrentTag();
        if ($tag === '') {
            return null;
        }

        $current = new CcVersionHistory([
            'id' => (string) Str::uuid(),
            'version' => $tag,
            'status' => 'current',
            'upgraded_at' => Carbon::now(),
            'created_at' => Carbon::now(),
        ]);
        $current->save();

        return $current;
    }

    public function getPreviousVersion(): ?CcVersionHistory
    {
        return CcVersionHistory::getPreviousVersion();
    }

    public function getLatestVersionFromGithub(): ?string
    {
        return $this->githubProvider->getLatestRelease()['version'] ?? null;
    }

    public function canUpgrade(): array
    {
        $latest = $this->getLatestVersionFromGithub();
        $current = $this->getCurrentVersion();

        if (!$latest) {
            return ['can_upgrade' => false, 'reason' => 'Unable to fetch latest version from GitHub'];
        }

        if (!$current) {
            return ['can_upgrade' => false, 'reason' => 'Current version not tracked (checkout is not on a git tag)'];
        }

        $canUpgrade = $this->githubProvider->compareVersions($current->version, $latest) < 0;
        return [
            'can_upgrade' => $canUpgrade,
            'current_version' => $current->version,
            'latest_version' => $latest,
            'reason' => $canUpgrade ? null : 'Already on latest version',
        ];
    }

    public function upgrade(string $targetVersion): void
    {
        $current = $this->getCurrentVersion();
        if (!$current) {
            throw new RuntimeException('No current version tracked');
        }

        try {
            $this->createBackup($current->version, $targetVersion);
            $this->pullLatestCode($targetVersion);
            $this->runMigrations();
            $this->clearCaches();

            $previous = $this->getPreviousVersion();
            if ($previous) {
                $previous->status = 'rollback';
                $previous->save();
            }

            $current->status = 'previous';
            $current->save();

            $newVersion = new CcVersionHistory([
                'id' => (string) Str::uuid(),
                'version' => $targetVersion,
                'status' => 'current',
                'release_notes' => $this->githubProvider->getLatestRelease()['release_notes'] ?? null,
                'backup_path' => $this->getBackupPath($current->version, $targetVersion),
                'upgraded_at' => Carbon::now(),
                'created_at' => Carbon::now(),
            ]);
            $newVersion->save();
        } catch (RuntimeException $e) {
            $current->status = 'failed';
            $current->error_message = $e->getMessage();
            $current->save();
            throw new RuntimeException("Upgrade failed: {$e->getMessage()}");
        }
    }

    public function rollback(): void
    {
        $current = $this->getCurrentVersion();
        $previous = $this->getPreviousVersion();

        if (!$current || !$previous) {
            throw new RuntimeException('Cannot rollback: missing version history');
        }

        try {
            $this->restoreBackup($previous->backup_path);
            $this->runMigrations();
            $this->clearCaches();

            $current->status = 'rollback';
            $current->save();

            $previous->status = 'current';
            $previous->save();
        } catch (RuntimeException $e) {
            throw new RuntimeException("Rollback failed: {$e->getMessage()}");
        }
    }

    private function createBackup(string $fromVersion, string $toVersion): void
    {
        $backupDir = storage_path('upgrades/cc-backups/'.$fromVersion.'_to_'.$toVersion.'/'.now()->timestamp);
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }

        $srcDirs = [
            base_path('app'),
            base_path('routes'),
            base_path('config'),
            base_path('bootstrap'),
        ];

        foreach ($srcDirs as $dir) {
            if (is_dir($dir)) {
                $dest = $backupDir.'/'.basename($dir);
                $this->copyDir($dir, $dest);
            }
        }

        if (file_exists(base_path('.env'))) {
            copy(base_path('.env'), $backupDir.'/.env');
        }
    }

    private function pullLatestCode(string $version): void
    {
        shell_exec('cd '.escapeshellarg(base_path()).' && git fetch origin --tags && git checkout '.escapeshellarg($version).' 2>&1');
        if ($this->getGitCurrentTag() !== $version) {
            throw new RuntimeException('Failed to checkout version '.$version);
        }
    }

    private function getGitCurrentTag(): string
    {
        return trim((string) shell_exec('cd '.escapeshellarg(base_path()).' && git describe --tags --exact-match 2>/dev/null'));
    }

    private function runMigrations(): void
    {
        try {
            Artisan::call('migrate', ['--force' => true]);
        } catch (RuntimeException $e) {
            throw new RuntimeException('Migration failed: '.$e->getMessage());
        }
    }

    private function clearCaches(): void
    {
        Artisan::call('cache:clear');
        Artisan::call('config:clear');
    }

    private function restoreBackup(string $backupPath): void
    {
        if (!is_dir($backupPath)) {
            throw new RuntimeException('Backup directory not found: '.$backupPath);
        }

        $srcDirs = ['app', 'routes', 'config', 'bootstrap'];
        foreach ($srcDirs as $dir) {
            $src = $backupPath.'/'.$dir;
            $dest = base_path($dir);
            if (is_dir($src)) {
                $this->removeDir($dest);
                $this->copyDir($src, $dest);
            }
        }

        if (file_exists($backupPath.'/.env')) {
            copy($backupPath.'/.env', base_path('.env'));
        }
    }

    private function copyDir(string $src, string $dest): void
    {
        if (!is_dir($src)) {
            return;
        }
        if (!is_dir($dest)) {
            mkdir($dest, 0755, true);
        }

        $files = scandir($src);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $srcFile = $src.'/'.$file;
            $destFile = $dest.'/'.$file;
            if (is_dir($srcFile)) {
                $this->copyDir($srcFile, $destFile);
            } else {
                copy($srcFile, $destFile);
            }
        }
    }

    private function removeDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $files = scandir($dir);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = $dir.'/'.$file;
            if (is_dir($path)) {
                $this->removeDir($path);
            } else {
                unlink($path);
            }
        }
        rmdir($dir);
    }

    private function getBackupPath(string $fromVersion, string $toVersion): string
    {
        return 'upgrades/cc-backups/'.$fromVersion.'_to_'.$toVersion;
    }
}
