# Deployment guide — one VM, Docker Compose, Caddy

For whoever installs and maintains the system: the office's IT provider, or the advisor with
basic Linux experience. Every command is meant to be run as written, in order.

```
Internet ──443──▶ Caddy (TLS, HSTS) ──▶ app (Next.js) ──▶ db (PostgreSQL 16)
                                             │
                                  uploads volume (encrypted files)
cron: backup (nightly, age-encrypted → S3)   ·   privacy purge (daily)
```

Only Caddy is published (ports 80/443). The app and the database are reachable only inside the
Docker network.

## 1. Server

| Item | Recommendation | Why |
|---|---|---|
| Location | Israel region: AWS `il-central-1`, Azure *Israel Central* or Google `me-west1` | Data stays in Israel, which makes the privacy discussion simpler |
| Size | 2 vCPU, 4 GB RAM, 40 GB SSD | PDF rendering (Chromium) needs about 1 GB at peak |
| OS | Ubuntu 24.04 LTS, **encrypted disk** | Encryption at rest is the cloud default; verify that it is on |
| Access | SSH keys only, password login off; port 22 open only to the office IP | Most server break-ins start from SSH |
| Updates | `unattended-upgrades` on | Security patches without manual work |

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git unattended-upgrades ufw
curl -fsSL https://get.docker.com | sudo sh
sudo ufw default deny incoming && sudo ufw allow from <OFFICE_IP> to any port 22 \
  && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

> Docker can bypass ufw for ports it publishes. Only Caddy publishes ports here, by design.
> Never add `ports:` to `db` or `app`.

## 2. DNS

Create an A record, for example `app.ta-mortgages.co.il`, pointing to the server's IP.
Caddy obtains and renews the TLS certificate automatically.

## 3. Code and secrets

```bash
sudo mkdir -p /opt/ta && sudo chown $USER /opt/ta && cd /opt/ta
git clone <repository URL> . && git checkout <release tag>
cp .env.example .env && chmod 600 .env
```

Fill in `.env`:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `FIELD_ENCRYPTION_KEYS` | `v1:` followed by the output of `openssl rand -base64 32` |
| `BLIND_INDEX_KEY` | `openssl rand -base64 32` |
| `APP_URL` | `https://app.ta-mortgages.co.il` (the app refuses to start on `http://` in production) |
| `DOMAIN` / `ACME_EMAIL` | the hostname / the office e-mail for certificate notices |
| `SEED_ADVISOR_EMAIL` / `SEED_ADVISOR_PASSWORD` | the advisor's login (long password) |
| `SEED_DEMO_DATA` | **`false`** — never seed fictional demo households in production |

> **Critical:** copy `.env` into the office password manager **now**. Without
> `FIELD_ENCRYPTION_KEYS`, the encrypted fields and every uploaded file and report are
> unreadable. A database backup cannot recover them.

## 4. First start

```bash
docker compose build
docker compose run --rm migrate                 # database schema + protective triggers
docker compose run --rm tools db:seed           # categories, config tables, tax rules, advisor login
docker compose up -d                            # db, app, caddy
docker compose ps                               # app should become "healthy"
curl -fsS https://<DOMAIN>/api/health           # {"ok":true}
```

Then, in the browser:
1. Log in as the advisor. Enroll the authenticator app, and **print the recovery codes and keep
   them in the safe**.
2. Open *Configuration tables* and work through `docs/UNVERIFIED.md`:
   - verify the tax rules and fee benchmarks;
   - set `debt.expensive_threshold_ppm`;
   - set `privacy.retention_years` with your lawyer.
3. Generate one PDF report for a test client. This proves Chromium works in the image.

## 5. Backups (nightly, encrypted, off-site)

### 5.1 Encryption key — on the advisor's computer, not on the server
```bash
age-keygen -o ta-backup.age.key     # prints "Public key: age1…"
```
- The **private** key (`ta-backup.age.key`) goes into the password manager **and** onto a
  printed or USB copy in the safe. Never put it on the server.
- The **public** key (`age1…`) goes into `backup.env` as `AGE_RECIPIENT`. A stolen server
  therefore cannot decrypt any backup.

### 5.2 Storage bucket (S3-compatible)
1. Create a private bucket. AWS S3 in `il-central-1` is recommended; Backblaze B2 and Wasabi
   also work (set `S3_ENDPOINT`).
2. Add a **lifecycle rule: delete objects after 35 days.** This also bounds how long purged
   client data survives in backups (see §7).
3. Recommended: turn on **Object Lock / versioning** (ransomware cannot erase backups).
4. Create an access key limited to `s3:PutObject` and `s3:ListBucket` on this bucket only, with
   no delete permission.
5. Fill in the bucket and key details:
   ```bash
   cp backup.env.example backup.env && chmod 600 backup.env
   ```
   The app never receives these credentials; only the backup container does.

### 5.3 Schedule (host cron)
```bash
crontab -e
15 2 * * *  cd /opt/ta && docker compose run --rm backup /usr/local/bin/backup.sh >> /var/log/ta-backup.log 2>&1
45 3 * * *  cd /opt/ta && docker compose run --rm tools privacy:purge >> /var/log/ta-purge.log 2>&1
```
Check `/var/log/ta-backup.log` the next morning, and look at the bucket.

### 5.4 Monthly restore drill (a backup that was never restored is not a backup)

The drill restores the latest backup into a throwaway database on the same server, checks it,
then drops it. The private key is on the server only for the duration of the drill.

```bash
install -m 600 /dev/null /dev/shm/age.key && nano /dev/shm/age.key   # paste the private key (RAM only)
docker compose run --rm -v /dev/shm/age.key:/key/age.key:ro -e AGE_IDENTITY_FILE=/key/age.key \
  backup /usr/local/bin/restore-test.sh "postgresql://ta:<POSTGRES_PASSWORD>@db:5432/postgres"
shred -u /dev/shm/age.key
```
The expected result is `[drill] OK`. Record the date in the office's security log.

### 5.5 Disaster recovery (new server)
1. Repeat sections 1–3, using the **same `.env` from the password manager**.
2. Run `docker compose up -d db && docker compose run --rm migrate`.
3. Restore the newest backup set, using the same private-key-in-RAM steps as the drill:
   ```bash
   docker compose run --rm -v /dev/shm/age.key:/key/age.key:ro -e AGE_IDENTITY_FILE=/key/age.key \
     -v ta-platform_uploads:/restore backup /usr/local/bin/restore.sh latest \
     "postgresql://ta:<POSTGRES_PASSWORD>@db:5432/ta_platform" /restore/uploads
   ```
4. Run `docker compose up -d`, log in and check a few clients and one report.

## 6. Updates

```bash
cd /opt/ta && git fetch --tags && git checkout <new tag>
docker compose run --rm backup /usr/local/bin/backup.sh     # fresh backup first
docker compose build && docker compose run --rm migrate && docker compose up -d
```

- **Rollback:** check out the previous tag, then `docker compose build && docker compose up -d`.
  Every migration so far only adds tables, columns and enum values, so the older code keeps working. If a release's notes say otherwise, restore
  the backup taken just before the update.
- **Dependency check:** run `npm audit --omit=dev` before each release (the production
  dependency tree had 0 known vulnerabilities at release time).

## 7. Privacy operations

- **Data-subject requests:** they appear on the advisor dashboard with a due date
  (`privacy.request_response_days`). Handling is described in `docs/PRIVACY.md`.
- **Deletion:** the advisor restricts the file immediately. The daily `privacy:purge` job then
  deletes the data once `privacy.retention_years` has passed.
  - The data is deleted from the database and file storage at once. Backup copies age out
    within the bucket lifecycle (35 days).
  - Say so in the privacy notice.
- **Dry run:** `docker compose run --rm tools privacy:purge -- --dry-run` shows what would be
  purged.

## 8. Keys and rotation

- **Field-encryption key rotation:**
  1. Append `,v2:<new key>` to `FIELD_ENCRYPTION_KEYS`. The last key encrypts new data; old
     keys still decrypt.
  2. Restart the app.
  3. Keep `v1` for as long as data written with it exists. There is no bulk re-encryption job yet.
- **Database password:** change it in Postgres and `.env` together, then run
  `docker compose up -d`.
- **If the advisor loses their phone:**
  1. Log in with a recovery code.
  2. If no codes are left, clear the second factor in the database
     (`UPDATE users SET "totpEnabledAt" = NULL, "totpSecretEnc" = NULL, "totpLastCounter" = NULL WHERE email = '…'`).
  3. Log in again and re-enroll. This is logged in the audit log.

## 9. Monitoring

- **Uptime:** an external uptime check on `https://<DOMAIN>/api/health`, every 5 minutes, with
  alerts by e-mail or SMS.
- **Logs:** `docker compose logs --since 24h app caddy`. Caddy's JSON access log contains client
  IPs; keep it for no more than 30 days (Docker's `json-file` log rotation, or journald).
- **Disk:** alert when the disk is above 80% full (`df -h`). Uploads grow with each client.
