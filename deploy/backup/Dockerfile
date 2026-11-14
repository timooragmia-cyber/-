# Backup / restore tooling: pg_dump 16, age (encryption), aws-cli (any S3-compatible storage).
FROM alpine:3.20
RUN apk add --no-cache postgresql16-client age aws-cli tar gzip coreutils
COPY backup.sh restore.sh restore-test.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/restore-test.sh
ENTRYPOINT ["/bin/sh"]
