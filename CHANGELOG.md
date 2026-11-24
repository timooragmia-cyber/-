# Changelog

## [1.1.2] — Login fixes (2026-11-24)

### Fixed
- **A password of 10–11 characters locked the user out.** The setup window accepted 10+, but the seed silently replaced any explicit password shorter than 12 with a random one. An explicit password is now used as is, or the seed fails loudly. The desktop setup always (re)sets the chosen password, even after an interrupted earlier attempt.
- **The e-mail field emptied after a failed login** (React 19 resets uncontrolled forms), so the next attempt failed for lack of an e-mail. The fields are now controlled.

### Added
- "Show password", and warnings when the password is typed in Hebrew letters or Caps Lock is on, in both the setup window and the login screen.
- The program test uses a 10-character password and checks that the e-mail is kept after a failed login.

## [1.1.1] — Windows installer fix (2026-11-18)

### Fixed
- **The installed program could not start ("Initial data setup failed").** electron-builder silently left the server's `node_modules` out of the installer. It is now copied in after packing, and the build fails if anything essential is missing.
- **A build machine's `.env` was copied into the packaged server by Next.** It is now removed during assembly, and packaging refuses to include one. The 1.1.0 installer contained development keys only, no real data.

### Changed
- CI now packages the program first and runs the full program test on the **packaged** program (what the user installs). It then builds the installer from that tested package.

## [1.1.0] — Windows desktop edition (2026-11-15)

The advisor runs the program on one Windows computer, with no internet and no client portal.
The web/server edition is unchanged and still supported.

### Added
- **Windows program** (`desktop/`, Electron): an installer (`TA-Mortgages-Setup-1.1.0.exe`) with a Hebrew UI, a desktop shortcut and a per-machine install.
  - The data lives in `%APPDATA%\T.A Mortgages` and is never removed by uninstall.
- **Private PostgreSQL 16** on 127.0.0.1, driven by `pg_ctl`/`initdb`: works under administrator accounts and shuts down cleanly (never a forced kill).
  - After a crash, the program reuses the database server that was left running.
- **Migrations** applied by the program itself (compatible with Prisma's table).
  - Before an update's migrations, a safety backup is taken automatically.
  - Reference data is refreshed per version.
- **First-run setup:** advisor e-mail and password, plus optional demo data.
- **Encrypted backups:** a consistent snapshot of all tables, the files and the keys, sealed with AES-256-GCM under a password (scrypt).
  - Automatic, daily and on exit, to a folder of the user's choice; the newest 30 are kept.
  - Restore from the program, with a safety copy of the current state first.
- **Secrets** are sealed with Windows DPAPI (Electron safeStorage).
- **PDF reports** are rendered with Electron's own Chromium (JavaScript off, network blocked).
- **Desktop-mode rules:**
  - Advisor 2FA is optional.
  - No client logins.
  - A backup screen, and a dashboard warning when backup is missing or stale.
  - Daily privacy purge at startup.
- **Tests:**
  - A core integration test on a real PostgreSQL: init, migrate, seed, backup, wipe, restore, then triggers and sequences checked.
  - A full program test (Electron): setup, login, PDF, backup, clean exit, restart, restore with wrong and right password. It passes with a read-only install folder.
  - A CI job runs both on a real Windows machine and builds the installer.
- `docs/WINDOWS-INSTALL.he.md`: install and daily-use guide in Hebrew.

### Fixed during build
- The setup window's close event quit the app after a successful setup.
- The moment with zero windows between the splash and the main window quit the app.
- The sandboxed preload crashed because of a bundler banner.
- The seed's console output (generated demo passwords) is no longer written to the log.

## [1.0.1] — Deployment rehearsal (2026-11-15)

The full production stack was built and run with Docker (Compose + Caddy). That rehearsal found
four defects that would have broken the first real deployment. All are fixed and covered by
tests or CI.

### Fixed
- **The image did not build:** `prisma generate` (postinstall) needs `DATABASE_URL`. The build now gets a placeholder that exists only during the build step and never in the image.
- **The build needed runtime secrets:** `next build` imported the DB client, which validated the secrets at import time. The client is now created on first use, so builds need no secrets.
- **The whole project was traced into the server output,** including `storage/` (encrypted client files) and `backup.env`. Font loading is now scoped, only the needed files are shipped, and `.dockerignore` excludes secret files.
- **Every client-file page returned 500 in the image:** `playwright-core` data files were not traced. The package is now shipped completely and loaded only when a PDF is generated. A crashed Chromium is restarted automatically.
- **Mix optimizer is 17× faster** (6.6s → 0.4s for a 25-year mortgage). Identical results, checked against the full calculation.

### Added
- `deploy/install.sh`: a single-command, idempotent installation on Ubuntu 24.04.
  - It installs Docker (official repository), log rotation, a firewall, secrets and the build.
  - It then runs the migrations, the production seed, HTTPS, the cron jobs and the verification.
- `deploy/verify.sh`: pass/fail check of the deployment.
  - It covers configuration, the containers, HTTPS and headers, and closed ports.
  - It renders a PDF inside the image, and checks the backups, cron, demo logins and the retention period.
- `docs/AWS-SETUP.he.md`: step-by-step AWS (Tel Aviv region) guide in Hebrew. It comes with the backup IAM policy (no delete permission) and the S3 lifecycle (`deploy/aws/`).
- Base images come from the AWS public mirror of the official images (no Docker Hub rate limits).
- CI (GitHub Actions) runs:
  - all tests, plus E2E against the standalone artifact;
  - `npm audit` on production dependencies;
  - Docker builds with a PDF render inside the image;
  - non-root and no-secrets checks on the image;
  - validation of the compose file and the shell scripts.
- `E2E_STANDALONE=1` runs E2E against `.next/standalone/server.js`, the way Docker runs it.

## [1.0.0] — Phase 5: Security hardening, privacy rights, deployment (2026-11-14)

### Added
- **Privacy (Amendment 13 readiness)**:
  - **Right of access**: data export as a ZIP (`data.json`, `transactions.csv` with formula-injection protection, the original uploaded files and the reports). The client gets their own data from *My data*; the advisor gets a full export including internal notes and audit entries.
  - **Data-subject requests** (access, correction, deletion): due dates, dashboard tracking with overdue items flagged, and a recorded resolution.
  - **Restrict → purge**: restriction is immediate (no access or processing, client logins disabled and signed out, "lift restriction" possible). After the configured retention period the household is purged, including the immutable snapshots and all stored files. The audit log keeps ids and counts only. Purge runs from a daily job (`npm run privacy:purge`, `--dry-run`) or from the advisor's button once due.
- **Security**:
  - Strict Content-Security-Policy with a per-request nonce; no third-party origins.
  - The household guard also enforces the privacy restriction, and every client-file page checks it itself.
  - Static tests fail the build if a page, route or server action skips authorization, or if a guard is not awaited.
  - Free text is no longer copied into the audit log.
  - Production refuses a non-HTTPS `APP_URL`.
  - Export and request rate limits.
- **Client 2FA prompt** on the portal and the account page.
- **Deployment**:
  - Caddy (automatic TLS, HSTS, request size limit) as the only public entry.
  - `tools` and `backup` services.
  - Nightly backups encrypted with `age` to an off-server key, uploaded to S3-compatible storage.
  - Restore script and a monthly restore drill.
  - `docs/DEPLOYMENT.md` and `docs/PRIVACY.md`.
- Tests: 247 unit tests and 32 E2E (desktop and mobile), including headers/CSP, export contents, restriction lockout, lift, and purge with file deletion.

### Fixed during build
- A server action returned a translation key that did not exist; a new test checks every returned message key.
- `docker compose` could not derive a project name from the repository folder; the name is now set explicitly.

## [0.6.0] — Phase 4: Mortgage & debt, action plan, PDF reports (2026-11-14)

### Added
- **Mortgages**: tracks (prime, fixed unlinked/linked, variable-5 unlinked/linked), Spitzer or equal principal, CPI indexation, prime and reset changes; three scenarios (base / stress / falling) with first and maximum payment, total interest and indexation, yearly schedule.
- **Refinance / early-repayment simulator** (monthly change, total saving after fee and opening costs, break-even month) and **mix optimizer** (cheapest / safest / balanced under the configured mix constraints).
- **Debts**: loans and overdrafts (derived from bank accounts) ranked by interest, yearly interest cost, "expensive" flag against the advisor's threshold, **consolidation simulator**.
- **Action-plan engine** with a fixed conservative order (emergency fund → expensive debt → fees → subscriptions → bank fees → automate savings → invest surplus), monthly and lifetime impact; advisor approval, reorder, title and note; regeneration keeps the advisor's decisions.
- **Client portal**: approved actions only, with "started" / "done"; released reports.
- **PDF reports** (monthly and full review) in Hebrew or Arabic, rendered server-side with embedded fonts, stored encrypted, released to the client explicitly.
- Advisor parameters: Bank of Israel rate/prime spread, mix constraints, scenarios, plan parameters (all dated, sourced, awaiting confirmation).
- Demo: Halabi mortgage (3 tracks), Osman car + consumer loans, Khatib loan.
- Tests: 233 unit tests (examples in `docs/calculations/debt-plan.md`); Phase 4 E2E (simulators, threshold via config, plan approval, client visibility, PDF generate/release/download, 404 for unreleased).

### Fixed during build
- An explicit report language was ignored (translations followed the viewer's cookie), so an Arabic PDF came out with Hebrew labels.
- Amounts after a label rendered in the wrong order in RTL (the LTR isolation wrapped the label too) on the plan, configuration and calculations screens.
- Successful logins and 2FA counted toward the rate limit; now only consecutive failures are throttled (IP limit unchanged).
- Missing PDF fonts now fail loudly instead of producing an unreadable report.

## [0.5.0] — Phase 3b: Investments and route comparison (2026-11-14)

### Added
- **Real estate**: properties with gross/net yield, equity, cash on equity, appreciation scenarios, and exit scenarios (today and at the horizon) through the betterment-tax calculator, selling costs and mortgage payoff.
- **Securities portfolio**: accounts, holdings, transactions (deposit, withdrawal, buy, sell, dividend, interest, fees by kind, tax), monthly valuations; average-cost basis, realized/unrealized gains, unrealized-tax estimate, fees paid, allocation vs target with drift, time-weighted (chained Modified Dietz) and money-weighted (IRR, exact fixed-point) returns.
- **Deposits & money-market funds**: net and real annual yield after fee and tax, liquidity.
- **Route comparison** for an amount and horizon: after fees, after tax (tax rules), nominal and real annualized return, risk, liquidity, fit to the client's risk tolerance — preceded by the conservative-order checklist (emergency fund → expensive debt → fees → risk assessed) with the emergency-fund gap amount.
- Investment assumptions and route definitions as advisor-owned, versioned parameters (unconfirmed, labeled as assumptions).
- Emergency fund now counts money-market funds and deposits maturing within 90 days.
- Demo: Halabi home with rental unit, brokerage portfolio, money-market fund; Khatib deposit.
- Tests: 214 unit tests (investment examples documented in `docs/calculations/investments.md`) and Phase 3b E2E.

### Fixed during build
- IRR bisection lower bound underflowed on long horizons.
- Exit scenarios beyond a rule's validity failed entirely; now today's exit is computed independently and future exits explicitly assume today's rules continue.

## [0.4.0] — Phase 3a: Tax engine and calculators (2026-11-14)

### Added
- **Tax rules engine**: per-rule parameter schemas, rule selection by transaction date, refusal on MISSING / expired / malformed rules (no fallback numbers anywhere).
- **Calculators** (each shows inputs, rule versions with status and source, step-by-step breakdown, result, warnings and a "verify current rates" note):
  purchase tax (single / additional / new immigrant / disabled), betterment tax (regular linear, linear-beneficial, single-residence exemption incl. above-ceiling share, pre-2001 period with advisor rate, inheritance/gift flags),
  capital gains (CPI / FX / nominal, substantial shareholder, loss offset and carry-forward, dividends, interest, surtax), money-market fund vs deposit, rental income routes (exempt / 10% / regular, cheapest highlighted), qualifying-pension tax, study-fund liquidity and tax.
- **CPI table** with import from a CBS file (Hebrew month names, several period formats, single-base guard) and manual entry.
- **Saved calculations** per client (inputs, rules used, steps, result) with one-click reopen.
- **Tax-rule editing** on the configuration screen: JSON parameters validated against the rule schema; verification requires a source URL; verified rules are versioned.
- 16 tax rules researched from public sources and seeded UNVERIFIED with source and notes; 2 left MISSING on purpose (disabled-buyer purchase tax, pension-deposit credit).
- Documented hand-calculated examples (`docs/calculations/tax-examples.md`), each reproduced by a unit test and by an independent exact-fraction oracle. 199 unit tests; Phase 3a E2E.

### Fixed during build
- Translation keys containing dots and heading/group key collisions in the tax messages; a new test now checks that every literal translation key used in the UI resolves to a string.

## [0.3.0] — Phase 2: Accounts, cards, long-term savings, fee simulator (2026-11-14)

### Added
- **Bank accounts**: balance history, overdraft limit and rate, monthly fee; interest vs fees paid per month (from categorized lines); overdraft usage.
- **Credit cards**: per billing cycle — total, category and merchant breakdown, installments, credit-plan charges, fees/interest, credit-limit usage ("what comes out of each card and on what").
- **Cash-flow calendar**: recurring bank in/outflows by day of month (last N months), variable spending spread evenly, day-by-day projected balance with first negative / beyond-overdraft day and lowest point.
- **Net worth** month by month (accounts + long-term savings; loans join in Phase 4). Emergency-fund months now feed the health score.
- **Long-term savings**: pension, managers' insurance, provident, investment provident and study funds — provider, track, balance + history, employee/employer/severance deposits, fees from deposits and accumulation.
- **Fee flags** vs configurable, dated benchmark and legal-ceiling tables; **savings potential** per product and household (gain at retirement, fees saved, per year).
- **Fee-savings simulator** (interactive, exact integer engine, same code on server and client) with a documented method and an independent decimal oracle (`docs/calculations/fee-simulator.md`).
- **Retirement projection**: conservative / base / optimistic real returns, deposit growth, annuity factor — advisor-editable per household, defaults in configuration.
- **Product import**: our Excel template (download, fill, import; all-or-nothing with per-field errors) through a pluggable parser registry ready for the pension-clearinghouse file.
- **Configuration**: the advisor edits fee benchmarks / ceilings and marks them verified (source URL required); verified rows are versioned, never edited in place.
- Client portal: own savings balances (fee analysis stays advisor-side).
- Tests: 149 unit tests (+ simulator oracle, fee flags, retirement, cash flow, cards, net worth, template parser) and Phase 2 E2E.

### Researched (unverified, sources recorded per row)
- Pension ceilings 6% / 0.5%; provident & managers' insurance 4% / 1.05%; default-fund terms 1% / 0.22%; 2024 industry average 1.57% / 0.15%. Study-fund ceiling left empty (conflicting sources).

### Fixed during build
- Forms lost the user's input after a validation error (React 19 resets forms after every action). `ActionForm` now keeps inputs on error and resets only on success.

## [0.2.0] — Phase 1: Clients, import, categorization, monthly close (2026-11-14)

### Added
- **Clients**: new-client flow (with consent), profile editing (members, income sources, goals, advisor-assigned risk), consent record/revoke, client portal logins with one-time temporary password and forced change.
- **Accounts**: bank/card/cash accounts (last 4 digits only).
- **Import pipeline**: encrypted file storage (AES-256-GCM at rest); adapters for CSV (UTF-8 / Windows-1255), XLSX, and HTML-disguised-as-XLS; header auto-detection (Hebrew/Arabic/English); institution presets (unverified); mapping wizard with raw-row preview, remembered per source; preview with row errors and duplicates before commit; deterministic duplicate detection; full undo per batch. Open-banking-ready `ImportAdapter` interface.
- **Categorization**: rules engine with Hebrew/Arabic merchant dictionary, tiered precedence (household learned → household advisor → global advisor → system), learning from the advisor's corrections ("apply to similar").
- **Monthly close**: income, expenses by category and by nature (fixed/variable/discretionary), surplus, savings rate, fixed/discretionary ratios, budget vs actual, transfer exclusion (no double counting of card payments), warnings; immutable versioned snapshots with drift detection ("data changed since close").
- **Tracking**: 3/6/12-month trend charts (validated palette, no dual axis, table view), deficit-month counts, month-over-month highlights, transparent health score (shows which components are still pending), recurring charges and forgotten-subscription flags, installment burden.
- **Advisor**: notes and tasks per month; dashboard shows pending client uploads; advisory parameters editable with history and confirmation.
- **Client portal**: closed-month headline, where the money went, highlights, trend, tasks (start/done), statement upload.
- Demo seed rebuilt from generated fictional transactions, categorized and closed by the real code.
- Tests: 127 unit tests (import, adapters, fixtures pipeline, categorization, month close with a documented hand-calculated example, recurring, highlights, health score, i18n catalog parity) and E2E covering the Phase 1 definition of done.

### Fixed during build
- Currency detection picked the billing currency instead of the original transaction currency (caught by fixture test).
- Bare "3/12" in free text was read as an installment; now only trusted in an installment column (dates like "05/10" are common in descriptions).
- Weekly shopping with a stable monthly total was flagged as a recurring charge.

### Security
- `zod` upgraded (memory-exhaustion advisory); `uuid` overridden to a patched version; `npm audit` clean for production dependencies.

## [0.1.0] — Phase 0: Foundation (2026-11-14)

### Added
- Architecture document, ER diagram, unverified-items register (`docs/`).
- Next.js 16 + TypeScript strict skeleton, Tailwind v4, shadcn-style UI primitives.
- Prisma 7 schema for Phase 0–1: households, members, income, goals, consents, accounts, uploads, import batches/mappings, transactions, categories, rules, budgets, monthly snapshots, notes, action items, audit log, and versioned config tables (`tax_rules`, `fee_benchmarks`, `advisory_parameters`).
- DB triggers: immutable monthly snapshots, append-only audit log. CHECK constraints: last-4 digits only, ppm ranges.
- Money library: bigint agorot, ppm rates, explicit rounding modes, float-free parsing of statement amounts, he/ar formatting.
- Auth: Argon2id passwords, DB sessions with idle/absolute timeout, mandatory TOTP 2FA for the advisor (RFC 6238, replay-protected, recovery codes), lockout and rate limiting, ADVISOR/CLIENT roles, central DAL authorization.
- Field-level encryption (AES-256-GCM key ring with rotation) and HMAC blind index.
- i18n: Hebrew (default) and Arabic, full RTL, per-user language switch, self-hosted fonts.
- Advisor dashboard with traffic-light status, missing-update flag and trend. Client profile view. Configuration tables view with verification badges.
- Client portal: monthly status headline and tasks.
- Seed: 25 categories (he/ar), merchant dictionary, MISSING tax/fee placeholders, advisory defaults, 4 fictional households.
- Tests: 67 Vitest unit tests (money, TOTP RFC vectors, encryption, status, effective dates, tenant guard). Playwright E2E for core flows on desktop + mobile.
- Dockerfile (standalone, non-root) and docker-compose.

### Fixed during build
- 2FA enrollment no longer skips the one-time recovery-codes screen (found by E2E).
