#!/bin/sh
# Restore one backup set into a database (and optionally the uploads directory).
#
#   restore.sh <timestamp|latest> <target DATABASE_URL> [uploads target dir]
#
# Needs the age PRIVATE key: AGE_IDENTITY_FILE (path). Source: S3_BUCKET (+ credentials,
# optional S3_ENDPOINT) or BACKUP_DIR. The target database is CLEANED first (pg_restore
# --clean): never point it at production unless that is exactly what you intend.
set -eu

TS="${1:?usage: restore.sh <timestamp|latest> <target DATABASE_URL> [uploads dir]}"
TARGET="${2:?target DATABASE_URL required}"
UPLOADS_TARGET="${3:-}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE (age private key file) is required}"
PREFIX="${S3_PREFIX:-ta-platform}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ENDPOINT=""
[ -n "${S3_ENDPOINT:-}" ] && ENDPOINT="--endpoint-url $S3_ENDPOINT"

if [ "$TS" = "latest" ]; then
  if [ -n "${S3_BUCKET:-}" ]; then
    # shellcheck disable=SC2086
    TS="$(aws s3 ls $ENDPOINT "s3://$S3_BUCKET/$PREFIX/" | awk '/PRE/ {print $2}' | tr -d / | sort | tail -n 1)"
  else
    TS="$(ls -1 "${BACKUP_DIR:?}" | sort | tail -n 1)"
  fi
  [ -n "$TS" ] || { echo "[restore] no backups found" >&2; exit 1; }
fi
echo "[restore] backup set $TS"

if [ -n "${S3_BUCKET:-}" ]; then
  # shellcheck disable=SC2086
  aws s3 cp $ENDPOINT --only-show-errors --recursive "s3://$S3_BUCKET/$PREFIX/$TS/" "$WORK/"
else
  cp "${BACKUP_DIR:?}/$TS/"* "$WORK/"
fi

(cd "$WORK" && sha256sum -c "manifest-$TS.sha256")

age -d -i "$AGE_IDENTITY_FILE" "$WORK/db-$TS.dump.age" | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$TARGET"
echo "[restore] database restored"

if [ -n "$UPLOADS_TARGET" ] && [ -f "$WORK/uploads-$TS.tar.gz.age" ]; then
  mkdir -p "$UPLOADS_TARGET"
  age -d -i "$AGE_IDENTITY_FILE" "$WORK/uploads-$TS.tar.gz.age" | tar -C "$UPLOADS_TARGET" -xzf -
  echo "[restore] uploads restored to $UPLOADS_TARGET"
fi
echo "[restore] done"
