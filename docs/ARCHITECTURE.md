# Architecture — T.A Mortgages Financial Platform

Status: **Phase 3a** (tax engine and calculators). This document is the contract for every later phase.

## 1. Product shape

- **One advisor** (the T.A Mortgages office), **many client households**. Single advisor was chosen on purpose: no multi-office SaaS layer. If an assistant account is needed later, it is a new role, not a tenancy change.
- **Advisor workspace** (`/advisor/*`): all households, configuration tables, (later) imports, month close, plans, reports.
- **Client portal** (`/portal`): one household's own data. v1 scope: view status, upload statements (advisor approves the import), mark tasks as done. Clients never see unapproved recommendations.

## 2. Stack and why

| Concern | Choice | Reason |
|---|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript strict (+`noUncheckedIndexedAccess`) | As specified. |
| Caching | `cacheComponents` **off**, all routes dynamic | Every screen is private financial data. No shared server cache = no "client A sees client B's cached page" risk. |
| UI | Tailwind v4 + shadcn-style components in `src/components/ui` | shadcn is copy-in code; `components.json` is present so `npx shadcn add` works. |
| DB | PostgreSQL 16 + Prisma 7 (driver adapter `@prisma/adapter-pg`) | As specified. |
| Money | `BigInt` agorot in the DB, `bigint` in TS (`src/lib/money.ts`) | Postgres `INTEGER` would overflow at ₪21.4M (pension/real-estate totals). No floats anywhere in money math. |
| Rates | Integer **ppm** (1% = 10,000) | Exact integer math for fees/tax rates; 0.0001% resolution. |
| Auth | Custom: Argon2id + DB sessions + RFC 6238 TOTP | Small, auditable code; DB sessions can be revoked instantly; no 3rd-party identity provider holding client data. |
| i18n | `next-intl`, locale per **user** (cookie mirrors `User.locale`), no locale in URL | Advisor and client can share the same link even when they use different languages. Both languages are RTL. |
| Fonts | Self-hosted Noto Sans Hebrew/Arabic (`@fontsource`) | No calls to Google at runtime (privacy); the same TTFs are reused for PDF in Phase 4. |
| Tests | Vitest (all calculation logic), Playwright (flows, desktop + mobile) | As specified. |
| Deploy | Docker Compose on a VPS/cloud VM (Israel region recommended) | Chosen by the advisor: full control over data location and backups. |

## 3. Folder structure

```
prisma/
  schema.prisma            data model (conventions in header)
  migrations/              SQL migrations incl. DB triggers
  seed/                    categories, merchant rules, config placeholders, fictional demo data
messages/he.json, ar.json  all UI strings (no UI text in code)
src/
  app/
    (auth)/login/...       login, 2FA verify, 2FA enrollment (server actions in actions.ts)
    (app)/advisor/...      advisor workspace
    (app)/portal/          client portal
    (app)/account/         language, 2FA status
    api/health/            liveness for Docker
  components/ui/           primitives (Button, Card, Table, Badge, Input)
  components/app/          app-level components (shell, status badge)
  i18n/                    locale config + next-intl request config
  lib/                     PURE code, safe for client & tests
    money.ts               agorot / ppm math, parsing, formatting
    config/effective.ts    "rule valid on date X" selection
    domain/                pure business rules (period, household status, …)
  server/                  server-only code
    env.ts                 validated environment (app refuses to boot on bad config)
    db.ts                  Prisma singleton
    auth/                  password, TOTP, sessions, DAL (authorization), guards
    crypto/                field-level encryption + blind index
    config/                readers for advisory parameters (tax rules in Phase 3)
    audit.ts               append-only audit trail
    households.ts          household data access (always through the DAL)
  proxy.ts                 optimistic redirect to /login (NOT authorization)
tests/unit, tests/e2e
docs/                      this file, ERD, unverified list, screenshots
```

Rule: anything that calculates money lives in `src/lib/**` as a pure function with unit tests. Server code only loads data, calls the pure function, and records which config versions were used.

## 4. Security model

- **Authorization lives in one place**: `src/server/auth/dal.ts` (`requireAdvisor`, `requireClient`, `assertHouseholdAccess`). Every page, server action and route handler calls it first. `proxy.ts` is only a convenience redirect.
- **Sessions**: random 256-bit token in an `httpOnly`, `SameSite=Lax`, `Secure` (prod) cookie; only its SHA-256 is stored. Idle timeout (default 30 min) and absolute lifetime (12 h) are enforced on the server. A new session is issued on every login (no fixation); the token is rotated again after 2FA verification.
- **2FA**: mandatory for the advisor (cannot reach any page until enrolled), optional for clients. TOTP secrets are encrypted at rest with the user id as associated data; replayed codes are rejected (`totpLastCounter`); 8 single-use recovery codes, stored hashed.
- **Brute force**: generic error messages, equal timing for unknown e-mails, per-IP and per-e-mail rate limits, account lockout after 5 failures for 15 min, all logged.
- **Field-level encryption**: AES-256-GCM with a key ring (`v1:…,v2:…`) for rotation; HMAC blind index for exact lookups (e.g. national ID). Account and card numbers: **last 4 digits only** (DB `CHECK` constraint). Bank credentials are never collected.
- **Audit log**: append-only, enforced by a DB trigger. No foreign keys, so it survives user/household deletion. Views of household data are logged as well as changes.
- **Immutable month close**: `monthly_snapshots` rejects `UPDATE`; re-closing a month writes a new version. `DELETE` is only possible inside the privacy-purge transaction (`SET LOCAL app.allow_snapshot_purge='on'`), used for data deletion requests.
- **Headers**: frame-deny, nosniff, strict referrer, permissions policy. HSTS and TLS are handled by the reverse proxy.

## 5. "No hardcoded rates" mechanism

Three versioned tables, each row with `effectiveFrom/effectiveTo`, source and verification state:

- `tax_rules`: `ruleKey`, `jurisdiction`, `parameters` (JSON, schema per key validated in code), `sourceUrl`, `lastVerifiedBy/At`, `status` (VERIFIED / UNVERIFIED / MISSING).
- `fee_benchmarks`: per product type and fee base (deposits / accumulation); benchmark and legal ceiling in ppm.
- `advisory_parameters`: professional policy that is not law (emergency-fund months, grace days, health-score weights…).

Calculations always call `selectEffective(rows, eventDate)`. It refuses overlapping rows instead of guessing. Calculators will **refuse to run** on a MISSING rule, and show a warning on an UNVERIFIED one. Every result screen shows the rule version used.

## 6. Import architecture (implemented in Phase 1)

```
FileUpload ─▶ Adapter (file:csv | file:xlsx | later openbanking:<provider>)
          ─▶ RawRow[] ─▶ Mapping (institution preset or saved custom mapping)
          ─▶ NormalizedTxn[] (date, agorot, description, installments…)
          ─▶ Dedup (dedupKey = hash(account, date, amount, normalized description, occurrence#))
          ─▶ Preview with errors (ImportBatch.status = PREVIEW) ─▶ Commit ─▶ Undo (delete batch rows)
```

The adapter interface (`ImportAdapter` in `src/lib/import/types.ts`) is `canHandle(file)` + `read(file) → RawTable[]`; file adapters live in `src/server/import/adapters.ts`. Uploaded files are stored encrypted (`src/server/storage.ts`). Open-banking providers plug in as another adapter without touching mapping, dedup or categorization.

## 6a. Month-close rules (documented in code and tests)

- A transaction belongs to the month of its **charge date** when present (cards), else its date.
- Transfers (card payment from the bank, savings transfer, own-account transfer) are excluded; card spending is counted from card lines.
- Refunds reduce their category. Uncategorized lines are counted and block nothing, but raise a warning.
- Closing writes an immutable snapshot (new version on re-close) with the full breakdown, calc version and a hash of the transactions used. If the data later changes, the screen says so.
- The client portal shows **closed months only**, never live unreviewed numbers.

## 6b. Long-term savings (Phase 2)

- Fee benchmarks and ceilings come only from `fee_benchmarks` (dated, sourced, verification state); `src/lib/savings/fee-flags.ts` compares, `fee-simulator.ts` projects (method: `docs/calculations/fee-simulator.md`).
- Savings potential = extra balance at retirement if fees drop to the benchmark, base scenario, today's shekels.
- Product reports enter through `ProductReportParser` (`src/server/savings/report-parsers.ts`); the clearinghouse XML parser plugs in there.
- The client portal shows balances only; fee analysis and projections stay advisor-side until the action-plan approval flow (Phase 4).

## 6c. Tax engine (Phase 3a)

- `src/lib/tax/rules.ts`: a zod schema per rule key; `resolveRule(rows, key, transactionDate)` returns the parameters and the exact row used, or throws `RuleUnavailableError` (NOT_FOUND / MISSING / INVALID). There is no default value anywhere.
- Calculators are pure functions returning `{ rulesUsed, steps, result, warnings, version }`; the UI renders all of it, and a saved run stores all of it (`calculation_runs`).
- CPI lives in `cpi_values` (×1000, one base enforced); `knownIndexPeriod` implements the known-index convention.
- Calculator pages are GET forms (shareable URLs); saving to a client file re-computes on the server.

## 7. Deployment (summary; the full guide comes in Phase 5)

`docker compose` runs `db` and `app`. The app binds to `127.0.0.1` only; a TLS reverse proxy (Caddy/Nginx) in front sets HSTS. Postgres runs on an encrypted volume with nightly encrypted `pg_dump` off-site and a tested restore. Secrets come from `.env` on the host (or a secret manager), never from the image.
