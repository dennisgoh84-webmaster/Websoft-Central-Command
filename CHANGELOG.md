# Changelog

All notable changes to Central Command are logged here. Dates are when
the change landed on `main` (or the branch it shipped from before
merge). Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added
- **Video Banner screen** — second tab on the Advertisements page.
  Create a banner (video URL + label), target clients, and push;
  previously this only existed as an API (`/api/advertisements/videos`)
  with no UI. `VideoSetting` now returns each video's client
  assignments (`client_id`, `pushed_at`), matching how Advertisement
  already worked, so the list can show a ✓ per client once pushed.
- **`scripts/deploy.sh`** — a single script to copy to a server for both
  first install and every later upgrade. Detects which case it's in
  (installs Docker + clones + generates `.env` on a bare box; backs up
  the database + pulls + rebuilds + smoke-tests on an existing install),
  so there's one thing to run either way. `DEPLOY.md` now leads with it.

### Changed
- **Frontend visual refresh.** The app had no `font-family` set
  anywhere, so every screen rendered in the browser's default serif
  (Times New Roman) — now self-hosts Inter (`@fontsource-variable/inter`,
  no external font CDN calls). Introduced `frontend/src/lib/theme.ts`
  as a single source of truth for color/spacing/typography instead of
  ~50 duplicated hex literals across pages; badges moved from solid
  2013-era "flat UI colors" to soft tinted pills; cards gained a subtle
  shadow; sidebar nav gained a user avatar and refined active state.
  Removed `frontend/src/pages/LicensesPage.tsx`, a dead unrouted
  duplicate of the Client Licenses tab.
- **Dates now show as DD/MM/YYYY** (`frontend/src/lib/format.ts`)
  everywhere a timestamp is rendered, replacing `toLocaleString()`
  (which rendered MM/DD/YYYY on US-locale browsers).
- **Backend rewritten from Python/FastAPI to PHP/Laravel.** Same REST
  API — every route, request/response JSON shape, and the JWT/OTP auth
  flow are unchanged, so the React frontend required no changes.
  Laravel migrations (`backend/database/migrations`) reproduce the
  exact schema the Alembic migrations created (same tables, columns,
  and Postgres enum types). `php artisan cc:install` replaces
  `seed.py`: it runs pending migrations and ensures the default admin
  exists, including detecting a database still tracked by the old
  Alembic-based backend (`alembic_version` present, no Laravel
  `migrations` table) and stamping it as migrated instead of replaying
  `CREATE TABLE` against tables that already exist — the same
  upgrade-safety the previous entry describes, carried forward.
  The backend container now runs php-fpm + nginx instead of uvicorn.

### Fixed
- **Backend Docker image built on the wrong PHP version.** `backend/Dockerfile`
  was pinned to `php:8.3-fpm-bookworm`, but Laravel 13 pulls in Symfony 8
  components that require PHP `>=8.4.1` — a fresh clone couldn't
  `composer install` inside the container. Bumped to
  `php:8.4-fpm-bookworm`; also tightened `composer.json`'s own `php`
  constraint from `^8.2` to `^8.4` to match reality, and refreshed
  `composer.lock`'s content-hash (no dependency versions changed).
- **`scripts/deploy.sh` could leave `CC_APP_KEY` unset.** It only
  generated the three required secrets when `.env` didn't exist at all,
  so an `.env` that already existed but was missing just one of them
  (e.g. hand-created via `cp .env.example .env` per the old manual
  instructions, then only the two `openssl rand` fields filled in) sailed
  through the script and failed later at `docker compose up` with
  "required variable CC_APP_KEY is missing a value". It now fills in any
  of the three secrets that are still blank, whether the file is brand
  new or pre-existing, and leaves anything already set untouched.
- **`scripts/deploy.sh` skipped rebuilding a stopped stack.** It decided
  "nothing to do" purely from whether the checked-out commit had
  changed, so re-running it after a reboot (containers stopped, commit
  unchanged) did nothing instead of bringing the stack back up. It now
  also checks whether `cc-backend` is actually running and only skips
  when both are true.
- Alembic migration history now covers the whole schema. Previously
  only `login_otps` had a real migration; the other twelve tables
  existed solely via `Base.metadata.create_all()`, so any schema
  change to them had no upgrade path on an already-deployed database.
  Added a baseline migration (`d4d7f9e535f6`) capturing every
  remaining table, chained after the existing `login_otps` migration.
  `alembic check` reports no drift against the current models.
- `backend/seed.py` no longer calls `create_all`. It now always runs
  `alembic upgrade head`, and detects a database seeded by the old
  create_all-based script (every table present, stamped at the old
  single-migration head, or not stamped at all) and stamps it forward
  instead of replaying `CREATE TABLE` against tables that already
  exist. This runs automatically on every container start, so
  `docker compose up -d --build` is now a real upgrade path, not just
  a first-install script.
- Super admin accounts can no longer be disabled, demoted, or deleted
  by anyone, including themselves or another super admin. The API
  returns 403; the Staff page shows a 🔒 Protected marker instead of
  the Disable button.

### Added
- `scripts/upgrade.sh` — pulls or checks out a target ref, backs up
  the database first, rebuilds, waits for health, and runs the smoke
  test. Prints exact rollback commands (previous commit + backup file)
  if anything fails; does not auto-rollback.
- `scripts/server-setup.sh` — one-command first install: installs
  Docker if missing, generates `.env` with random secrets, builds,
  starts, waits for health, runs the smoke test.
- `scripts/smoke-test.sh` — health, login, OTP, an authenticated call,
  and the SPA, against any deployed URL.
- `DEPLOY.md` — full server runbook: prerequisites, secrets, first
  boot, verification, registering a client ERP, a test checklist,
  day-2 operations, and a test-vs-production checklist.
- `docs/ui-walkthrough.md` with screenshots — screen-by-screen tester
  script.
- Backend image installs from `uv.lock` (`uv sync --frozen`) instead
  of an unpinned `uv pip install`; adds a `HEALTHCHECK`.
- Frontend image installs from `package-lock.json` (`npm ci`) instead
  of `npm install`; nginx now forwards proxy headers, gzips text
  assets, and long-caches hashed build assets.
- `docker-compose.yml` gates the frontend container on the backend's
  health check and binds Postgres to loopback only.

## 2026-09-13 — Initial commit

- First working version: client registry, advertisement/video push,
  license and module management, config update push, version control,
  staff management and support-login push, dashboard, email-OTP login.
