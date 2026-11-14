/**
 * FICTIONAL demo data. Names, numbers and e-mails are invented; any resemblance to real
 * people is coincidental. E-mails use the reserved ".test" TLD so nothing can be delivered.
 * Amounts in agorot (×100).
 */
import type { GenLine } from "./generate";
import { halabi, khatib, osman } from "./generate";

export type DemoHousehold = {
  displayName: string;
  city: string;
  preferredLocale: "he" | "ar";
  riskTolerance: "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | null;
  status: "ONBOARDING" | "ACTIVE";
  members: { firstName: string; lastName: string; memberRole: "PRIMARY" | "SPOUSE" | "DEPENDENT"; birthYear: number; employmentType?: "SALARIED" | "SELF_EMPLOYED" | "BOTH" | "NOT_EMPLOYED" }[];
  income: { label: string; type: "SALARY" | "SELF_EMPLOYMENT" | "RENTAL" | "ALLOWANCE"; net: number; gross?: number; regularity?: "FIXED" | "IRREGULAR" }[];
  goals: { title: string; target: number; targetDate?: string }[];
  consent: boolean;
  clientLogin?: { email: string; displayName: string; locale: "he" | "ar" };
  accounts: { key: string; kind: "BANK_ACCOUNT" | "CREDIT_CARD"; institution: "LEUMI" | "DISCOUNT" | "HAPOALIM" | "MAX" | "ISRACARD"; nickname: string; last4: string }[];
  lines: () => GenLine[];
  /** Months closed by the advisor in the demo (others stay open). */
  closePeriods: string[];
  /** Simulates the advisor teaching the system once ("apply to similar"). */
  learned: { description: string; category: string }[];
  /** One-off manual categorizations by the advisor. */
  manual: { descriptionContains: string; category: string }[];
  budgets: { category: string; amount: number }[];
  notes: string[];
  tasks: string[];
};

export const demoHouseholds: DemoHousehold[] = [
  {
    displayName: "عائلة خطيب · משפחת ח'טיב",
    city: "עכו",
    preferredLocale: "ar",
    riskTolerance: "LOW",
    status: "ACTIVE",
    members: [
      { firstName: "سامر", lastName: "خطيب", memberRole: "PRIMARY", birthYear: 1984, employmentType: "SELF_EMPLOYED" },
      { firstName: "رنا", lastName: "خطيب", memberRole: "SPOUSE", birthYear: 1987, employmentType: "SALARIED" },
      { firstName: "يوسف", lastName: "خطيب", memberRole: "DEPENDENT", birthYear: 2013 },
      { firstName: "ليان", lastName: "خطيب", memberRole: "DEPENDENT", birthYear: 2016 },
    ],
    income: [
      { label: "عمل كهربائي مستقل", type: "SELF_EMPLOYMENT", net: 16500, regularity: "IRREGULAR" },
      { label: "راتب معلمة", type: "SALARY", net: 9800, gross: 12400 },
      { label: "مخصصات أولاد", type: "ALLOWANCE", net: 340 },
    ],
    goals: [
      { title: "صندوق طوارئ 6 أشهر", target: 120000, targetDate: "2027-12-31" },
      { title: "دفعة أولى لشقة", target: 350000, targetDate: "2030-06-30" },
    ],
    consent: true,
    clientLogin: { email: "samer.demo@example.test", displayName: "سامر", locale: "ar" },
    accounts: [
      { key: "bank", kind: "BANK_ACCOUNT", institution: "LEUMI", nickname: "לאומי עו\"ש", last4: "4821" },
      { key: "max", kind: "CREDIT_CARD", institution: "MAX", nickname: "מקס — סאמר", last4: "1190" },
    ],
    lines: khatib,
    closePeriods: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    learned: [{ description: "העברה - לקוח עבודות חשמל", category: "income_business" }],
    manual: [{ descriptionContains: "חתונה", category: "events_gifts" }],
    budgets: [{ category: "groceries", amount: 2600 }, { category: "leisure", amount: 600 }, { category: "transport", amount: 1100 }],
    notes: ["פגישה ראשונה: הכנסה לא קבועה מהעסק. סוכם על תקציב מזון ומעקב חודשי.", "ספטמבר: חודש ראשון בעודף. בוטל מנוי Apple; ממליץ לבדוק גם את Spotify."],
    tasks: ["إلغاء اشتراكين غير مستخدمين", "تحويل تلقائي 1,000 ₪ شهريًا للادخار", "إرسال كشوف بطاقة Max لشهر 10"],
  },
  {
    displayName: "משפחת חלבי · عائلة حلبي",
    city: "בית ג'ן",
    preferredLocale: "he",
    riskTolerance: "MEDIUM",
    status: "ACTIVE",
    members: [
      { firstName: "ואיל", lastName: "חלבי", memberRole: "PRIMARY", birthYear: 1979, employmentType: "SALARIED" },
      { firstName: "סמאח", lastName: "חלבי", memberRole: "SPOUSE", birthYear: 1982, employmentType: "SALARIED" },
      { firstName: "עדי", lastName: "חלבי", memberRole: "DEPENDENT", birthYear: 2009 },
    ],
    income: [
      { label: "משכורת — קבע", type: "SALARY", net: 21500, gross: 29800 },
      { label: "משכורת — אחות", type: "SALARY", net: 11200, gross: 14600 },
      { label: "שכירות יחידת דיור", type: "RENTAL", net: 2800 },
    ],
    goals: [{ title: "לימודים אקדמיים לעדי", target: 90000, targetDate: "2028-09-01" }],
    consent: true,
    clientLogin: { email: "wael.demo@example.test", displayName: "ואיל", locale: "he" },
    accounts: [
      { key: "bank", kind: "BANK_ACCOUNT", institution: "DISCOUNT", nickname: "דיסקונט משותף", last4: "3307" },
      { key: "isracard", kind: "CREDIT_CARD", institution: "ISRACARD", nickname: "ישראכרט משפחתי", last4: "7752" },
    ],
    lines: halabi,
    closePeriods: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    learned: [],
    manual: [{ descriptionContains: "איסתא", category: "leisure" }],
    budgets: [],
    notes: ["משפחה בעודף יציב. השלב הבא: בדיקת דמי ניהול בקרן ההשתלמות ובקופה (שלב 2)."],
    tasks: ["בדיקת דמי ניהול בקרן ההשתלמות"],
  },
  {
    displayName: "عائلة عثمان · משפחת עות'מאן",
    city: "מג'ד אל-כרום",
    preferredLocale: "ar",
    riskTolerance: null,
    status: "ACTIVE",
    members: [
      { firstName: "محمد", lastName: "عثمان", memberRole: "PRIMARY", birthYear: 1990, employmentType: "BOTH" },
      { firstName: "هبة", lastName: "عثمان", memberRole: "SPOUSE", birthYear: 1992, employmentType: "NOT_EMPLOYED" },
    ],
    income: [{ label: "راتب + عمل حر", type: "SALARY", net: 18400, gross: 23900 }],
    goals: [],
    consent: true,
    accounts: [{ key: "bank", kind: "BANK_ACCOUNT", institution: "HAPOALIM", nickname: "הפועלים עו\"ש", last4: "6604" }],
    lines: osman,
    closePeriods: ["2026-06", "2026-07", "2026-08"],
    learned: [{ description: "העברה - עבודה פרטית", category: "income_business" }],
    manual: [],
    budgets: [],
    notes: [],
    tasks: [],
  },
  {
    displayName: "משפחת לוי",
    city: "כרמיאל",
    preferredLocale: "he",
    riskTolerance: null,
    status: "ONBOARDING",
    members: [
      { firstName: "אורית", lastName: "לוי", memberRole: "PRIMARY", birthYear: 1976, employmentType: "SALARIED" },
      { firstName: "דניאל", lastName: "לוי", memberRole: "SPOUSE", birthYear: 1974, employmentType: "SELF_EMPLOYED" },
    ],
    income: [],
    goals: [],
    consent: false,
    accounts: [],
    lines: () => [],
    closePeriods: [],
    learned: [],
    manual: [],
    budgets: [],
    notes: [],
    tasks: [],
  },
];
