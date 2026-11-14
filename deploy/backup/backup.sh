#!/bin/sh
# Nightly encrypted backup: database + uploaded files → S3-compatible storage (or a directory).
#
# Nothing is ever written unencrypted: pg_dump and tar stream straight into `age`, encrypted
# to AGE_RECIPIENT (a PUBLIC key). The matching private key is kept OFF the server, so a
# compromised server cannot read old backups.
#
# Required: DATABASE_URL, AGE_RECIPIENT, and either S3_BUCKET (+ AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY, optional S3_ENDPOINT / AWS_DEFAULT_REGION) or BACKUP_DIR.
# Optional: UPLOADS_DIR (default /data/uploads), S3_PREFIX (default ta-platform).
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT (age public key) is required}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
PREFIX="${S3_PREFIX:-ta-platform}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[backup] $TS database"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" | age -r "$AGE_RECIPIENT" -o "$WORK/db-$TS.dump.age"

echo "[backup] $TS uploads ($UPLOADS_DIR)"
if [ -d "$UPLOADS_DIR" ]; then
  tar -C "$UPLOADS_DIR" -czf - . | age -r "$AGE_RECIPIENT" -o "$WORK/uploads-$TS.tar.gz.age"
else
  echo "[backup] warning: $UPLOADS_DIR does not exist, no files backed up" >&2
fi

(cd "$WORK" && sha256sum ./*.age > "manifest-$TS.sha256")

if [ -n "${S3_BUCKET:-}" ]; then
  ENDPOINT=""
  [ -n "${S3_ENDPOINT:-}" ] && ENDPOINT="--endpoint-url $S3_ENDPOINT"
  # shellcheck disable=SC2086
  aws s3 cp $ENDPOINT --only-show-errors --recursive "$WORK/" "s3://$S3_BUCKET/$PREFIX/$TS/"
  echo "[backup] uploaded to s3://$S3_BUCKET/$PREFIX/$TS/"
elif [ -n "${BACKUP_DIR:-}" ]; then
  mkdir -p "$BACKUP_DIR/$TS"
  cp "$WORK"/* "$BACKUP_DIR/$TS/"
  echo "[backup] written to $BACKUP_DIR/$TS/"
else
  echo "[backup] error: set S3_BUCKET or BACKUP_DIR" >&2
  exit 1
fi
echo "[backup] done $TS"
