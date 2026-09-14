#!/usr/bin/env bash
# One-command setup for a Central Command test server.
#
#   cd /opt/central-command        # wherever you unpacked / cloned the repo
#   ./scripts/server-setup.sh
#
# What it does:
#   1. Installs Docker Engine + Compose plugin if missing (Debian/Ubuntu)
#   2. Creates .env with freshly generated secrets if it does not exist
#   3. Builds and starts the stack with docker compose
#   4. Waits for the backend to be healthy and runs the smoke test
#
# Safe to re-run: existing .env and database are left untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# 1. Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Docker not found; installing (requires sudo)"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "Docker installed. If 'docker ps' below fails with a permission error,"
  echo "log out and back in (group membership) and re-run this script."
fi
if ! docker compose version >/dev/null 2>&1; then
  say "Docker Compose plugin missing; installing"
  sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin
fi
docker ps >/dev/null

# 2. .env -------------------------------------------------------------------
if [ ! -f .env ]; then
  say "Creating .env with generated secrets"
  PG_PW=$(openssl rand -hex 24)
  JWT=$(openssl rand -hex 32)
  APP_KEY="base64:$(openssl rand -base64 32)"
  sed -e "s|^CC_POSTGRES_PASSWORD=.*|CC_POSTGRES_PASSWORD=$PG_PW|" \
      -e "s|^CC_JWT_SECRET_KEY=.*|CC_JWT_SECRET_KEY=$JWT|" \
      -e "s|^CC_APP_KEY=.*|CC_APP_KEY=$APP_KEY|" \
      .env.example > .env
  chmod 600 .env
  echo ".env written (chmod 600). Edit CC_HTTP_PORT there if 8080 is taken."
else
  say "Using existing .env"
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a
PORT="${CC_HTTP_PORT:-8080}"

# 3. Build + start ----------------------------------------------------------
say "Building images and starting the stack"
docker compose up -d --build

# 4. Wait + verify ----------------------------------------------------------
say "Waiting for the backend to become healthy"
for i in $(seq 1 60); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q cc-backend)" 2>/dev/null || echo starting)
  [ "$STATUS" = "healthy" ] && break
  sleep 3
done
docker compose ps

say "Running smoke test against http://localhost:$PORT"
bash scripts/smoke-test.sh "http://localhost:$PORT"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
say "Done"
echo "Open:      http://${IP:-<server-ip>}:$PORT"
echo "Login:     admin / Admin123   (change it after first login)"
echo "OTP:       shown on screen in the yellow Dev-mode banner"
echo "Logs:      docker compose logs -f cc-backend"
echo "Runbook:   DEPLOY.md   Tester script: docs/ui-walkthrough.md"
