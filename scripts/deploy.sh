#!/usr/bin/env bash
# One file, one command: get Central Command running on a server, or
# bring an already-running install up to date. Safe to run again and
# again — every step below only does something if it isn't already done.
#
#   scp scripts/deploy.sh you@server:~/deploy.sh   # or just copy/paste it
#   ssh you@server
#   chmod +x deploy.sh
#   ./deploy.sh                      # first run: clones the repo, deploys
#   ./deploy.sh                      # later runs: pulls + upgrades in place
#   ./deploy.sh v1.3.0               # upgrade to a specific tag/branch/commit
#
# What happens, in order:
#   1. Installs Docker if it isn't already on the box
#   2. Clones the repo on first run (into ./central-command), or reuses
#      the existing checkout on every run after that
#   3. Creates .env from the template on first run; either way, fills in
#      any of the three required secrets (CC_POSTGRES_PASSWORD,
#      CC_JWT_SECRET_KEY, CC_APP_KEY) that are still blank — covers a
#      hand-created .env that missed one, not just a brand new file
#   4. If the code is already at the target commit AND the stack is
#      already running, stops here — nothing to do. Otherwise continues
#      even on an unchanged commit, so a stopped stack still gets started.
#   5. Backs up the Central Command database before touching anything
#      (skipped when there's no database running yet to back up)
#   6. Pulls the target code, rebuilds the containers — the backend
#      container runs pending Laravel migrations automatically on start
#      (see backend/app/Console/Commands/CentralCommandInstall.php),
#      so this is what upgrades an already-running install
#   7. Waits for the backend to report healthy, then runs the smoke test
#   8. Installs/refreshes the upgrade-agent systemd timer, so every
#      upgrade AFTER this one can be started from the CC Upgrade screen
#      (scripts/upgrade-agent.sh) -- this is the last manual deploy
#
# If anything fails after step 5, the database backup from that step is
# left in place and the script prints how to restore it.
set -euo pipefail

REPO_URL="https://github.com/dennisgoh84-webmaster/websoft-central-command.git"
TARGET_REF="${1:-main}"
INSTALL_DIR="${CC_INSTALL_DIR:-$HOME/central-command}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

# 1. Docker --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Docker not found; installing (requires sudo)"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker installed. If the next step fails with a permission error,"
  echo "log out and back in (group membership), then re-run this script."
fi
if ! docker compose version >/dev/null 2>&1; then
  say "Docker Compose plugin missing; installing"
  sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin
fi
docker ps >/dev/null

# 2. Get / update the code ------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  say "Existing install found at $INSTALL_DIR"
  cd "$INSTALL_DIR"
  if [ -n "$(git status --porcelain)" ]; then
    die "Working tree at $INSTALL_DIR has uncommitted changes. Commit, stash, or discard them, then re-run."
  fi
  PREV_COMMIT=$(git rev-parse HEAD)
  git fetch origin
  git checkout "$TARGET_REF"
  git pull --ff-only origin "$TARGET_REF" 2>/dev/null || true
  NEW_COMMIT=$(git rev-parse HEAD)
  FIRST_RUN=0
else
  say "No existing install — cloning into $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  git checkout "$TARGET_REF"
  PREV_COMMIT="(none — first install)"
  NEW_COMMIT=$(git rev-parse HEAD)
  FIRST_RUN=1
fi

# 3. .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  say "Creating .env from the template"
  cp .env.example .env
  chmod 600 .env
else
  say "Using existing .env"
fi

# Fill in any of the three required secrets that are still blank. Covers
# both a brand new .env (all three blank) and one that was hand-created
# (e.g. `cp .env.example .env` per the old manual instructions) and left
# one unset — which otherwise only surfaces later as docker compose
# refusing to start with "required variable ... is missing".
fill_secret_if_blank() {
  key="$1"; value="$2"
  if grep -qE "^${key}=.+" .env; then
    return
  fi
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
  echo "  generated ${key}"
}
fill_secret_if_blank CC_POSTGRES_PASSWORD "$(openssl rand -hex 24)"
fill_secret_if_blank CC_JWT_SECRET_KEY "$(openssl rand -hex 32)"
fill_secret_if_blank CC_APP_KEY "base64:$(openssl rand -base64 32)"
fill_secret_if_blank CC_UPGRADE_AGENT_TOKEN "$(openssl rand -hex 32)"

# shellcheck disable=SC1091
set -a; . ./.env; set +a
PORT="${CC_HTTP_PORT:-8080}"

# 4. Skip only if nothing has changed AND the stack is actually running ---
# (checked here, after .env is guaranteed complete, since `docker compose
# ps` needs it to interpolate the compose file at all)
STACK_RUNNING=0
BACKEND_CID=$(docker compose ps -q cc-backend 2>/dev/null || true)
if [ -n "$BACKEND_CID" ] && [ "$(docker inspect -f '{{.State.Running}}' "$BACKEND_CID" 2>/dev/null || echo false)" = "true" ]; then
  STACK_RUNNING=1
fi

if [ "$FIRST_RUN" = "0" ] && [ "$NEW_COMMIT" = "$PREV_COMMIT" ] && [ "$STACK_RUNNING" = "1" ]; then
  echo "Already up to date at $NEW_COMMIT and the stack is running. Nothing to do."
  exit 0
fi

say "Deploying $PREV_COMMIT -> $NEW_COMMIT"

# 5. Back up the database before touching anything ------------------------
BACKUP_FILE="(none — no prior database)"
if [ -n "$(docker compose ps -q cc-db 2>/dev/null || true)" ]; then
  say "Backing up the database"
  mkdir -p backups
  STAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_FILE="backups/cc-pre-deploy-$STAMP.dump"
  docker compose exec -T cc-db pg_dump -U cc_app -Fc central_command > "$BACKUP_FILE"
  echo "Backup written to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
fi

# 6. Build and start --------------------------------------------------------
say "Building images and starting the stack"
docker compose up -d --build

# 7. Wait for health, then verify --------------------------------------------
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

DEPLOY FAILED before the smoke test could run.

To roll back the code:
    cd "$INSTALL_DIR" && git checkout $PREV_COMMIT && docker compose up -d --build

Database backup: $BACKUP_FILE
To restore it:
    docker compose exec -T cc-db pg_restore -U cc_app -d central_command --clean < "$BACKUP_FILE"
EOM
  exit 1
fi

say "Running smoke test against http://localhost:$PORT"
if ! bash scripts/smoke-test.sh "http://localhost:$PORT"; then
  cat <<EOM

DEPLOY completed a build and restart, but the smoke test FAILED.

To roll back the code:
    cd "$INSTALL_DIR" && git checkout $PREV_COMMIT && docker compose up -d --build

Database backup: $BACKUP_FILE
To restore it:
    docker compose exec -T cc-db pg_restore -U cc_app -d central_command --clean < "$BACKUP_FILE"
EOM
  exit 1
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
say "Done"
echo "  $PREV_COMMIT -> $NEW_COMMIT"
echo "  Open:      http://${IP:-<server-ip>}:$PORT"
if [ "$FIRST_RUN" = "1" ]; then
  echo "  Login:     admin / Admin123   (change it immediately after first login)"
fi
echo "  Backup:    $BACKUP_FILE"
echo "  Logs:      cd $INSTALL_DIR && docker compose logs -f cc-backend"
echo "  Next time: re-run this same script to pull and deploy future updates"

# 8. Remote upgrades from now on -------------------------------------------
say "Enabling upgrades from the CC Upgrade screen"
./scripts/install-upgrade-agent.sh || echo "  (agent timer not installed -- see above; re-run scripts/install-upgrade-agent.sh with sudo)"
