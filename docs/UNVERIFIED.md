# Unverified items (must be checked before relying on them)

Updated: Phase 2.

| # | Item | Where | Status | Owner / when |
|---|---|---|---|---|
| 1 | All tax rates, brackets, thresholds (purchase tax, betterment tax, capital gains, surtax, money-market tax, rental routes, income-tax brackets, provident/pension exemptions, CPI series) | `tax_rules` | **MISSING** placeholders. No values are seeded. Calculators will refuse to run. | Researched against Israel Tax Authority / CBS sources and entered with `sourceUrl` in Phase 3 |
| 2 | Management fee legal ceilings and market benchmarks per product | `fee_benchmarks` | **Seeded UNVERIFIED from secondary public sources** (URL + notes per row): pension 6%/0.5%, provident & managers' insurance 4%/1.05%, benchmarks from the 2024 default-fund tender and 2024 industry average. Study-fund ceiling and general-pension rows **empty** (conflicting / not researched). Investment provident fund ceiling assumed equal to provident fund | Advisor verifies each row on the configuration screen (source URL required) |
| 3 | Advisory defaults | `advisory_parameters` | Emergency fund 3–6 months, grace days 10 and trend threshold 1% **confirmed by the advisor (2026-11-14)**. Health-score weights/targets, recurring-detection and highlight thresholds: **awaiting confirmation** on the configuration screen | Advisor |
| 4 | "Expensive debt" interest threshold | `advisory_parameters` | Empty, advisor to set | Advisor |
| 5 | Privacy Protection Law, Amendment 13 obligations (database registration/notice duties, security regulations level, breach reporting, DPO need, retention) | Process + Phase 5 | Architecture supports consent, audit, export, purge, minimization. **Legal requirements not verified** | Advisor's legal counsel. Implementation in Phase 5 |
| 6 | Consent text (`textVersion` "2026-01-draft") | `consents` | Placeholder version label. No legal text written yet | Legal counsel |
| 7 | Bank/card export formats (Leumi, Hapoalim, Discount, Mizrahi-Tefahot, Isracard, Cal, Max) | `src/lib/import/presets.ts` | Presets are **unverified** (shown as such in the wizard). Header auto-detection + manual wizard handle any layout; tested only on fictional fixtures | Advisor to supply anonymized samples → presets get locked + tested |
| 8 | Brand colors and logo | `globals.css` tokens | Placeholder navy/gold | Advisor to supply brand kit |
| 9 | Legacy binary `.xls` (pre-2007) | Import | **Not supported** by design (the available parser has open CVEs). The user is told to re-save as XLSX/CSV. HTML-disguised `.xls` (common bank export) is supported | Revisit if real samples show binary XLS is common |
| 10 | Card month attribution | Month close | Card lines count in the month of their **charge (billing) date**, i.e. when money leaves the bank. This matches cash flow but shifts card purchases by one month vs purchase date | Advisor to confirm the convention |
| 11 | Health score | Overview | Emergency-fund and debt-load components are pending (Phases 2 and 4); the score uses the available components only and says so on screen | Phase 2/4 |
| 12 | Retirement defaults | `retirement.defaults` | Real returns 2% / 3.5% / 5% approved in principle (2026-11-14). Retirement age 67 and annuity factor 200 are placeholders: the legal retirement age depends on sex and birth year, and annuity factors differ by fund and member | Advisor sets per household |
| 13 | Pension clearinghouse report ("מסלקה פנסיונית") | Product import | Parser **not built** — needs a real anonymized file. Our Excel template is the interim import path; the parser registry is ready | Advisor to supply a sample |
| 14 | Card fee / credit-plan detection | Cards view | Keyword-based (עמלה, ריבית, דמי כרטיס, קרדיט, פריסה…). May miss issuer-specific wording | Refine with real statements |
| 15 | Cash-flow calendar | Cash flow | Recurring item = same merchant in ≥ 2 of the last 3 months, median day and amount; irregular income is summed per month on its first day | Advisor to review on real clients |
