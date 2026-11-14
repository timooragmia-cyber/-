/**
 * Tax rules seed — researched 2026-11-14 from public sources (secondary: professional sites
 * quoting the Israel Tax Authority; the official site was not reachable from the build
 * environment). EVERY row is UNVERIFIED until the advisor checks it against the official
 * source and marks it VERIFIED (configuration screen). Amounts in agorot, rates in ppm.
 * Rows with params = null are MISSING: the related calculator refuses to run.
 */
export type TaxRuleSeed = {
  ruleKey: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  params: Record<string, unknown> | null;
  sourceUrl: string | null;
  sourceTitle: string;
  notes: string;
};

const ITA = "רשות המסים — לאימות מול לוח העזר / הוראות הביצוע הרשמיים";
const sh = (shekels: number) => Math.round(shekels * 100);
const pct = (p: number) => Math.round(p * 10_000);

export const taxRules: TaxRuleSeed[] = [
  {
    ruleKey: "purchase_tax.single_residence",
    effectiveFrom: "2026-01-16",
    effectiveTo: "2028-01-15",
    params: { brackets: [
      { upTo: sh(1_978_745), ratePpm: 0 },
      { upTo: sh(2_347_040), ratePpm: pct(3.5) },
      { upTo: sh(6_055_070), ratePpm: pct(5) },
      { upTo: sh(20_183_565), ratePpm: pct(8) },
      { upTo: null, ratePpm: pct(10) },
    ] },
    sourceUrl: "https://www.bizportal.co.il/realestates/news/article/20038028",
    sourceTitle: ITA,
    notes: "מדרגות מוקפאות עד 15.1.2028 (חוק ההסדרים) לפי מקורות משניים. אומת מול דוגמה מפורסמת: דירה ב-2.5 מ' ₪ → 20,538 ₪.",
  },
  {
    ruleKey: "purchase_tax.additional_residence",
    effectiveFrom: "2026-01-16",
    effectiveTo: "2026-12-31",
    params: { brackets: [{ upTo: sh(6_055_070), ratePpm: pct(8) }, { upTo: null, ratePpm: pct(10) }] },
    sourceUrl: "https://www.bizportal.co.il/realestates/news/article/20038028",
    sourceTitle: ITA,
    notes: "הוראת שעה — מקור אחד מציין תוקף עד 31.12.2026. הוגדר תוקף עד 31.12.2026 כדי שהמחשבון יסרב אחרי מועד זה עד לאימות הארכה.",
  },
  {
    ruleKey: "purchase_tax.new_immigrant",
    effectiveFrom: "2026-01-16",
    effectiveTo: "2028-01-15",
    params: { brackets: [
      { upTo: sh(1_978_745), ratePpm: 0 },
      { upTo: sh(6_055_070), ratePpm: pct(0.5) },
      { upTo: sh(20_183_565), ratePpm: pct(8) },
      { upTo: null, ratePpm: pct(10) },
    ], maxValue: sh(20_183_565), yearsFromAliyah: 7 },
    sourceUrl: "https://www.nadlancenter.co.il/article/5161",
    sourceTitle: ITA,
    notes: "תקנה 12א (רכישה מ-15.8.2024): דירה יחידה, עד 7 שנים מהעלייה, שווי עד 20,183,565 ₪. מעל 6,055,070 ₪ — הונח מדרגות דירה יחידה (8%/10%); לאמת. מסלול תקנה 12 הישן לא ממומש.",
  },
  {
    ruleKey: "purchase_tax.disabled",
    effectiveFrom: "2026-01-16",
    effectiveTo: null,
    params: null,
    sourceUrl: null,
    sourceTitle: ITA,
    notes: "לא נמצא מקור אמין לשיעורים לנכים/נפגעי פעולות איבה — להזנת היועץ.",
  },
  {
    ruleKey: "betterment_tax.rates",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { preNov2001Ppm: null, from2001Ppm: pct(20), from2012Ppm: pct(25), period2001Start: "2001-11-07", period2012Start: "2012-01-01", inflationaryPre1994Ppm: null },
    sourceUrl: "https://www.gatax.co.il/%D7%97%D7%99%D7%A9%D7%95%D7%91-%D7%9E%D7%A1-%D7%A9%D7%91%D7%97-%D7%9C%D7%99%D7%A0%D7%90%D7%A8%D7%99/",
    sourceTitle: ITA,
    notes: "יחיד: עד 7.11.2001 — שיעור שולי (מוזן ע\"י היועץ), 7.11.2001–31.12.2011 — 20%, מ-1.1.2012 — 25%. סתירה במקורות לגבי 2001–2011 (20% מול 25%) — לאמת. סכום אינפלציוני עד 1993 — לא נתמך.",
  },
  {
    ruleKey: "betterment_tax.single_residence_exemption",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-12-31",
    params: { ceiling: sh(5_008_000), minHoldingMonths: 18, linearExemptUntil: "2014-01-01" },
    sourceUrl: "https://bscpa.co.il/%D7%9E%D7%A1-%D7%A9%D7%91%D7%97-%D7%93%D7%99%D7%A8%D7%94-%D7%99%D7%97%D7%99%D7%93%D7%94/",
    sourceTitle: ITA,
    notes: "תקרת 49ב(2) כ-5,008,000 ₪ (הוראת ביצוע 1/2026 לפי מקור משני, לתקופה 2025–2027). החזקה 18 חודשים. לינארי מוטב: השבח עד 1.1.2014 פטור.",
  },
  {
    ruleKey: "capital_gains.securities",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { individualRealPpm: pct(25), substantialShareholderPpm: pct(30) },
    sourceUrl: "https://www.bizportal.co.il/guides/news/article/20036860",
    sourceTitle: ITA,
    notes: "סעיף 91(ב): יחיד 25% על רווח ריאלי; בעל מניות מהותי (10%+) 30%.",
  },
  {
    ruleKey: "capital_gains.dividend_interest",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { dividendPpm: pct(25), dividendSubstantialPpm: pct(30), interestLinkedRealPpm: pct(25), interestUnlinkedNominalPpm: pct(15) },
    sourceUrl: "https://www.bizportal.co.il/guides/news/article/20036860",
    sourceTitle: ITA,
    notes: "דיבידנד 25%/30%. ריבית: שקלית לא צמודה 15% נומינלי; צמודה 25% — הונח על הרכיב הריאלי, לאמת.",
  },
  {
    ruleKey: "surtax.high_income",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-12-31",
    params: { thresholdAnnual: sh(721_560), ratePpm: pct(3), capitalAdditionalPpm: pct(2) },
    sourceUrl: "https://bakertilly.co.il/blog-mas-yasaf-2026",
    sourceTitle: ITA,
    notes: "סעיף 121ב: 3% מעל 721,560 ₪ (מוקפא 2025–2027), ותוספת 2% על הכנסה הונית מעל הסף (תיקון 276).",
  },
  {
    ruleKey: "money_market_fund.tax",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { ratePpm: pct(25), basis: "REAL" },
    sourceUrl: "https://www.bizportal.co.il/guides/news/article/20036860",
    sourceTitle: ITA,
    notes: "25% על רווח ריאלי לפי מקור אחד; מקור אחר מציין שהטיפול עשוי להיות שונה בקרנות שקליות לא צמודות — לאמת.",
  },
  {
    ruleKey: "rental_income.exempt_ceiling",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2026-12-31",
    params: { monthlyCeiling: sh(5_654) },
    sourceUrl: "https://www.bizportal.co.il/realestates/news/article/20036857",
    sourceTitle: ITA,
    notes: "תקרת פטור 5,654 ₪ לחודש (זהה 2024–2026, הקפאה). פטור חלקי עד פי 2 (11,308 ₪).",
  },
  {
    ruleKey: "rental_income.flat_rate",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { ratePpm: pct(10) },
    sourceUrl: "https://www.bizportal.co.il/realestates/news/article/20036857",
    sourceTitle: ITA,
    notes: "מסלול 10% על ההכנסה ברוטו, ללא ניכויים. תשלום תוך 30 יום מתום שנת המס.",
  },
  {
    ruleKey: "income_tax.brackets",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    params: { brackets: [
      { upTo: sh(84_120), ratePpm: pct(10) },
      { upTo: sh(120_720), ratePpm: pct(14) },
      { upTo: sh(228_000), ratePpm: pct(20) },
      { upTo: sh(301_200), ratePpm: pct(31) },
      { upTo: sh(560_280), ratePpm: pct(35) },
      { upTo: null, ratePpm: pct(47) },
    ], creditPointAnnual: sh(2_904) },
    sourceUrl: "https://www.bizportal.co.il/guides/news/article/20038711",
    sourceTitle: ITA,
    notes: "שנתי 2026 אחרי ריווח מדרגות 20%/31% (חוק ההתייעלות, 30.3.2026, רטרואקטיבי מ-1.1.2026). מס יסף בנפרד. נקודת זיכוי 242 ₪ לחודש.",
  },
  {
    ruleKey: "provident.withdrawal_rules",
    effectiveFrom: "2012-01-01",
    effectiveTo: null,
    params: { studyFundLiquidYears: 6, studyFundLiquidYearsAtRetirement: 3, gainsTaxPpm: pct(25) },
    sourceUrl: "https://www.meitav.co.il/provident_pension/hishtalmut/a_request_to_withdraw_money/",
    sourceTitle: ITA,
    notes: "קרן השתלמות נזילה אחרי 6 שנים; 3 שנים בגיל פרישה (תנאים נוספים). רווחים על הפקדות מעל התקרה — הונח 25%; לאמת.",
  },
  {
    ruleKey: "pension.income_exemption",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-12-31",
    params: { monthlyCeiling: sh(9_430), exemptionPpm: pct(57) },
    sourceUrl: "https://www.mvs.co.il/employers/updates/tax_ceilings_2026/",
    sourceTitle: ITA,
    notes: "קצבה מזכה: תקרה 9,430 ₪. שיעור הפטור — סתירה בין מקורות (57% מול 57.5%) — לאמת.",
  },
  {
    ruleKey: "income_tax.pension_deposit_credit",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    params: null,
    sourceUrl: null,
    sourceTitle: ITA,
    notes: "זיכוי על הפקדות עובד לפנסיה — לא נחקר בשלב 3א; להזנת היועץ.",
  },
];
