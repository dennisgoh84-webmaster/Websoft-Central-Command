<?php

namespace App\Console\Commands;

use App\Models\AdminUser;
use App\Services\AuthService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Bring Central Command's own database to the latest migration and
 * make sure the default admin account exists.
 *
 * Run:  php artisan cc:install
 * Also runs automatically on every container start (see Dockerfile) —
 * this is what makes `docker compose up -d --build` an upgrade path,
 * not just a first-install script. Mirrors the original backend/seed.py.
 */
class CentralCommandInstall extends Command
{
    protected $signature = 'cc:install';

    protected $description = "Migrate Central Command's database and ensure the default admin exists";

    public function handle(AuthService $auth): int
    {
        $this->migrate();

        $user = AdminUser::where('username', 'admin')->first();
        if (! $user) {
            AdminUser::create([
                'username' => 'admin',
                'full_name' => 'Dennis Goh',
                'email' => 'admin@webmaster.com.sg',
                'hashed_password' => $auth->hashPassword('Admin123'),
                'role' => 'super_admin',
            ]);
            $this->info('Created admin user: admin / Admin123 (super_admin)');
        } else {
            // Upgrade existing admin to super_admin if needed
            $changed = false;
            if ($user->role !== 'super_admin') {
                $user->role = 'super_admin';
                $changed = true;
                $this->info('Upgraded admin to super_admin role');
            }
            if (! $user->email) {
                $user->email = 'admin@webmaster.com.sg';
                $changed = true;
            }
            if ($changed) {
                $user->save();
            }
            $this->info('Admin user already exists');
        }

        $this->info('Central Command install/upgrade complete.');

        return self::SUCCESS;
    }

    /**
     * Bring the database schema to the latest migration.
     *
     * Idempotent and safe to run on every container start:
     *   - a brand-new database gets every migration, in order
     *   - a database already at head is a no-op
     *   - a database seeded by the original Python/Alembic backend
     *     (every table already present, tracked by `alembic_version`
     *     instead of Laravel's `migrations` table) is detected and
     *     stamped as migrated instead of re-running DDL for tables
     *     that already exist
     */
    private function migrate(): void
    {
        $hasMigrationsTable = Schema::hasTable('migrations');
        $hasAppTables = Schema::hasTable('admin_users');

        if (! $hasMigrationsTable && $hasAppTables) {
            $this->stampLegacyDatabase();
            $this->info('Legacy database (tables exist, tracked by Alembic): stamped as migrated');

            return;
        }

        $this->call('migrate', ['--force' => true]);
    }

    /**
     * Record every migration file as already run, without executing
     * its up() — used for a database that already has every table
     * because it was created by the original Python/Alembic backend.
     */
    private function stampLegacyDatabase(): void
    {
        Schema::create('migrations', function ($table) {
            $table->increments('id');
            $table->string('migration');
            $table->integer('batch');
        });

        $files = collect(glob(database_path('migrations/*.php')))
            ->map(fn ($path) => basename($path, '.php'))
            ->sort()
            ->values();

        foreach ($files as $migration) {
            DB::table('migrations')->insert(['migration' => $migration, 'batch' => 1]);
        }
    }
}
