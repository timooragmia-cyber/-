# Fee-savings simulator — method and reference examples

Code: `src/lib/savings/fee-simulator.ts` (version `fee-sim@1`). Tests: `tests/unit/savings.test.ts`.

## Algorithm (per month, in this order)

1. The monthly deposit arrives (deposits grow once a year by the real deposit-growth rate).
2. Deposit fee = deposit × fee-from-deposits, deducted.
3. Real return for the month: balance × (1 + r)^(1/12), where r is the annual **real** return.
4. Accumulation fee for the month = balance × fee-from-accumulation ÷ 12, deducted
   (Israeli funds charge the annual accumulation fee monthly, pro rata).

All amounts are in today's shekels (real terms) and **before tax**.

## Exactness

- Integer math only: money in agorot (`bigint`), rates in ppm, internal precision 1/1,000,000 agora.
- The monthly factor (1 + r)^(1/12) is an exact integer 12th root at 10^15 scale (Newton's method on `bigint`).
- Results are rounded HALF_UP to whole agorot once, at output.

## Reference examples (oracle: Python `decimal`, 60 digits, same algorithm)

| Case | Inputs | Expected |
|---|---|---|
| Return only | ₪100,000, 12 months, 12% real, no fees | ₪112,000.00 |
| Deposit fee only | ₪1,000/month × 12, 2% deposit fee, 0% return | balance ₪11,760.00, fees ₪240.00 |
| Accumulation fee only | ₪100,000, 12 months, 1.2% accumulation fee, 0% return | ₪98,806.58 (fees ₪1,193.42) |
| Deposit growth | ₪1,000/month × 24, +2% per year | deposits ₪24,240.00 |
| 25-year comparison | ₪300,000 + ₪3,000/month, 300 months, 3.5% real; 1.5%/0.30% vs 1.0%/0.15% | current ₪2,006,106.40; target ₪2,067,267.12; gain ₪61,160.72; fees saved ₪42,916.26 |

The engine matches every oracle value to within 1 agora (2 agorot for differences of two results).

## Retirement projection

`src/lib/savings/retirement.ts`: each product is simulated to the retirement month under three
real-return scenarios (advisor-editable, defaults in `retirement.defaults`). Annuity products
(pension, managers' insurance, provident fund) → capital ÷ annuity factor = monthly pension
(gross, before tax). Study funds and investment provident funds → lump sum.
Retirement month: birth year + retirement age, mid-year convention (birth month is not stored).
