# Central Command backend

The Central Command API — a Laravel (PHP) app. API-only: no Blade
views, no web sessions, admin auth is a JWT bearer token (see
`app/Services/AuthService.php` and `app/Http/Middleware/AuthenticateAdmin.php`).

See the repository root [README.md](../README.md) for the Quick Start
and [DEPLOY.md](../DEPLOY.md) for the server runbook. This file only
covers backend-specific notes.

## Layout

| Path | What |
|---|---|
| `app/Http/Controllers` | One controller per resource (clients, advertisements, licenses, dashboard, staff, upgrades, system mail, auth) — mirrors `routes/api.php` |
| `app/Models` | Eloquent models for Central Command's own database (client ERP databases are never modeled here — see below) |
| `app/Services/ClientDbService.php` | Connects to a client ERP's PostgreSQL on demand (PDO) and runs push operations (ads, licenses, config SQL) |
| `app/Services/AuthService.php` | Password hashing + JWT issue/verify for admin login |
| `app/Console/Commands/CentralCommandInstall.php` | `php artisan cc:install` — runs pending migrations and ensures the default admin exists; safe to run on every start |
| `database/migrations` | Reproduces the exact schema the original Alembic migrations created (same tables/columns/Postgres enum types) |

## Local development

```bash
composer install
cp .env.example .env
php artisan key:generate
# create the database (see repository root README.md §1), then:
php artisan cc:install          # migrate + seed the default admin
php artisan serve --port 8001
```

Default admin login: `admin` / `Admin123`.

## Tests

```bash
php artisan test
```
