# T.A Mortgages — Financial Management & Investment Platform

Advisor workspace + client portal for household finances: monthly close, improvement tracking, fee reduction, and a prioritized savings & investment plan. Hebrew and Arabic, full RTL.

> **Status: 1.0.0 — all phases complete** (Phase 5: security hardening, privacy rights, deployment). Before going live, work through `docs/UNVERIFIED.md` and `docs/PRIVACY.md` with the advisor and legal counsel — see `CHANGELOG.md`. All figures in the UI are labeled *analysis for advisor review*. Tax and fee tables are intentionally empty until they are verified (`docs/UNVERIFIED.md`).

## Quick start (local)

Requires Node 22+ and PostgreSQL 16. PDF reports need Chromium (Playwright's, or set `CHROMIUM_PATH`; the Docker image includes it).

```bash
cp .env.example .env            # fill DATABASE_URL and generate the two keys (see comments)
npm install                     # also runs prisma generate
npm run db:migrate              # apply migrations (includes DB triggers)
npm run db:seed                 # reference data + fictional demo households; prints passwords once
npm run dev                     # http://localhost:3000
```

On first advisor login you must enroll an authenticator app (2FA is mandatory for the advisor). Save the recovery codes.

Demo logins (fictional): `advisor@example.test`, and the clients `samer.demo@example.test` (Arabic UI) and `wael.demo@example.test` (Hebrew UI). Passwords are printed by the seed, or set them with `SEED_*` variables.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest unit tests (all calculation logic) |
| `npm run test:e2e` | Playwright on desktop + mobile against `ta_platform_test` (reset and seeded automatically; refuses any DB without `_test` in its name) |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Prisma |
| `npm run privacy:purge` (`-- --dry-run`) | Purge restricted households whose retention period ended (daily cron in production) |

## Production

Docker Compose on one VM: Caddy (TLS) → app → PostgreSQL, nightly encrypted backups, daily privacy purge. Follow **`docs/DEPLOYMENT.md`** step by step.

## Non-negotiable conventions

- Money is `bigint` **agorot**. Rates are integer **ppm**. Never `number` for money, never floats.
- No tax rate, fee benchmark or threshold in code. They go in `tax_rules`, `fee_benchmarks` or `advisory_parameters` with an effective date and a source.
- Every calculation is a pure function in `src/lib/**` with unit tests reproducing a documented example.
- Every data access goes through `src/server/auth/dal.ts`.
- No UI text in code: `messages/he.json` and `messages/ar.json` (keys must match).
- Only fictional demo data. Never commit real client data or `.env`.

## Trying the import

Two fictional statement files live in `tests/fixtures/` (a bank CSV with title rows and a card XLSX with installments and a USD purchase). Create a client, add a bank account and a credit card, upload a file under *Accounts & import*, and follow the wizard. Regenerate them with `npx tsx tests/fixtures/generate-fixtures.ts`.

## Docs

- `docs/ARCHITECTURE.md` — design, security model, folder structure
- `docs/ERD.md` — data model and planned entities per phase
- `docs/DEPLOYMENT.md` — installation, backups and restore drill, updates, keys, monitoring
- `docs/PRIVACY.md` — Amendment 13 readiness: technical measures, office obligations, request runbook
- `docs/UNVERIFIED.md` — what is not verified yet and who owns it
- `docs/calculations/fee-simulator.md` — simulator method and reference examples
- `docs/calculations/tax-examples.md` — tax calculators: method and documented examples
- `docs/calculations/investments.md` — investment modules: method and documented examples
- `docs/calculations/debt-plan.md` — mortgage, debt, action plan and PDF reports
- `docs/screenshots/` — screens per phase (`p1-*` … `p5-*`, including sample PDFs)
