#!/usr/bin/env bash
#
# Put HTTPS in front of Central Command (and, optionally, the ERP) on
# this host, using Caddy as a reverse proxy. Run once with sudo; safe to
# run again to change the sites.
#
#   sudo ./scripts/setup-https.sh ADDRESS=PORT [ADDRESS=PORT ...]
#
# ADDRESS is where people will open it; PORT is the local HTTP port the
# app already listens on (CC_HTTP_PORT for Central Command, HTTP_PORT
# for the ERP).
#
#   With a domain name -- including an office router's DDNS name such as
#   office.ddns.net -- a free Let's Encrypt certificate, renewed by itself.
#   Let's Encrypt checks the name on its port 80, so from the internet
#   ports 80 and the HTTPS ports must reach this server (behind a router:
#   forward them to this server's office address):
#     sudo ./scripts/setup-https.sh cc.example.com=8082 erp.example.com=8083
#     sudo ./scripts/setup-https.sh office.ddns.net:8443=8082 office.ddns.net:8444=8083
#
#   With only the server's address (office network, no domain) -- Caddy's
#   own private certificate; each device trusts it once (printed below):
#     sudo ./scripts/setup-https.sh 192.168.0.188:8443=8082 192.168.0.188:8444=8083
#
#   With an IP address, each device can then download that certificate
#   from http://ADDRESS:8440 (plain HTTP on purpose -- the device doesn't
#   trust HTTPS here yet). Only the public certificate is served, never
#   its key. Another port: CERT_PORT=8450 sudo -E ./scripts/setup-https.sh ...
#
#   Preview the configuration without installing or changing anything:
#     ./scripts/setup-https.sh --dry-run cc.example.com=8082
#
# Afterwards, close the plain-HTTP port to everything but this server:
# set CC_HTTP_BIND=127.0.0.1 in Central Command's .env and run
# `docker compose up -d` (the upgrade agent talks to 127.0.0.1, so it
# keeps working). See DEPLOY.md, "HTTPS".
set -euo pipefail

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n\n' "$*" >&2; exit 1; }

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi
[ $# -ge 1 ] || die "Give at least one ADDRESS=PORT, e.g. cc.example.com=8082 -- see the top of this script."

CADDYFILE=/etc/caddy/Caddyfile
CERT_PORT="${CERT_PORT:-8440}"
# Where the Caddy package's service keeps its private CA (HOME=/var/lib/caddy).
CA_DIR="${CADDY_CA_DIR:-/var/lib/caddy/.local/share/caddy/pki/authorities/local}"
BEGIN='# >>> websoft-https (managed by setup-https.sh -- edit by re-running it)'
END='# <<< websoft-https'

is_ip() { [[ "$1" =~ ^[0-9]+(\.[0-9]+){3}$ ]] || [[ "$1" == *:*:* ]] || [ "$1" = localhost ]; }

# ---- 1. build the site blocks --------------------------------------------
BLOCK="$BEGIN"$'\n'
NEEDED_PORTS=()
PUBLIC_PORTS=()   # what a router in front must forward here (domain sites)
PRIVATE_CA=0
for arg in "$@"; do
  [[ "$arg" == *=* ]] || die "\"$arg\" is not ADDRESS=PORT"
  addr="${arg%=*}"; upstream="${arg##*=}"
  [[ "$upstream" =~ ^[0-9]+$ ]] || die "\"$upstream\" in \"$arg\" is not a port number"
  host="${addr%:*}"; listen=""
  if [[ "$addr" == *:* ]] && [[ "${addr##*:}" =~ ^[0-9]+$ ]]; then listen="${addr##*:}"; else host="$addr"; fi

  if is_ip "$host"; then
    PRIVATE_CA=1
    CA_HOST="${CA_HOST:-$host}"
    port="${listen:-443}"
    NEEDED_PORTS+=("$port")
    BLOCK+="https://$host:$port {"$'\n'"    tls internal"$'\n'
  else
    [[ "$host" == *.* ]] || die "\"$host\" is neither a domain name nor an IP address"
    if [ -n "$listen" ]; then
      NEEDED_PORTS+=("$listen" 80)
      PUBLIC_PORTS+=(80 "$listen")
      BLOCK+="$host:$listen {"$'\n'
    else
      NEEDED_PORTS+=(443 80)
      PUBLIC_PORTS+=(80 443)
      BLOCK+="$host {"$'\n'
    fi
  fi
  BLOCK+="    encode gzip"$'\n'"    reverse_proxy 127.0.0.1:$upstream"$'\n'"}"$'\n\n'
done
if [ "$PRIVATE_CA" -eq 1 ]; then
  # Hand out the private CA's public certificate so devices can trust it.
  # Every path is rewritten to root.crt, so root.key beside it can never
  # be fetched.
  NEEDED_PORTS+=("$CERT_PORT")
  BLOCK+="http://$CA_HOST:$CERT_PORT {"$'\n'
  BLOCK+="    root * $CA_DIR"$'\n'
  BLOCK+="    rewrite * /root.crt"$'\n'
  BLOCK+="    header Content-Type application/x-x509-ca-cert"$'\n'
  BLOCK+="    header Content-Disposition \"attachment; filename=websoft-root.crt\""$'\n'
  BLOCK+="    file_server"$'\n'"}"$'\n\n'
fi
BLOCK+="$END"

if [ "$DRY_RUN" -eq 1 ]; then
  say "Caddy configuration that would be written to $CADDYFILE"
  echo "$BLOCK"
  exit 0
fi

[ "$(id -u)" -eq 0 ] || die "Run with sudo: sudo $0 $*"

# ---- 2. install Caddy (official package repository) ------------------------
if ! command -v caddy >/dev/null 2>&1; then
  say "Installing Caddy"
  # No questions mid-install: Ubuntu's needrestart would otherwise stop at a
  # "Which services should be restarted?" screen. 'a' restarts the same
  # services it ticks by default (never the SSH session's own).
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi
echo "    $(caddy version)"

# ---- 3. the ports must be free for Caddy -----------------------------------
say "Checking the ports Caddy needs"
for p in $(printf '%s\n' "${NEEDED_PORTS[@]}" | sort -un); do
  holder=$(ss -ltnpH "sport = :$p" 2>/dev/null | grep -v '"caddy"' || true)
  [ -z "$holder" ] || die "Port $p is already in use by another program:
$holder
Free it, or use another address/port (e.g. 192.168.0.188:8443=8082)."
  echo "    port $p free"
done

# ---- 4. write the managed block, keep anything else in the Caddyfile ------
say "Writing $CADDYFILE"
mkdir -p /etc/caddy
if [ -f "$CADDYFILE" ] && [ ! -f "$CADDYFILE.before-websoft" ]; then
  cp "$CADDYFILE" "$CADDYFILE.before-websoft"
fi
if [ -f "$CADDYFILE" ] && ! grep -q '/usr/share/caddy' "$CADDYFILE"; then
  # A real Caddyfile: replace only our own block.
  OTHER=$(awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$CADDYFILE")
else
  # Missing, or the package's stock welcome page (which takes port 80).
  OTHER=""
fi
TMP=$(mktemp)
{ [ -n "$OTHER" ] && printf '%s\n\n' "$OTHER"; printf '%s\n' "$BLOCK"; } > "$TMP"
if ! caddy validate --adapter caddyfile --config "$TMP" >/dev/null 2>"$TMP.err"; then
  cat "$TMP.err" >&2; rm -f "$TMP" "$TMP.err"
  die "Caddy rejected the configuration above -- nothing was changed."
fi
install -m 644 "$TMP" "$CADDYFILE"; rm -f "$TMP" "$TMP.err"

# ---- 5. firewall and (re)start ---------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  for p in $(printf '%s\n' "${NEEDED_PORTS[@]}" | sort -un); do ufw allow "$p/tcp" >/dev/null && echo "    firewall: allowed $p/tcp"; done
fi
systemctl enable --now caddy >/dev/null 2>&1 || true
systemctl reload caddy || systemctl restart caddy

say "Done"
for arg in "$@"; do
  addr="${arg%=*}"
  echo "    https://$addr   ->   http://127.0.0.1:${arg##*=}"
done
if [ "$PRIVATE_CA" -eq 1 ]; then
  cat <<NOTE

  These addresses use Caddy's own private certificate. Browsers warn until
  each device trusts it once. On each device open

    http://$CA_HOST:$CERT_PORT

  to download it, then install it as a trusted root certificate -- see
  DEPLOY.md, "HTTPS", for Windows, Mac, iPhone and Android. (The same
  file is on this server at $CA_DIR/root.crt.)
NOTE
fi
if [ ${#PUBLIC_PORTS[@]} -gt 0 ]; then
  # This server's own address on its network -- what a router forwards to.
  # (Best effort: with no default route, or no `ip`, it just says "this server".)
  LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}' || true)
  PORTS=$(printf '%s\n' "${PUBLIC_PORTS[@]}" | sort -un | tr '\n' ' ')
  cat <<NOTE

  These addresses get a free Let's Encrypt certificate, which checks the
  name by connecting to its port 80. If this server is behind a router
  (e.g. an office DDNS name), forward these TCP ports on the router to
  ${LAN_IP:-this server}:

    $PORTS

  (If port 80 can't be forwarded, forward 443 instead.) The first visit
  can take a minute while the certificate is issued. If it doesn't load:

    sudo journalctl -u caddy --no-pager -n 50 | grep -iE 'obtain|challenge|error'
NOTE
fi
cat <<NEXT

  Once HTTPS works, close the plain-HTTP ports: remove any router
  forwards for the apps' old http:// ports, and set CC_HTTP_BIND=127.0.0.1
  in Central Command's .env (HTTP_BIND=127.0.0.1 in the ERP's), then
  'docker compose up -d'. The upgrade agents use 127.0.0.1 and keep
  working.
NEXT
