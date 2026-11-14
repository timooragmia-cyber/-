# Mortgage, debt and action plan — method and documented examples

Code: `src/lib/debt/*`, `src/lib/plan/engine.ts` · Tests: `tests/unit/debt.test.ts`, `tests/unit/plan.test.ts`.
All money is integer agorot, rates ppm. Market inputs (Bank of Israel rate, prime spread, scenario
deltas, expected inflation, mix constraints) are **advisor parameters** in `advisory_parameters`
(`rates.bank_of_israel`, `mortgage.scenarios`, `mortgage.mix_constraints`, `plan.params`,
`debt.expensive_threshold_ppm`) — dated, sourced, editable, never hard-coded.

## Amortization (`amortization.ts`)
- **Spitzer** (annuity): payment = B·r ÷ (1 − (1+r)^−n), r = annual ÷ 12, exact fixed point.
  ₪1,000,000 · 4.75% · 360 months → **₪5,216.47**; ₪500,000 · 5% · 240 → **₪3,299.78**.
  The schedule closes to exactly 0; total paid = principal + interest (+ indexation).
- **Equal principal**: principal = B ÷ n each month, interest on the remaining balance.
- **CPI-linked tracks**: each month the balance is indexed by the scenario's monthly inflation
  (12th root of the annual rate, exact), then the payment is recomputed on the indexed balance;
  indexation is reported separately from interest.
- **Prime**: rate = Bank of Israel rate + spread + track margin; a scenario can move prime by Δ after N months.
- **Variable every 5 years**: the rate resets by the scenario's reset Δ at months 61, 121, …
  (or after `monthsToReset` for an existing loan).
- Three scenarios per mortgage: **base** (today's rates, base inflation), **stress** (prime +2%
  after 12 months, resets +2%, inflation 4%) and **falling** (−1% / −1% / 2%). These deltas are
  advisor assumptions awaiting confirmation, not forecasts.

## Strategies (`strategies.ts`)
- **Refinance / early repayment**: monthly change, total saving = (current total − proposed total
  − early-repayment fee − opening costs), break-even month = ⌈one-off costs ÷ monthly saving⌉.
  The early-repayment fee is **entered by the advisor from the bank's quote**. It is not computed
  (the official fee formula depends on the bank's average rates on the repayment date).
- **Mix optimizer**: every mix in 10% steps across the five track types that meets the configured
  constraints (≥ ⅓ fixed rate, ≤ ⅔ variable). Each mix is priced in all three scenarios:
  - *Cheapest*: lowest base-scenario total cost.
  - *Safest*: lowest maximum payment under stress.
  - *Balanced*: best average rank across the two lists.
- **Debt ranking**: by annual rate; the yearly interest cost is balance × rate. Overdrafts come
  from bank accounts with a negative balance and an overdraft rate. Example:
  ₪11,800 overdraft at 12.9% → **₪1,522.20/yr**. "Expensive" = rate > advisor threshold; with no
  threshold set the flag is *unknown* (never guessed).
- **Consolidation**: overdraft ₪11,800 + consumer loan ₪25,000 + fee ₪500 → new loan **₪37,300**
  at 7% over 36 months = **₪1,151.72/month** (before: ₪1,600/month). Total cost is shown
  before and after.

## Action plan (`plan/engine.ts`)
Fixed, conservative order (priority steps of 10). The advisor can reorder, retitle, add a note,
approve, dismiss or reopen.

1. **EMERGENCY_FUND**: gap = target months × average expenses − liquid assets (bank balances,
   money-market funds, deposits maturing within 90 days). Monthly deposit = surplus × share
   (`plan.params`, 50%). Example: 6 × ₪20,000 − ₪10,000 = **₪110,000**, ₪2,000/month →
   **55 months**.
2. **EXPENSIVE_DEBT**: each debt flagged expensive; impact = yearly interest avoided.
3. **REDUCE_FEES**: products whose benchmark fees give a positive gain at retirement.
4. **CUT_LEAK**: recurring subscriptions above the minimum annual cost (₪300).
5. **BANK_FEES**: average monthly bank fees and interest over the last 3 months.
6. **AUTOMATE_SAVINGS**: when no standing savings transfer exists.
7. **INVEST_SURPLUS**: only when the emergency fund is complete **and** every debt is known to be
   non-expensive. Unknown status blocks it. Amount = liquid assets − target; impact = the best
   suitable route's net yearly gain. Example: ₪160,000 − 6 × ₪20,000 = ₪40,000 → ₪1,160/yr.

Regeneration rules:
- Recommendations are matched by `dedupKey`.
- PROPOSED items are refreshed fully.
- APPROVED, IN_PROGRESS, DONE and DISMISSED items keep the advisor's decision, title and note; only
  their reason and impact numbers refresh.
- Stale PROPOSED items are deleted.

Clients see only APPROVED, IN_PROGRESS and DONE items, and can mark them in progress or done.

## PDF reports
- Server-side HTML → PDF with headless Chromium (JavaScript disabled, network blocked).
- Noto Sans Hebrew/Arabic fonts are embedded, so Hebrew and Arabic render without system fonts.
- The report language is chosen per report (the default is the household's language) and is
  independent of the advisor's UI language.
- Sections:
  - **Monthly**: KPIs, change vs last month, where the money went, top 3 approved actions, fee
    potential, 6-month surplus chart.
  - **Full review**: everything in the monthly report, plus net worth, long-term products,
    retirement projection and debts.
- PDFs are stored encrypted with their SHA-256. The client can download a report only after the
  advisor releases it; an unreleased report returns 404 to the client.
