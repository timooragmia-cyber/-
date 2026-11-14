/**
 * Configuration seed. RULE: no rate, bracket, threshold or ceiling is seeded from memory.
 * Tax rules and fee ceilings are created as MISSING placeholders (keys + where to verify);
 * the values are researched against official sources and entered in Phase 3 (tax) and
 * Phase 2 (fees), each with sourceUrl + lastVerifiedAt. Calculators refuse MISSING rules.
 *
 * Advisory parameters are professional POLICY (not law); seeded with conservative defaults
 * that the advisor must confirm on the configuration screen.
 */

const CMA = "רשות שוק ההון, ביטוח וחיסכון — לאימות מול חוזר/תקנות עדכניים";

/**
 * Fee benchmarks and legal ceilings — researched 2026-11-14 from PUBLIC SECONDARY sources
 * (the regulation text itself was not reachable from the build environment). Every row is
 * UNVERIFIED: the advisor must verify against the current regulations / Capital Market
 * Authority publications and mark VERIFIED on the configuration screen.
 * Values in ppm: 1% = 10,000.
 */
const SRC_CEILINGS = "https://www.supermarker.themarker.com/Calculators/Fees/ManagementFeesCalculator.aspx";
const SRC_DEFAULT_FUNDS = "https://www.bizportal.co.il/longtermsavings/news/article/834173";
const SRC_GEMEL = "https://gemel-net.co.il/dn/";

export type FeeSeed = {
  productType: string;
  feeBase: "DEPOSITS" | "ACCUMULATION";
  benchmarkPpm: number | null;
  legalCeilingPpm: number | null;
  sourceUrl: string | null;
  notes: string;
  status: "UNVERIFIED" | "MISSING";
};

export const feeBenchmarks: FeeSeed[] = [
  { productType: "PENSION_COMPREHENSIVE", feeBase: "DEPOSITS", benchmarkPpm: 10_000, legalCeilingPpm: 60_000, sourceUrl: SRC_DEFAULT_FUNDS, status: "UNVERIFIED",
    notes: "תקרה 6% מהפקדה (מקורות משניים). רף: 1% — תנאי קרנות ברירת המחדל במכרז 2024 (10 שנים מההצטרפות). ממוצע ענפי 2024 לפי Supermarker: 1.57%." },
  { productType: "PENSION_COMPREHENSIVE", feeBase: "ACCUMULATION", benchmarkPpm: 1_500, legalCeilingPpm: 5_000, sourceUrl: SRC_CEILINGS, status: "UNVERIFIED",
    notes: "תקרה 0.5% מצבירה. רף: 0.15% — ממוצע ענפי 2024 (Supermarker, לפי פרסום הממונה). קרנות ברירת מחדל במכרז 2024: 0.22%. מקבלי קצבה מ-2/2022: עד 0.3%." },
  { productType: "PENSION_GENERAL", feeBase: "DEPOSITS", benchmarkPpm: null, legalCeilingPpm: null, sourceUrl: null, status: "MISSING", notes: "לא נחקר — להזנת היועץ." },
  { productType: "PENSION_GENERAL", feeBase: "ACCUMULATION", benchmarkPpm: null, legalCeilingPpm: null, sourceUrl: null, status: "MISSING", notes: "לא נחקר — להזנת היועץ." },
  { productType: "MANAGERS_INSURANCE", feeBase: "DEPOSITS", benchmarkPpm: null, legalCeilingPpm: 40_000, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "תקרה 4% מהפקדה (מקורות משניים). רף שוק לא נמצא במקור אמין — להזנת היועץ." },
  { productType: "MANAGERS_INSURANCE", feeBase: "ACCUMULATION", benchmarkPpm: null, legalCeilingPpm: 10_500, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "תקרה 1.05% מצבירה (מינואר 2014, מקורות משניים). פוליסות ותיקות עשויות להיות בתנאים אחרים — לבדוק בפוליסה." },
  { productType: "PROVIDENT_FUND", feeBase: "DEPOSITS", benchmarkPpm: 0, legalCeilingPpm: 40_000, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "תקרה 4% מהפקדה. רף 0% — רוב קופות הגמל אינן גובות מהפקדה (מקורות משניים)." },
  { productType: "PROVIDENT_FUND", feeBase: "ACCUMULATION", benchmarkPpm: 5_000, legalCeilingPpm: 10_500, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "תקרה 1.05% מצבירה. רף 0.5% — הערכה לפי מקורות שמדווחים על 0.2%–0.5% במשא ומתן; ליועץ לעדכן לפי ההצעות שהוא משיג." },
  { productType: "INVESTMENT_PROVIDENT_FUND", feeBase: "ACCUMULATION", benchmarkPpm: 5_000, legalCeilingPpm: 10_500, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "הונח כקופת גמל (1.05%) — לא אומת שהתקרה זהה לגמל להשקעה. רף 0.5% כהערכה." },
  { productType: "STUDY_FUND", feeBase: "DEPOSITS", benchmarkPpm: 0, legalCeilingPpm: null, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "כמעט כל קרנות ההשתלמות לא גובות מהפקדה (רף 0%). תקרה: לא אומתה." },
  { productType: "STUDY_FUND", feeBase: "ACCUMULATION", benchmarkPpm: 5_000, legalCeilingPpm: null, sourceUrl: SRC_GEMEL, status: "UNVERIFIED",
    notes: "תקרה: סתירה בין מקורות (2% מול 1.05% מצבירה) — נשארה ריקה עד אימות מול התקנות. רף 0.5% כהערכה." },
];

export const CMA_SOURCE = CMA;

export const advisoryParameters: { key: string; value: unknown; description: string }[] = [
  { key: "monthly_close.grace_days", value: 10, description: "ימים בתחילת חודש לפני שחודש קודם שלא נסגר מסומן 'חסר עדכון'" },
  { key: "dashboard.trend_flat_threshold_ppm", value: 10000, description: "שינוי בשיעור חיסכון מתחת לסף זה (ppm, 10000=1%) נחשב יציב" },
  { key: "emergency_fund.months", value: { min: 3, target: 6 }, description: "קרן חירום: חודשי הוצאות קבועות+משתנות (ברירת מחדל שמרנית — לאישור היועץ)" },
  { key: "debt.expensive_threshold_ppm", value: null, description: "ריבית שנתית שמעליה חוב נחשב 'יקר' — לקביעת היועץ (ריק עד שייקבע)" },
  { key: "recurring.detection", value: { minMonths: 3, tolerancePpm: 150000, lookbackMonths: 6 }, description: "זיהוי חיוב קבוע: לפחות 3 חודשים, סטייה עד 15% מהחציון, חלון 6 חודשים" },
  { key: "highlights.thresholds", value: { minChangePpm: 100000, minChangeAgorot: 20000, max: 5 }, description: "הדגשות חודש מול חודש: שינוי של 10% לפחות וגם 200 ₪ לפחות, עד 5 הדגשות" },
  { key: "health_score.targets", value: { savingsRateGoodPpm: 200000, fixedCostRatioGoodPpm: 500000, fixedCostRatioBadPpm: 800000, emergencyFundGoodMonths: 6 }, description: "יעדי מדד הבריאות: חיסכון 20% = 100; הוצאות קבועות עד 50% מההכנסה = 100, 80% ומעלה = 0" },
  { key: "retirement.defaults", value: { retirementAge: 67, conservativeReturnPpm: 20000, baseReturnPpm: 35000, optimisticReturnPpm: 50000, depositGrowthPpm: 0, annuityFactorMilli: 200000 },
    description: "ברירות מחדל לתחזית פרישה: תשואה ריאלית 2%/3.5%/5% (אושר בעיקרון ע\"י היועץ), גיל 67 ומקדם המרה 200 — לאמת (גיל הפרישה תלוי במין ובשנת לידה; המקדם תלוי בקרן)" },
  { key: "cashflow.calendar", value: { lookbackMonths: 3, minMonths: 2, projectionDays: 35 }, description: "לוח תזרים: חלון 3 חודשים, פריט קבוע אם הופיע לפחות בחודשיים, תחזית 35 ימים" },
  { key: "health_score.weights", value: { savingsRate: 30, emergencyFund: 25, debtLoad: 25, fixedCostRatio: 20 }, description: "משקלות מדד הבריאות הפיננסית (סה\"כ 100) — שקוף ללקוח וליועץ" },
];
