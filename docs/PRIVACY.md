# Privacy — Amendment 13 readiness

> **Not legal advice.** This document maps what the software does to the obligations commonly
> described for Amendment 13 to the Privacy Protection Law (in force since 14 August 2025).
> The legal requirements below come from secondary sources: law-firm notes and summaries.
> They must be confirmed by the office's legal counsel. Open items are tracked in
> `docs/UNVERIFIED.md` (items 5, 6, 29–32).

## What the system does (technical measures)

| Area | Implemented | Where |
|---|---|---|
| **Data minimization** | Account and card numbers: last 4 digits only (DB constraint). No bank credentials, ever. ID number: encrypted, blind index only | schema, `src/server/crypto` |
| **Encryption** | Fields AES-256-GCM with a key ring; uploaded files and PDF reports encrypted at rest; TLS in transit (Caddy, HSTS); backups encrypted with `age` to a key held off the server | `docs/ARCHITECTURE.md` §4, `docs/DEPLOYMENT.md` §5 |
| **Access control** | Single advisor with **mandatory 2FA**. Clients see their own household only, and only advisor-approved outputs. Clients are prompted to enable 2FA | `src/server/auth/dal.ts` + static tests |
| **Audit trail** | Append-only (DB trigger). Views and changes of household data are logged. Free text (notes, titles) is never copied into the log | `audit_log` |
| **Consent** | Recorded per type, version and method; revocable | `consents` |
| **Right of access** | Client: *My data → Download* (ZIP: data.json, transactions.csv, original files, released reports). Advisor: full export, including internal notes and audit entries | `/portal/privacy`, `/advisor/privacy/[id]` |
| **Correction / deletion requests** | Client submits in the portal; the advisor logs phone or letter requests. Each request has a due date (`privacy.request_response_days`) and appears on the dashboard; overdue requests show red. The resolution is recorded | `privacy_requests` |
| **Deletion** | **Restrict → purge.** Restriction is immediate: no access for anyone, no processing, client logins disabled and signed out. After `privacy.retention_years` the household is purged: every row, the immutable snapshots (purge-only trigger bypass), and all stored files. The audit keeps only ids and counts | `src/server/privacy/service.ts`, `npm run privacy:purge` |
| **Backups** | Purged data disappears from backups when the 35-day bucket lifecycle expires | `docs/DEPLOYMENT.md` §5.2 |
| **Security headers** | Strict CSP (per-request nonce), framing denied, nosniff, no referrer leaks, no third-party scripts or fonts | `src/proxy.ts`, `next.config.ts` |

## What the office must do (organizational measures)

| # | Obligation (to verify with counsel) | Notes |
|---|---|---|
| 1 | **Privacy notice** to clients, covering what is collected, why, for how long, who processes it and their rights | Must mention: the cloud host and region, the backup provider, the 35-day backup window, and the retention period |
| 2 | **Consent text**: final legal wording | The current version label is `2026-01-draft` (UNVERIFIED item 6) |
| 3 | **Retention period** for advice records | `privacy.retention_years` is **empty**, so no data can be purged until it is set |
| 4 | **Database registration / notification** duties after Amendment 13 | Sources differ on the post-amendment thresholds |
| 5 | **Privacy Protection Officer (DPO)**: whether one is required for this office | Depends on size and activity thresholds |
| 6 | **Information Security Regulations (2017)**: the security level of this database, with a written security procedure, an asset map and periodic reviews | Financial data about clients points to at least a medium level; confirm |
| 7 | **Breach procedure**: who decides, who notifies the Privacy Protection Authority and the affected people, and the deadline | Secondary sources mention 72 hours; confirm |
| 8 | **Processor agreements** with the cloud host and the backup storage provider | Data-processing terms and the data location |
| 9 | **Response deadline** for access requests | `privacy.request_response_days` = 30, unconfirmed |

## Handling a request (advisor runbook)

1. **Access request:**
   - The client can download everything themselves under *My data*.
   - If they ask by phone or letter, log the request, then use *Export* on the privacy page and
     send the ZIP securely. Never send it by plain e-mail; use an encrypted link or hand it over
     in person.
   - Close the request with what was sent.
2. **Correction:** fix the data in the client file, then close the request with what changed.
3. **Deletion:**
   1. Restrict the file (type the household name to confirm). This happens immediately.
   2. Close the request, explaining the retention period to the client.
   3. The daily job purges the file when the retention period ends. If a restriction was a
      mistake, *Lift restriction* restores access; it is logged.
4. **Refusal:** close the request as *Rejected* with the legal reason.

## Sources consulted (secondary — verify)

- [Goldfarb Gross Seligman — Amendment 13](https://www.goldfarb.com/amendment-13-to-the-israeli-privacy-protection-law/)
- [Herzog Fox & Neeman — client note](https://herzoglaw.co.il/en/?p=62239)
- [Israel Tech Policy Institute — overview](https://techpolicy.org.il/?p=5612)
- [Kol Zchut — pension advisor confidentiality](https://www.kolzchut.org.il/he/חובת_סודיות_של_יועץ_פנסיוני)
