#!/bin/sh
# Monthly restore drill: restore the latest backup into a throwaway database and check it.
# A backup that was never restored is not a backup.
#
#   restore-test.sh <admin DATABASE_URL of the same server, e.g. .../postgres>
#
# Creates ta_restore_drill, restores into it, runs sanity checks, drops it.
set -eu
ADMIN="${1:?usage: restore-test.sh <admin DATABASE_URL>}"
DRILL_DB="ta_restore_drill"
BASE="${ADMIN%/*}"
DRILL_URL="$BASE/$DRILL_DB"

psql "$ADMIN" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DRILL_DB" -c "CREATE DATABASE $DRILL_DB"
trap 'psql "$ADMIN" -q -c "DROP DATABASE IF EXISTS $DRILL_DB" >/dev/null 2>&1 || true' EXIT

restore.sh latest "$DRILL_URL" "$(mktemp -d)"

MIGRATIONS="$(psql "$DRILL_URL" -tA -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
HOUSEHOLDS="$(psql "$DRILL_URL" -tA -c 'SELECT count(*) FROM households')"
AUDIT="$(psql "$DRILL_URL" -tA -c 'SELECT count(*) FROM audit_log')"
TRIGGERS="$(psql "$DRILL_URL" -tA -c "SELECT count(*) FROM pg_trigger WHERE tgname IN ('monthly_snapshots_immutable','audit_log_append_only')")"
echo "[drill] migrations=$MIGRATIONS households=$HOUSEHOLDS audit_rows=$AUDIT protective_triggers=$TRIGGERS"
[ "$MIGRATIONS" -gt 0 ] || { echo "[drill] FAILED: no migrations" >&2; exit 1; }
[ "$AUDIT" -gt 0 ] || echo "[drill] warning: empty audit log (expected only on a brand-new install)" >&2
[ "$TRIGGERS" -eq 2 ] || { echo "[drill] FAILED: protective triggers missing" >&2; exit 1; }
echo "[drill] OK"
