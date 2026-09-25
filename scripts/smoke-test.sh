#!/usr/bin/env bash
# Smoke test for a deployed Central Command instance.
#
#   ./scripts/smoke-test.sh http://<server>:8080 [username] [password]
#
# Checks: API health, login, OTP verification, an authenticated call.
# Relies on the dev-mode OTP being returned by the API (no SMTP configured),
# which is the expected state on a test server.
#
# Without credentials it tries the seeded admin / Admin123. Once that
# password has been changed (as it should be), a 401 still proves the
# backend and its database answer, so the check passes and only the
# signed-in steps are skipped -- an upgrade is not marked failed just
# because the default password is gone (2026-09-25). Give real
# credentials (arguments, or CC_SMOKE_USERNAME / CC_SMOKE_PASSWORD in
# .env) to run every step; with those a rejected login does fail.
set -euo pipefail

BASE="${1:-http://localhost:8080}"
EXPLICIT=0
if [ $# -ge 3 ] || [ -n "${CC_SMOKE_PASSWORD:-}" ]; then EXPLICIT=1; fi
USER_NAME="${2:-${CC_SMOKE_USERNAME:-admin}}"
PASSWORD="${3:-${CC_SMOKE_PASSWORD:-Admin123}}"
API="${BASE%/}/api"

json_field() { # json_field <key>  — reads JSON on stdin, prints string value of key
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"
}

step() { printf '%-42s' "$1"; }
ok()   { echo "OK"; }
fail() { echo "FAIL: $1"; exit 1; }

step "1. GET /api/health"
HEALTH=$(curl -fsS "$API/health") || fail "no response from $API/health"
echo "$HEALTH" | grep -q '"status":"ok"' && ok || fail "$HEALTH"

step "2. POST /api/auth/login"
BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT
CODE=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" "$API/auth/login") \
  || fail "no response from $API/auth/login"
LOGIN=$(cat "$BODY_FILE")
if [ "$CODE" = "401" ] && [ "$EXPLICIT" -eq 0 ]; then
  echo "OK (answering; the default admin password has been changed, so steps 3-5 are skipped)"
  SKIP_SIGNED_IN=1
elif [ "$CODE" != "200" ]; then
  fail "login returned HTTP $CODE (check credentials / backend logs): $LOGIN"
else
  SKIP_SIGNED_IN=0
  SESSION=$(echo "$LOGIN" | json_field otp_session)
  OTP=$(echo "$LOGIN" | json_field _dev_otp)
  [ -n "$SESSION" ] && ok || fail "$LOGIN"
fi

if [ "$SKIP_SIGNED_IN" -eq 0 ]; then

step "3. Dev OTP present in response"
if [ -n "$OTP" ]; then ok; else
  echo "not returned"
  echo "   SMTP appears to be configured; read the OTP from the email or the"
  echo "   backend log (docker compose logs cc-backend) and finish manually."
  SKIP_SIGNED_IN=1
fi
fi

if [ "$SKIP_SIGNED_IN" -eq 0 ]; then

step "4. POST /api/auth/verify-otp"
VERIFY=$(curl -fsS -H 'Content-Type: application/json' \
  -d "{\"otp_session\":\"$SESSION\",\"otp_code\":\"$OTP\"}" "$API/auth/verify-otp") \
  || fail "OTP rejected"
TOKEN=$(echo "$VERIFY" | json_field access_token)
[ -n "$TOKEN" ] && ok || fail "$VERIFY"

step "5. GET /api/dashboard/ (authenticated)"
DASH=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/dashboard/") || fail "dashboard call failed"
echo "$DASH" | grep -q '"total_clients"' && ok || fail "$DASH"
fi

step "6. GET / serves the SPA"
curl -fsS "${BASE%/}/" | grep -qi '<div id="root"' && ok || fail "index.html not served"

echo
echo "All smoke checks passed against $BASE"
[ "$SKIP_SIGNED_IN" -eq 0 ] && echo "$DASH" | sed 's/,"recent_pushes".*//' | sed 's/^/   dashboard: /'
exit 0
