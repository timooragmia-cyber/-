/**
 * Configuration seed. RULE: no rate, bracket, threshold or ceiling is seeded from memory.
 * Tax rules and fee ceilings are created as MISSING placeholders (keys + where to verify);
 * the values are researched against official sources and entered in Phase 3 (tax) and
 * Phase 2 (fees), each with sourceUrl + lastVerifiedAt. Calculators refuse MISSING rules.
 *
 * Advisory parameters are professional POLICY (not law); seeded with conservative defaults
 * that the advisor must confirm on the configuration screen.
 */

const TAX_AUTHORITY = "רשות המסים בישראל — לאימות מול האתר הרשמי (gov.il)";
const CMA = "רשות שוק ההון, ביטוח וחיסכון — לאימות מול חוזר/תקנות עדכניים";

export const taxRuleKeys: { ruleKey: string; sourceTitle: string; notes: string }[] = [
  { ruleKey: "purchase_tax.single_residence", sourceTitle: TAX_AUTHORITY, notes: "מדרגות מס רכישה — דירה יחידה" },
  { ruleKey: "purchase_tax.additional_residence", sourceTitle: TAX_AUTHORITY, notes: "מדרגות מס רכישה — דירה נוספת" },
  { ruleKey: "purchase_tax.special_status", sourceTitle: TAX_AUTHORITY, notes: "עולה חדש, נכה ומעמדות מיוחדים לפי הדין" },
  { ruleKey: "betterment_tax.rates", sourceTitle: TAX_AUTHORITY, notes: "מס שבח — שיעורים, חישוב לינארי" },
  { ruleKey: "betterment_tax.single_residence_exemption", sourceTitle: TAX_AUTHORITY, notes: "פטור דירת מגורים מזכה — תנאים ותקרה" },
  { ruleKey: "capital_gains.securities", sourceTitle: TAX_AUTHORITY, notes: "רווח הון בניירות ערך — שיעור רגיל ובעל מניות מהותי" },
  { ruleKey: "capital_gains.dividend_interest", sourceTitle: TAX_AUTHORITY, notes: "מס על דיבידנד וריבית" },
  { ruleKey: "surtax.high_income", sourceTitle: TAX_AUTHORITY, notes: "מס יסף — סף ושיעורים (כולל רכיב הכנסה הונית)" },
  { ruleKey: "money_market_fund.tax", sourceTitle: TAX_AUTHORITY, notes: "מיסוי רווח בקרן כספית" },
  { ruleKey: "rental_income.exempt_ceiling", sourceTitle: TAX_AUTHORITY, notes: "תקרת פטור הכנסה משכירות למגורים" },
  { ruleKey: "rental_income.flat_rate", sourceTitle: TAX_AUTHORITY, notes: "מסלול מס מופחת על שכירות למגורים" },
  { ruleKey: "income_tax.brackets", sourceTitle: TAX_AUTHORITY, notes: "מדרגות מס הכנסה ונקודות זיכוי" },
  { ruleKey: "provident.withdrawal_rules", sourceTitle: TAX_AUTHORITY, notes: "תנאי משיכה פטורה — קופות גמל וקרנות השתלמות" },
  { ruleKey: "pension.income_exemption", sourceTitle: TAX_AUTHORITY, notes: "פטור על קצבה מזכה" },
  { ruleKey: "cpi.series", sourceTitle: "הלשכה המרכזית לסטטיסטיקה — מדד המחירים לצרכן", notes: "סדרת מדד לחישובי סכום אינפלציוני" },
];

export const feeBenchmarkKeys: { productType: string; feeBase: "DEPOSITS" | "ACCUMULATION" }[] = [
  { productType: "PENSION_COMPREHENSIVE", feeBase: "DEPOSITS" },
  { productType: "PENSION_COMPREHENSIVE", feeBase: "ACCUMULATION" },
  { productType: "PROVIDENT_FUND", feeBase: "ACCUMULATION" },
  { productType: "STUDY_FUND", feeBase: "ACCUMULATION" },
  { productType: "MANAGERS_INSURANCE", feeBase: "DEPOSITS" },
  { productType: "MANAGERS_INSURANCE", feeBase: "ACCUMULATION" },
  { productType: "INVESTMENT_PROVIDENT_FUND", feeBase: "ACCUMULATION" },
];
export const CMA_SOURCE = CMA;

export const advisoryParameters: { key: string; value: unknown; description: string }[] = [
  { key: "monthly_close.grace_days", value: 10, description: "ימים בתחילת חודש לפני שחודש קודם שלא נסגר מסומן 'חסר עדכון'" },
  { key: "dashboard.trend_flat_threshold_ppm", value: 10000, description: "שינוי בשיעור חיסכון מתחת לסף זה (ppm, 10000=1%) נחשב יציב" },
  { key: "emergency_fund.months", value: { min: 3, target: 6 }, description: "קרן חירום: חודשי הוצאות קבועות+משתנות (ברירת מחדל שמרנית — לאישור היועץ)" },
  { key: "debt.expensive_threshold_ppm", value: null, description: "ריבית שנתית שמעליה חוב נחשב 'יקר' — לקביעת היועץ (ריק עד שייקבע)" },
  { key: "health_score.weights", value: { savingsRate: 30, emergencyFund: 25, debtLoad: 25, fixedCostRatio: 20 }, description: "משקלות מדד הבריאות הפיננסית (סה\"כ 100) — שקוף ללקוח וליועץ" },
];
