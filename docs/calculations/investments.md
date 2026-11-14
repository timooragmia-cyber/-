# Investment modules — method and documented examples

Code: `src/lib/invest/*` · Tests: `tests/unit/invest.test.ts`. All money is integer agorot; rates ppm.
Market expectations (route returns, appreciation, inflation, selling costs) are **advisor
assumptions** stored in `advisory_parameters` (`investment.assumptions`, `investment.routes`) —
not forecasts and not market data. Taxes come only from `tax_rules`.

## Real estate
- Gross yield = annual rent ÷ current value · Net yield = (rent − expenses) × 12 ÷ value
- Equity = value − mortgage · Cash on equity = (rent − expenses − mortgage payment) × 12 ÷ equity
- Example: value ₪1.8M, rent ₪5,000, expenses ₪600, mortgage ₪900k / ₪4,200 →
  gross **3.333%**, net **2.933%**, cash flow **₪2,400/yr**, cash on equity **0.267%**.
- Appreciation (monthly-compounded exact): ₪1,000,000 at 3% for 10 years = **₪1,343,916.38**.
- Exit = price − selling costs − betterment tax (3a calculator) − mortgage payoff.
  Route: single-residence exemption for the owner's only residence, otherwise linear-beneficial.
  Example: bought 1.1.2015 (₪1M + ₪80k costs + ₪20k improvements), sold 1.1.2026 for ₪1.6M,
  2% selling costs, CPI 100 → 110, mortgage ₪400k → tax **₪89,500**, net **₪1,078,500**.
- Future exits: CPI projected from expected inflation, and **today's tax rules assumed unchanged**
  (latest version of each rule extended) — both shown as warnings on screen.

## Securities portfolio
- Transactions replayed in date order; **average cost** basis; SELL removes cost pro rata.
- Example: deposit ₪100k; buy A ₪60k (600 u), B ₪30k; custody fee ₪100; sell 300 A for ₪33k →
  realized **₪3,000**; dividend ₪500; values A ₪32k, B ₪31k → cash **₪43,400**, total **₪106,400**,
  unrealized ₪3,000 → unrealized-tax estimate 25% = **₪750** (nominal: an upper bound).
- TWR: chained Modified Dietz on month-end valuations, flows mid-month
  (+10%, then (170,500 − 110,000 − 50,000) ÷ (110,000 + 25,000) → **18.556%** cumulative).
- MWR: monthly IRR by fixed-point bisection, annualized (−100,000 → +112,000 after 12 months = **12.000%**).
- Allocation vs target by asset class; drift ≥ 5 percentage points highlighted.

## Deposits & money-market funds
Net annual = (rate − fee) − tax; deposit interest taxed nominally at the unlinked rate, MMF on the
basis configured (real by default). Example: deposit 4.2% → **3.57%** net; MMF 4.5% − 0.25% →
**3.9375%** net (inflation 3%).

## Route comparison
For an amount and horizon: grows each route at (expected return − fee) monthly, applies the tax
treatment from `tax_rules`, reports final net, nominal and real annualized net return, risk,
liquidity and fit to the advisor-assigned risk tolerance (no tolerance → nothing marked suitable).
Example (₪100,000 · 12 months · inflation 3%): equity ₪105,625 · study fund ₪105,500 (exempt,
above the yearly cap noted) · MMF ₪103,937.50 · deposit ₪103,570.

**Conservative order first**: emergency fund (liquid = bank balances + money-market funds +
deposits maturing within 90 days, vs target months) → expensive debt (Phase 4) → fees above
benchmark → risk tolerance assessed. A missing emergency fund produces the gap amount to fill
in a deposit / money-market fund before investing.
