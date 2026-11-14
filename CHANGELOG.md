# Changelog

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
