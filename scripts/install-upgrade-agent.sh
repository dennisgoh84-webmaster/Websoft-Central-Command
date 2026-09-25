#!/usr/bin/env bash
#
# Installs (or refreshes) the systemd timer that runs
# scripts/upgrade-agent.sh once a minute, and makes sure .env carries
# the CC_UPGRADE_AGENT_TOKEN the agent and the backend share. Idempotent;
# deploy.sh and upgrade.sh both call it, so a server only ever needs
# one manual deploy -- every upgrade after that can come from Central
# Command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
UNIT="central-command-upgrade-agent"
RUN_USER="$(id -un)"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    %s\033[0m\n' "$*"; }

[ -f .env ] || { warn "No .env yet -- run scripts/deploy.sh first."; exit 0; }

if ! grep -qE '^CC_UPGRADE_AGENT_TOKEN=.+' .env; then
  TOKEN="$(openssl rand -hex 32)"
  if grep -qE '^CC_UPGRADE_AGENT_TOKEN=' .env; then
    sed -i "s|^CC_UPGRADE_AGENT_TOKEN=.*|CC_UPGRADE_AGENT_TOKEN=$TOKEN|" .env
  else
    printf '\n# Shared secret between the backend and scripts/upgrade-agent.sh (generated).\nCC_UPGRADE_AGENT_TOKEN=%s\n' "$TOKEN" >> .env
  fi
  echo "    generated CC_UPGRADE_AGENT_TOKEN in .env"
  # The backend reads the token from its environment when it starts, so a
  # backend that is already running must be recreated to pick it up --
  # otherwise the agent's check-ins are refused until its next restart.
  # --no-deps: recreate just the backend, not the services it depends on.
  if docker compose ps --status running --services 2>/dev/null | grep -qx cc-backend; then
    docker compose up -d --no-deps cc-backend >/dev/null 2>&1 \
      && echo "    restarted cc-backend so it has the token" \
      || warn "could not restart cc-backend -- run: docker compose up -d"
  fi
fi

chmod +x scripts/upgrade-agent.sh scripts/upgrade.sh

if ! command -v systemctl >/dev/null 2>&1; then
  warn "systemd not found -- add this cron line instead (runs as $RUN_USER):"
  warn "  * * * * * flock -n /tmp/$UNIT.lock $ROOT/scripts/upgrade-agent.sh"
  exit 0
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else
    warn "Cannot write systemd units without sudo. Run once as root (or with sudo):"
    warn "  sudo $ROOT/scripts/install-upgrade-agent.sh"
    exit 0
  fi
fi

say "Installing the $UNIT systemd timer (runs as $RUN_USER)"
$SUDO tee "/etc/systemd/system/$UNIT.service" >/dev/null <<UNITEOF
[Unit]
Description=Central Command upgrade agent (one tick)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$ROOT
ExecStart=$ROOT/scripts/upgrade-agent.sh
UNITEOF

$SUDO tee "/etc/systemd/system/$UNIT.timer" >/dev/null <<UNITEOF
[Unit]
Description=Run the Central Command upgrade agent every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
UNITEOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$UNIT.timer" >/dev/null
echo "    active: $($SUDO systemctl is-active "$UNIT.timer")  --  status: systemctl status $UNIT.timer ; log: backups/upgrade-logs/agent.log"
