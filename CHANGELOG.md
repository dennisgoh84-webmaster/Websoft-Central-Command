# Changelog

All notable changes to Central Command are logged here. Dates are when
the change landed on `main` (or the branch it shipped from before
merge). Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Fixed
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
