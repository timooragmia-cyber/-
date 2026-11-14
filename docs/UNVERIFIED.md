# Unverified items (must be checked before relying on them)

Updated: Phase 0.

| # | Item | Where | Status | Owner / when |
|---|---|---|---|---|
| 1 | All tax rates, brackets, thresholds (purchase tax, betterment tax, capital gains, surtax, money-market tax, rental routes, income-tax brackets, provident/pension exemptions, CPI series) | `tax_rules` | **MISSING** placeholders. No values are seeded. Calculators will refuse to run. | Researched against Israel Tax Authority / CBS sources and entered with `sourceUrl` in Phase 3 |
| 2 | Management fee legal ceilings and market benchmarks per product | `fee_benchmarks` | **MISSING**, to verify against current Capital Markets Authority regulation | Phase 2 |
| 3 | Advisory defaults: emergency fund 3–6 months, grace days 10, trend threshold 1%, health-score weights 30/25/25/20 | `advisory_parameters` | Defaults proposed by the system, **advisor must confirm** | Advisor, before Phase 1 demo |
| 4 | "Expensive debt" interest threshold | `advisory_parameters` | Empty, advisor to set | Advisor |
| 5 | Privacy Protection Law, Amendment 13 obligations (database registration/notice duties, security regulations level, breach reporting, DPO need, retention) | Process + Phase 5 | Architecture supports consent, audit, export, purge, minimization. **Legal requirements not verified** | Advisor's legal counsel. Implementation in Phase 5 |
| 6 | Consent text (`textVersion` "2026-01-draft") | `consents` | Placeholder version label. No legal text written yet | Legal counsel |
| 7 | Bank/card export formats (Leumi, Hapoalim, Discount, Mizrahi-Tefahot, Isracard, Cal, Max) | Phase 1 presets | Formats change. Presets need real (anonymized) sample files | Advisor to supply samples |
| 8 | Brand colors and logo | `globals.css` tokens | Placeholder navy/gold | Advisor to supply brand kit |
