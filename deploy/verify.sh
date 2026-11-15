#!/usr/bin/env bash
# Post-deployment check: prints PASS / WARN / FAIL per item and exits non-zero on any FAIL.
#   cd /opt/ta && sudo bash deploy/verify.sh
# VERIFY_INSECURE=1 accepts a self-signed certificate (local rehearsal with DOMAIN=localhost).
set -uo pipefail
cd "$(dirname "$0")/.."

fails=0; warns=0
pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warns=$((warns + 1)); }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fails=$((fails + 1)); }
val() { grep -E "^$1=" "$2" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

[ -f .env ] || { echo "No .env here — run deploy/install.sh first."; exit 1; }
DOMAIN="$(val DOMAIN .env)"
COMPOSE=(docker compose)
CURL=(curl -sS --max-time 15)
[ "${VERIFY_INSECURE:-0}" = 1 ] && CURL+=(-k)

echo "== Configuration"
perm="$(stat -c %a .env)"; [ "$perm" = 600 ] && pass ".env permissions 600" || fail ".env permissions are $perm (run: chmod 600 .env)"
for k in POSTGRES_PASSWORD FIELD_ENCRYPTION_KEYS BLIND_INDEX_KEY DOMAIN ACME_EMAIL; do
  [ -n "$(val "$k" .env)" ] && pass "$k is set" || fail "$k is empty in .env"
done
case "$(val APP_URL .env)" in https://*) pass "APP_URL is https" ;; *) fail "APP_URL must be https://$DOMAIN" ;; esac
[ "$(val SEED_DEMO_DATA .env)" = false ] && pass "demo data disabled (SEED_DEMO_DATA=false)" || fail "SEED_DEMO_DATA must be false in production"

echo "== Containers"
for s in db app caddy; do
  st="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$s" '$1==s {print $2}')"
  [ "$st" = running ] && pass "$s running" || fail "$s is not running (${st:-missing})"
done
h="$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q app 2>/dev/null)" 2>/dev/null)"
[ "$h" = healthy ] && pass "app healthy" || fail "app health: ${h:-unknown}"
ports="$("${COMPOSE[@]}" ps --format '{{.Service}} {{.Ports}}' 2>/dev/null | grep -E '^(db|app) ' | grep -E '0\.0\.0\.0|\[::\]|127\.0\.0\.1:' || true)"
[ -z "$ports" ] && pass "db and app are not published to the host" || fail "db/app publish ports: $ports"

echo "== HTTPS ($DOMAIN)"
if "${CURL[@]}" -o /dev/null "https://$DOMAIN/api/health" 2>/dev/null; then
  body="$("${CURL[@]}" "https://$DOMAIN/api/health")"
  [ "$body" = '{"ok":true}' ] && pass "health endpoint OK over HTTPS" || fail "health: $body"
  if [ "${VERIFY_INSECURE:-0}" != 1 ]; then
    exp="$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    [ -n "$exp" ] && pass "trusted TLS certificate (expires $exp)" || warn "could not read the certificate"
  fi
  hdr="$("${CURL[@]}" -D - -o /dev/null "https://$DOMAIN/login")"
  grep -qi '^strict-transport-security:' <<<"$hdr" && pass "HSTS header" || fail "HSTS header missing"
  grep -qi "^content-security-policy:.*nonce-" <<<"$hdr" && pass "CSP with nonce" || fail "CSP header missing"
  grep -qi '^x-frame-options: DENY' <<<"$hdr" && pass "X-Frame-Options DENY" || fail "X-Frame-Options missing"
  grep -qi '^x-powered-by:' <<<"$hdr" && fail "X-Powered-By leaks the framework" || pass "no X-Powered-By"
  code="$(curl -s --max-time 10 -o /dev/null -w '%{http_code}' "http://$DOMAIN/login")"
  [ "$code" = 308 ] || [ "$code" = 301 ] && pass "http redirects to https ($code)" || fail "http → https redirect missing ($code)"
else
  fail "https://$DOMAIN is not reachable (DNS A record? ports 80/443 open in the AWS security group?)"
fi

echo "== PDF rendering (Chromium in the image)"
pdf="$("${COMPOSE[@]}" exec -T app node -e '
const { chromium } = require("playwright-core");
chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  .then(async (b) => { const p = await b.newPage(); await p.setContent("<p dir=rtl>שלום · مرحبا</p>"); const pdf = await p.pdf(); console.log(pdf.length); await b.close(); })
  .catch((e) => { console.log("ERR " + e.message.split("\n")[0]); });' 2>&1 | tail -n 1)"
[[ "$pdf" =~ ^[0-9]+$ ]] && [ "$pdf" -gt 1000 ] && pass "Chromium renders a PDF ($pdf bytes)" || fail "PDF self-test: $pdf"

echo "== Operations"
if [ -f backup.env ] && [ -n "$(val AGE_RECIPIENT backup.env)" ] && [ -n "$(val S3_BUCKET backup.env)" ]; then
  pass "backup.env configured"
  [ "$(stat -c %a backup.env)" = 600 ] && pass "backup.env permissions 600" || fail "backup.env must be chmod 600"
else
  warn "backups NOT configured yet (fill backup.env — docs/DEPLOYMENT.md §5)"
fi
[ -f /etc/cron.d/ta-platform ] && pass "cron jobs installed (backup + privacy purge)" || warn "cron jobs missing (/etc/cron.d/ta-platform)"
demo="$("${COMPOSE[@]}" exec -T db psql -U ta -d ta_platform -tAc "SELECT count(*) FROM users WHERE email LIKE '%.demo@example.test'" 2>/dev/null | tr -d '[:space:]')"
[ "$demo" = 0 ] && pass "no demo client logins" || warn "demo client logins present ($demo)"
ret="$("${COMPOSE[@]}" exec -T db psql -U ta -d ta_platform -tAc "SELECT value::text FROM advisory_parameters WHERE key='privacy.retention_years' ORDER BY \"effectiveFrom\" DESC LIMIT 1" 2>/dev/null | tr -d '[:space:]')"
[ -n "$ret" ] && [ "$ret" != null ] && pass "retention period set ($ret years)" || warn "privacy.retention_years not set (purge disabled until set with legal counsel)"
if [ "$(swapon --noheadings 2>/dev/null | wc -l)" -gt 0 ] || [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -gt 3500000 ]; then pass "memory OK for PDF rendering"; else warn "less than 4 GB RAM and no swap"; fi
use="$(df --output=pcent / | tail -n 1 | tr -dc 0-9)"; [ "$use" -lt 80 ] && pass "disk usage ${use}%" || warn "disk usage ${use}%"

echo
if [ "$fails" -eq 0 ]; then
  echo "RESULT: OK ($warns warning(s))"
else
  echo "RESULT: $fails FAILURE(S), $warns warning(s)"
  exit 1
fi
