import { describe, expect, it } from "vitest";
import { bankCosts, cardCycles } from "@/lib/accounts/cards";
import { buildCashflowCalendar, projectBalance } from "@/lib/accounts/cashflow";
import { netWorthSeries } from "@/lib/accounts/net-worth";

const sh = (v: number) => BigInt(Math.round(v * 100));

describe("cash-flow calendar", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  const txns = months.flatMap((m) => [
    { date: `${m}-01`, amount: -sh(4200), description: "שכר דירה" },
    { date: `${m}-10`, amount: sh(9800), description: "משכורת" },
    { date: `${m}-10`, amount: -sh(m === "2026-09" ? 4300 : 3900), description: "מקס איט פיננסים" },
    { date: `${m}-15`, amount: -sh(1350), description: "החזר הלוואה 4471" },
    { date: `${m}-20`, amount: -sh(300), description: ({ "2026-08": "חנות פרחים", "2026-09": "מוסך הגליל", "2026-10": "ספרייה עירונית" } as Record<string, string>)[m]! },
  ]);
  const cal = buildCashflowCalendar(txns, months, 2);

  it("places recurring items on their median day and amount", () => {
    expect(cal.items.map((i) => [i.day, i.amount])).toEqual([
      [1, -sh(4200)],
      [10, -sh(3900)],
      [10, sh(9800)],
      [15, -sh(1350)],
    ]);
  });
  it("spreads the rest as variable spending (₪300/month)", () => {
    expect(cal.variableMonthlyOut).toBe(sh(300));
  });
  it("projects the balance and finds the overdraft-risk day", () => {
    // start 2026-10-31 with ₪3,000 → Nov 1 rent takes it below zero
    const p = projectBalance(cal, { date: "2026-10-31", balance: sh(3000) }, 30, sh(1000));
    expect(p[0]).toMatchObject({ date: "2026-11-01", day: 1, belowZero: true, beyondOverdraft: true });
    expect(p[0]!.balance).toBe(sh(3000) - sh(4200) - sh(10)); // ₪300 / 30 days = ₪10/day
    const day10 = p.find((x) => x.day === 10)!;
    expect(day10.inflow).toBe(sh(9800) + 0n);
  });
});

describe("card cycles and bank costs", () => {
  const card = [
    { date: "2026-09-03", chargeDate: "2026-10-10", amount: -sh(500), description: "שופרסל", categoryKey: "groceries", installmentNumber: null, installmentTotal: null },
    { date: "2026-09-04", chargeDate: "2026-10-10", amount: -sh(300), description: "ACE", categoryKey: "home_goods", installmentNumber: 2, installmentTotal: 12 },
    { date: "2026-09-30", chargeDate: "2026-10-10", amount: -sh(19.9), description: "דמי כרטיס", categoryKey: "bank_fees", installmentNumber: null, installmentTotal: null },
    { date: "2026-09-12", chargeDate: "2026-10-10", amount: -sh(450), description: "שופרסל", categoryKey: "groceries", installmentNumber: null, installmentTotal: null },
    { date: "2026-08-03", chargeDate: "2026-09-10", amount: -sh(700), description: "שופרסל", categoryKey: "groceries", installmentNumber: null, installmentTotal: null },
  ];
  it("groups by billing date, newest first, with category / merchant / installments / fees", () => {
    const c = cardCycles(card);
    expect(c.map((x) => [x.chargeDate, x.total])).toEqual([["2026-10-10", sh(1269.9)], ["2026-09-10", sh(700)]]);
    expect(c[0]!.byCategory[0]).toEqual({ key: "groceries", amount: sh(950) });
    expect(c[0]!.topMerchants[0]).toMatchObject({ amount: sh(950), count: 2 });
    expect(c[0]!.installments).toBe(sh(300));
    expect(c[0]!.feesAndInterest).toBe(sh(19.9));
  });
  it("splits bank interest from fees", () => {
    const r = bankCosts([
      { date: "2026-10-28", amount: -sh(29.9), description: "דמי ניהול חשבון", categoryKey: "bank_fees" },
      { date: "2026-10-28", amount: -sh(95), description: "ריבית חובה", categoryKey: "bank_fees" },
      { date: "2026-10-05", amount: -sh(100), description: "שופרסל", categoryKey: "groceries" },
    ]);
    expect(r).toEqual([{ month: "2026-10", interest: sh(95), fees: sh(29.9) }]);
  });
});

describe("net worth series", () => {
  it("carries the latest balance forward; negatives are liabilities", () => {
    const s = netWorthSeries(
      [
        { key: "bank", kind: "BANK", asOf: "2026-08-31", balance: -sh(2000) },
        { key: "bank", kind: "BANK", asOf: "2026-10-31", balance: sh(5000) },
        { key: "pension", kind: "PRODUCT", asOf: "2026-06-30", balance: sh(180000) },
      ],
      "2026-07",
      "2026-10",
    );
    expect(s.map((x) => [x.period, x.netWorth])).toEqual([
      ["2026-07", sh(180000)],
      ["2026-08", sh(178000)],
      ["2026-09", sh(178000)],
      ["2026-10", sh(185000)],
    ]);
    expect(s[1]).toMatchObject({ liabilities: sh(2000), savings: sh(180000) });
  });
});
