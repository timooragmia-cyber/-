# Changelog

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
