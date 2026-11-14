# Changelog

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
