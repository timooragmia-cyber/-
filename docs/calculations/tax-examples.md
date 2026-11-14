# Tax calculators — method and documented examples

Code: `src/lib/tax/*` · Tests: `tests/unit/tax.test.ts` (each example below is a test) ·
Oracle: the same arithmetic reproduced independently with exact fractions (Python).

**All rule values come from the `tax_rules` table** (seeded UNVERIFIED from public secondary
sources, 2026-11-14 — see `prisma/seed/tax-rules.ts` for the source and notes per rule).
A calculator picks the rule valid on the **transaction date** and **refuses** to run when the
rule is missing, expired or malformed. CPI values in the examples are SYNTHETIC test values.

Rounding: amounts are integer agorot; each tax component is computed exactly and rounded once,
HALF_UP, to the agora.

## 1. Purchase tax (מס רכישה) — progressive brackets

| Example | Computation | Result |
|---|---|---|
| Single apartment ₪2,500,000 (2026) | (2,347,040 − 1,978,745) × 3.5% + (2,500,000 − 2,347,040) × 5% = 12,890.325 + 7,648 | **₪20,538.33** (published example: ₪20,538) |
| Single apartment ₪7,000,000 | 12,890.325 + 3,708,030 × 5% + 944,930 × 8% | **₪273,886.23** |
| Additional apartment ₪2,500,000 | 2,500,000 × 8% | **₪200,000.00** |
| New immigrant ₪3,000,000 (Reg. 12A) | (3,000,000 − 1,978,745) × 0.5% | **₪5,106.28** |
| Additional apartment, purchase 1.3.2027 | rule configured to expire 31.12.2026 | **refused** |
| Disabled buyer | rule MISSING | **refused** |

## 2. Betterment tax (מס שבח) — residential apartment, individual

Inputs: bought 30.6.2010 for ₪1,000,000 + ₪100,000 costs; sold 30.6.2026 for ₪2,600,000 with
₪40,000 selling costs; known CPI 100.0 → 130.0.

- Nominal gain = 2,600,000 − 40,000 − 1,100,000 = **₪1,460,000**
- Inflationary amount = 1,100,000 × (130/100 − 1) = **₪330,000** → real gain **₪1,130,000**
- Holding: 5,844 days; 550 days to 1.1.2012, 5,294 days after.

| Route | Computation | Tax |
|---|---|---|
| Regular linear | 1,130,000 × 550/5,844 × 20% + rest × 25% | **₪277,182.58** |
| Linear-beneficial | 1,281 days to 1.1.2014 exempt (₪247,695.07); rest × 25% | **₪220,576.23** |
| Single-residence exemption, price ≤ ceiling ₪5,008,000 | fully exempt | **₪0** |
| Same, price ₪6,000,000 (real gain ₪4,530,000) | gain share above ceiling = 4,530,000 × (6,000,000 − 5,008,000) / 6,000,000 = ₪748,960 → linear-beneficial on it | **₪146,197.15** |
| Bought 15.3.1998, sold 15.3.2026, real gain ₪1,000,000, advisor's pre-2001 rate 47% | 1,333 d × 47% + 3,707 d × 20% + 5,187 d × 25% (of 10,227) | **₪260,551.49** |

Known-index convention: the CPI known on a date from the 15th onward is last month's, before
the 15th the month before (advisor can override both index values).

## 3. Capital gains, dividends, interest

| Example | Result |
|---|---|
| Cost ₪100,000, proceeds ₪150,000, CPI 100 → 108 | real gain ₪42,000 × 25% = **₪10,500** |
| Same with ₪50,000 loss carried forward | gain fully offset; **₪8,000** loss carried forward |
| Nominal, substantial shareholder; dividend ₪10,000; unlinked interest ₪2,000 | 30% × 50,000 = ₪15,000; 25% × 10,000 = ₪2,500; 15% × 2,000 = ₪300 |
| FX-linked, rate 3.60 → 3.78 | inflationary amount ₪5,000; rate falling → ₪0 |
| Surtax: other income ₪700,000 + capital ₪100,000 | above ₪721,560 = ₪78,440 → 3% + 2% (capital part) = **₪3,922** |

## 4. Money-market fund vs deposit

₪100,000 · 12 months · fund 4.5% gross − 0.25% fee = ₪104,250 · inflation 3% (₪3,000) →
real gain ₪1,250 × 25% = ₪312.50 → **₪103,937.50**; deposit 4.2% → interest ₪4,200 × 15% =
₪630 → **₪103,570**; difference **₪367.50** in favour of the fund.

## 5. Rental income — three routes

Rent ₪7,000/month, other taxable income ₪228,000, expenses ₪10,000, depreciation ₪15,000:
- Exempt route: exempt = 2 × 5,654 − 7,000 = ₪4,308/month → taxable ₪32,304/yr at 31% = **₪10,014.24**
- 10% route: ₪84,000 × 10% = **₪8,400** ← cheapest
- Regular route: (84,000 − 25,000) × 31% = **₪18,290**

## 6. Provident & pension

- Qualifying pension ₪15,000/month: exempt 57% × 9,430 = ₪5,375.10/month → taxable ₪115,498.80/yr →
  brackets ₪12,805.03 − credits 2.25 × 2,904 = ₪6,534 → **₪6,271.03/yr (₪522.59/month)**.
- Study fund opened 1.3.2019, withdrawal 14.11.2026: liquid since 1.3.2025; tax on ₪3,000 gains
  on deposits above the ceiling × 25% = **₪750**. Opened 1.3.2022: not liquid → no figure.
- Pension-deposit credit: rule MISSING → **refused**.
