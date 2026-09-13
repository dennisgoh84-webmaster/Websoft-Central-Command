#!/usr/bin/env bash
# Smoke test for a deployed Central Command instance.
#
#   ./scripts/smoke-test.sh http://<server>:8080 [username] [password]
#
# Checks: API health, login, OTP verification, an authenticated call.
# Relies on the dev-mode OTP being returned by the API (no SMTP configured),
# which is the expected state on a test server.
set -euo pipefail

BASE="${1:-http://localhost:8080}"
USER_NAME="${2:-admin}"
PASSWORD="${3:-Admin123}"
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
LOGIN=$(curl -fsS -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" "$API/auth/login") \
  || fail "login rejected (check credentials / backend logs)"
SESSION=$(echo "$LOGIN" | json_field otp_session)
OTP=$(echo "$LOGIN" | json_field _dev_otp)
[ -n "$SESSION" ] && ok || fail "$LOGIN"

step "3. Dev OTP present in response"
if [ -n "$OTP" ]; then ok; else
  echo "not returned"
  echo "   SMTP appears to be configured; read the OTP from the email or the"
  echo "   backend log (docker compose logs cc-backend) and finish manually."
  exit 0
fi

step "4. POST /api/auth/verify-otp"
VERIFY=$(curl -fsS -H 'Content-Type: application/json' \
  -d "{\"otp_session\":\"$SESSION\",\"otp_code\":\"$OTP\"}" "$API/auth/verify-otp") \
  || fail "OTP rejected"
TOKEN=$(echo "$VERIFY" | json_field access_token)
[ -n "$TOKEN" ] && ok || fail "$VERIFY"

step "5. GET /api/dashboard/ (authenticated)"
DASH=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API/dashboard/") || fail "dashboard call failed"
echo "$DASH" | grep -q '"total_clients"' && ok || fail "$DASH"

step "6. GET / serves the SPA"
curl -fsS "${BASE%/}/" | grep -qi '<div id="root"' && ok || fail "index.html not served"

echo
echo "All smoke checks passed against $BASE"
echo "$DASH" | sed 's/,"recent_pushes".*//' | sed 's/^/   dashboard: /'
