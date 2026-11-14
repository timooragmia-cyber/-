/**
 * FICTIONAL demo data. Names, numbers and e-mails are invented; any resemblance to real
 * people is coincidental. E-mails use the reserved ".test" TLD so nothing can be delivered.
 * Amounts in agorot (×100).
 */
type DemoSnapshot = { period: string; income: number; expenses: number }; // whole shekels

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
  snapshots: DemoSnapshot[];
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
    snapshots: [
      { period: "2026-05", income: 25100, expenses: 28900 },
      { period: "2026-06", income: 26800, expenses: 28100 },
      { period: "2026-07", income: 24900, expenses: 27300 },
      { period: "2026-08", income: 27400, expenses: 27900 },
      { period: "2026-09", income: 26100, expenses: 25600 },
      { period: "2026-10", income: 26600, expenses: 24800 },
    ],
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
    snapshots: [
      { period: "2026-05", income: 35500, expenses: 31900 },
      { period: "2026-06", income: 35500, expenses: 33200 },
      { period: "2026-07", income: 36100, expenses: 37400 },
      { period: "2026-08", income: 35500, expenses: 32100 },
      { period: "2026-09", income: 35500, expenses: 30900 },
      { period: "2026-10", income: 35800, expenses: 30600 },
    ],
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
    snapshots: [
      { period: "2026-06", income: 18400, expenses: 21300 },
      { period: "2026-07", income: 18400, expenses: 20100 },
      { period: "2026-08", income: 18900, expenses: 21800 },
    ],
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
    snapshots: [],
    tasks: [],
  },
];
