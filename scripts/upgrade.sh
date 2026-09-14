#!/usr/bin/env bash
# Safe upgrade for a running Central Command deployment.
#
#   ./scripts/upgrade.sh                  # upgrade to the latest commit on the current branch
#   ./scripts/upgrade.sh v1.2.0           # upgrade to a specific tag / branch / commit
#
# What it does, in order:
#   1. Records the current commit (for rollback)
#   2. Backs up the Central Command database
#   3. Fetches and checks out the target ref
#   4. Rebuilds and restarts the stack (the backend container runs
#      pending Alembic migrations automatically on start — see
#      backend/seed.py)
#   5. Waits for health, then runs the smoke test
#
# If the smoke test fails after the upgrade, the script does NOT
# auto-rollback (a schema migration may not be safely reversible without
# looking at what changed) — it prints the exact commands to restore the
# previous code and database so you can decide.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET_REF="${1:-}"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ -f .env ] || die ".env not found. Run ./scripts/server-setup.sh first, or copy .env.example."
# shellcheck disable=SC1091
set -a; . ./.env; set +a
PORT="${CC_HTTP_PORT:-8080}"

command -v git >/dev/null || die "git is required"
docker compose version >/dev/null || die "docker compose is required"

# 1. Record current state for rollback ---------------------------------
PREV_COMMIT=$(git rev-parse HEAD)
PREV_REF=$(git rev-parse --abbrev-ref HEAD)
say "Current commit: $PREV_COMMIT ($PREV_REF)"

if [ -n "$(git status --porcelain)" ]; then
  die "Working tree has uncommitted changes. Commit, stash, or discard them before upgrading."
fi

# 2. Back up the database ------------------------------------------------
if docker compose ps -q cc-db >/dev/null 2>&1 && [ -n "$(docker compose ps -q cc-db)" ]; then
  say "Backing up the database"
  STAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/cc-pre-upgrade-$STAMP.dump"
  docker compose exec -T cc-db pg_dump -U cc_app -Fc central_command > "$BACKUP_FILE"
  echo "Backup written to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "cc-db is not running yet; skipping backup (nothing to back up on first install)."
  BACKUP_FILE="(none — no prior database)"
fi

# 3. Fetch and check out the target ---------------------------------------
say "Fetching and checking out target"
git fetch origin
if [ -n "$TARGET_REF" ]; then
  git checkout "$TARGET_REF"
else
  git pull origin "$PREV_REF"
fi
NEW_COMMIT=$(git rev-parse HEAD)
echo "Now at $NEW_COMMIT"

if [ "$NEW_COMMIT" = "$PREV_COMMIT" ]; then
  echo "Already up to date. Nothing to build."
  exit 0
fi

say "Changes since $PREV_COMMIT:"
git log --oneline "$PREV_COMMIT..$NEW_COMMIT" | sed 's/^/  /'

# 4. Build and restart ------------------------------------------------------
say "Building and restarting the stack"
docker compose up -d --build

# 5. Wait for health, then verify --------------------------------------------
say "Waiting for the backend to become healthy"
HEALTHY=0
for _ in $(seq 1 60); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q cc-backend)" 2>/dev/null || echo starting)
  if [ "$STATUS" = "healthy" ]; then HEALTHY=1; break; fi
  sleep 3
done

if [ "$HEALTHY" != "1" ]; then
  echo
  echo "Backend did not become healthy. Recent logs:"
  docker compose logs --tail=40 cc-backend
  cat <<EOM

UPGRADE FAILED before the smoke test could run.

To roll back the code (the database backup below is untouched, and
was written before the migration ran — restore it only if the
migration itself changed data you need back):

    git checkout $PREV_COMMIT
    docker compose up -d --build

Database backup: $BACKUP_FILE
To restore it:
    docker compose exec -T cc-db pg_restore -U cc_app -d central_command --clean < "$BACKUP_FILE"
EOM
  exit 1
fi

say "Running smoke test against http://localhost:$PORT"
if ! bash scripts/smoke-test.sh "http://localhost:$PORT"; then
  cat <<EOM

UPGRADE completed a build and restart, but the smoke test FAILED.

To roll back the code:

    git checkout $PREV_COMMIT
    docker compose up -d --build

Database backup (taken before this upgrade): $BACKUP_FILE
To restore it:
    docker compose exec -T cc-db pg_restore -U cc_app -d central_command --clean < "$BACKUP_FILE"
EOM
  exit 1
fi

say "Upgrade complete"
echo "  $PREV_COMMIT -> $NEW_COMMIT"
echo "  Backup:  $BACKUP_FILE"
echo "  Logs:    docker compose logs -f cc-backend"
echo "  Rollback if something looks wrong later:"
echo "    git checkout $PREV_COMMIT && docker compose up -d --build"
