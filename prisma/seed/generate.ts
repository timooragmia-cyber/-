/**
 * Deterministic generator of FICTIONAL statement lines for the demo households.
 * Produces what an import would produce (date, chargeDate, signed agorot, description,
 * installments) so the demo runs through the real categorization and month-close code.
 */
import { addMonths } from "../../src/lib/domain/period";

export type GenLine = {
  account: string; // key into the household's accounts
  date: string;
  chargeDate: string | null;
  amount: bigint; // agorot, signed
  description: string;
  installmentNumber?: number;
  installmentTotal?: number;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (period: string, d: number) => `${period}-${String(d).padStart(2, "0")}`;
const sh = (shekels: number) => BigInt(Math.round(shekels * 100));

type CardPlan = { account: string; payFrom: string; payDescription: string; billingDay: number };

/**
 * Card lines for purchases in `purchasePeriod` are billed on billingDay of the next month.
 * The bank's card payment line (a TRANSFER) equals the cycle total, so nothing is double counted.
 */
function cardCycle(lines: GenLine[], card: CardPlan, purchasePeriod: string, purchases: Omit<GenLine, "account" | "chargeDate">[]) {
  const charge = day(addMonths(purchasePeriod, 1), card.billingDay);
  let total = 0n;
  for (const p of purchases) {
    lines.push({ ...p, account: card.account, chargeDate: charge });
    total += p.amount;
  }
  lines.push({ account: card.payFrom, date: charge, chargeDate: null, amount: total, description: card.payDescription });
}

/** Khatib family (Acre): deficit months improving to surplus after the advisor's first actions. */
export function khatib(): GenLine[] {
  const r = rng(7);
  const L: GenLine[] = [];
  const card: CardPlan = { account: "max", payFrom: "bank", payDescription: "מקס איט פיננסים", billingDay: 10 };
  const purchaseMonths = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  purchaseMonths.forEach((pm, i) => {
    const improve = i / (purchaseMonths.length - 1); // 0 → 1 over the period
    const p: Omit<GenLine, "account" | "chargeDate">[] = [];
    for (let w = 0; w < 4; w++) {
      p.push({ date: day(pm, 3 + w * 7), amount: -sh(Math.round((780 - 180 * improve) + r() * 120)), description: w % 2 ? "רמי לוי שיווק השקמה עכו" : "שופרסל דיל עכו" });
    }
    p.push({ date: day(pm, 6), amount: -sh(85 + Math.round(r() * 30)), description: "مخبز الأمل - عكا" });
    p.push({ date: day(pm, 13), amount: -sh(240 + Math.round(r() * 60)), description: "ملحمة أبو أحمد" });
    for (let f = 0; f < 3; f++) p.push({ date: day(pm, 5 + f * 9), amount: -sh(330 + Math.round(r() * 60)), description: f % 2 ? "דלק - תחנת עכו" : "פז כביש 4" });
    const restaurants = i < 3 ? 4 : 2;
    for (let x = 0; x < restaurants; x++) p.push({ date: day(pm, 8 + x * 5), amount: -sh(210 + Math.round(r() * 180)), description: x % 2 ? "مطعم الميناء" : "קפה לנדוור" });
    p.push({ date: day(pm, 2), amount: -sh(54.9), description: "NETFLIX.COM" });
    p.push({ date: day(pm, 2), amount: -sh(19.9), description: "SPOTIFY P1B2C3" });
    p.push({ date: day(pm, 4), amount: -sh(119), description: "פרטנר תקשורת" });
    if (i < 4) p.push({ date: day(pm, 18), amount: -sh(39.9), description: "APPLE.COM/BILL" }); // cancelled after advisor review
    p.push({ date: day(pm, 15), amount: -sh(300), description: "ACE עכו", installmentNumber: i + 2, installmentTotal: 12 });
    if (i === 1 || i === 4) p.push({ date: day(pm, 21), amount: -sh(420 + Math.round(r() * 200)), description: "קסטרו קניון עכו" });
    p.push({ date: day(pm, 11), amount: -sh(60 + Math.round(r() * 90)), description: "סופר-פארם עכו" });
    if (i === 2) p.push({ date: day(pm, 24), amount: -sh(1450), description: "חתונה - מתנה" }); // uncategorized → events/gifts by advisor
    // Second weekly shop (family of 4) — the biggest "leak" the advisor works on.
    for (let w = 0; w < 4; w++) p.push({ date: day(pm, 5 + w * 7), amount: -sh(Math.round(520 - 160 * improve + r() * 90)), description: "שופרסל אקספרס עכו" });
    const takeaway = i < 3 ? 7 : 3;
    for (let x = 0; x < takeaway; x++) p.push({ date: day(pm, 2 + x * 4), amount: -sh(Math.round(110 + r() * 70)), description: x % 2 ? "WOLT" : "תן ביס" });
    if (i < 4) p.push({ date: day(pm, 17), amount: -sh(Math.round(380 + r() * 300)), description: i % 2 ? "SHEIN.COM" : "ALIEXPRESS" });
    p.push({ date: day(pm, 1), amount: -sh(249), description: "הולמס פלייס מנוי" }); // gym nobody uses
    p.push({ date: day(pm, 19), amount: -sh(350), description: "IDIGITAL אייפון", installmentNumber: i + 3, installmentTotal: 24 });
    cardCycle(L, card, pm, p);
  });

  for (const pm of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) {
    const i = Number(pm.slice(5)) - 5;
    L.push({ account: "bank", date: day(pm, 10), chargeDate: null, amount: sh(9800), description: "משכורת - משרד החינוך" });
    L.push({ account: "bank", date: day(pm, 20), chargeDate: null, amount: sh(340), description: "ביטוח לאומי קצבת ילדים" });
    const jobs = 3 + Math.round(r() * 2);
    for (let j = 0; j < jobs; j++) L.push({ account: "bank", date: day(pm, 4 + j * 6), chargeDate: null, amount: sh(Math.round(3300 + r() * 1500)), description: "העברה - לקוח עבודות חשמל" });
    L.push({ account: "bank", date: day(pm, 1), chargeDate: null, amount: -sh(4200), description: "שכר דירה - הוראת קבע" });
    L.push({ account: "bank", date: day(pm, 15), chargeDate: null, amount: -sh(1350), description: "החזר הלוואה 4471" });
    L.push({ account: "bank", date: day(pm, 12), chargeDate: null, amount: -sh(520), description: "ארנונה עיריית עכו" });
    if (i % 2 === 0) L.push({ account: "bank", date: day(pm, 22), chargeDate: null, amount: -sh(Math.round(520 + r() * 220)), description: "חברת החשמל לישראל" });
    L.push({ account: "bank", date: day(pm, 25), chargeDate: null, amount: -sh(165), description: "הוט מובייל אינטרנט" });
    L.push({ account: "bank", date: day(pm, 1), chargeDate: null, amount: -sh(450), description: "צהרון עירוני" });
    L.push({ account: "bank", date: day(pm, 28), chargeDate: null, amount: -sh(29.9), description: "דמי ניהול חשבון" });
    if (i < 3) L.push({ account: "bank", date: day(pm, 28), chargeDate: null, amount: -sh(Math.round(70 + r() * 60)), description: "ריבית חובה" });
    if (i >= 4) L.push({ account: "bank", date: day(pm, 11), chargeDate: null, amount: -sh(1000), description: "העברה לחיסכון - הוראת קבע" });
    L.push({ account: "bank", date: day(pm, 5), chargeDate: null, amount: -sh(2450), description: "ליסינג פרטי - שלמה" });
    L.push({ account: "bank", date: day(pm, 3), chargeDate: null, amount: -sh(1300), description: "בית ספר פרטי - שכר לימוד" });
    L.push({ account: "bank", date: day(pm, 20), chargeDate: null, amount: -sh(650), description: "הראל ביטוח בריאות" });
    const cash = i < 3 ? 3 : 1;
    for (let c = 0; c < cash; c++) L.push({ account: "bank", date: day(pm, 7 + c * 8), chargeDate: null, amount: -sh(1000), description: "משיכת מזומן כספומט" });
  }
  // November so far (open month, not closed): includes lines the advisor has not categorized yet.
  L.push({ account: "bank", date: "2026-11-10", chargeDate: null, amount: sh(9800), description: "משכורת - משרד החינוך" });
  L.push({ account: "bank", date: "2026-11-01", chargeDate: null, amount: -sh(4200), description: "שכר דירה - הוראת קבע" });
  L.push({ account: "bank", date: "2026-11-06", chargeDate: null, amount: -sh(780), description: "תשלום למוסך אבו סאלח" });
  L.push({ account: "bank", date: "2026-11-09", chargeDate: null, amount: sh(4100), description: "העברה - לקוח עבודות חשמל" });
  return L;
}

/** Halabi family (Beit Jann): stable surplus, mortgage, rental unit, July vacation spike. */
export function halabi(): GenLine[] {
  const r = rng(11);
  const L: GenLine[] = [];
  const card: CardPlan = { account: "isracard", payFrom: "bank", payDescription: "ישראכרט חיוב חודשי", billingDay: 2 };
  ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].forEach((pm, i) => {
    const p: Omit<GenLine, "account" | "chargeDate">[] = [];
    for (let w = 0; w < 4; w++) p.push({ date: day(pm, 2 + w * 7), amount: -sh(Math.round(900 + r() * 250)), description: w % 2 ? "ויקטורי כרמיאל" : "שופרסל שלי כרמיאל" });
    for (let f = 0; f < 4; f++) p.push({ date: day(pm, 4 + f * 7), amount: -sh(Math.round(300 + r() * 80)), description: "סונול בית ג'ן" });
    p.push({ date: day(pm, 7), amount: -sh(54.9), description: "NETFLIX.COM" });
    p.push({ date: day(pm, 9), amount: -sh(Math.round(250 + r() * 300)), description: "מסעדה הדרוזית" });
    p.push({ date: day(pm, 16), amount: -sh(Math.round(120 + r() * 160)), description: "סופר-פארם כרמיאל" });
    if (i === 5) p.push({ date: day(pm, 12), amount: -sh(4800), description: "איסתא חופשה משפחתית" }); // charged in Oct → uncategorized → leisure
    if (i === 2) p.push({ date: day(pm, 20), amount: -sh(1900), description: "איקאה קריות" });
    for (let w = 0; w < 4; w++) p.push({ date: day(pm, 4 + w * 7), amount: -sh(Math.round(420 + r() * 160)), description: "ملحمة ومخبز الجبل" });
    for (let x = 0; x < 5; x++) p.push({ date: day(pm, 3 + x * 5), amount: -sh(Math.round(140 + r() * 80)), description: "WOLT" });
    p.push({ date: day(pm, 14), amount: -sh(Math.round(600 + r() * 500)), description: "קסטרו גרנד קניון" });
    if (i % 2 === 0) p.push({ date: day(pm, 23), amount: -sh(Math.round(800 + r() * 700)), description: "מתנה לחתונה - אולם הגליל" });
    cardCycle(L, card, pm, p);
  });
  for (const pm of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) {
    L.push({ account: "bank", date: day(pm, 1), chargeDate: null, amount: sh(21500), description: "משכורת צה\"ל" });
    L.push({ account: "bank", date: day(pm, 9), chargeDate: null, amount: sh(11200), description: "משכורת - מרכז רפואי גליל" });
    L.push({ account: "bank", date: day(pm, 5), chargeDate: null, amount: sh(2800), description: "שכ\"ד מדייר יחידת דיור" });
    L.push({ account: "bank", date: day(pm, 10), chargeDate: null, amount: -sh(5600), description: "משכנתא בנק דיסקונט למשכנתאות" });
    L.push({ account: "bank", date: day(pm, 12), chargeDate: null, amount: -sh(610), description: "ארנונה מועצה מקומית" });
    L.push({ account: "bank", date: day(pm, 20), chargeDate: null, amount: -sh(1180), description: "הראל ביטוח בריאות וחיים" });
    L.push({ account: "bank", date: day(pm, 15), chargeDate: null, amount: -sh(1250), description: "חוג רובוטיקה ומורה פרטי" });
    L.push({ account: "bank", date: day(pm, 18), chargeDate: null, amount: -sh(Math.round(380 + r() * 140)), description: "חברת החשמל לישראל" });
    L.push({ account: "bank", date: day(pm, 25), chargeDate: null, amount: -sh(189), description: "בזק בינלאומי" });
    L.push({ account: "bank", date: day(pm, 11), chargeDate: null, amount: -sh(3000), description: "העברה לחיסכון - קופת גמל להשקעה" });
    L.push({ account: "bank", date: day(pm, 5), chargeDate: null, amount: -sh(2600), description: "ליסינג תפעולי - רכב 1" });
    L.push({ account: "bank", date: day(pm, 5), chargeDate: null, amount: -sh(2150), description: "ליסינג פרטי - רכב 2" });
    L.push({ account: "bank", date: day(pm, 3), chargeDate: null, amount: -sh(1900), description: "בית ספר פרטי ומעונות" });
    L.push({ account: "bank", date: day(pm, 16), chargeDate: null, amount: -sh(2000), description: "משיכת מזומן כספומט" });
    L.push({ account: "bank", date: day(pm, 26), chargeDate: null, amount: -sh(1200), description: "החזר הלוואה לשיפוץ" });
  }
  return L;
}

/** Osman family: deficits, statements stop after August (missing update). */
export function osman(): GenLine[] {
  const r = rng(23);
  const L: GenLine[] = [];
  for (const pm of ["2026-06", "2026-07", "2026-08"]) {
    L.push({ account: "bank", date: day(pm, 9), chargeDate: null, amount: sh(14100), description: "משכורת - מפעל אלומיניום" });
    L.push({ account: "bank", date: day(pm, 18), chargeDate: null, amount: sh(Math.round(4000 + r() * 800)), description: "העברה - עבודה פרטית" });
    L.push({ account: "bank", date: day(pm, 1), chargeDate: null, amount: -sh(3900), description: "שכר דירה" });
    L.push({ account: "bank", date: day(pm, 14), chargeDate: null, amount: -sh(2350), description: "החזר הלוואה רכב" });
    L.push({ account: "bank", date: day(pm, 15), chargeDate: null, amount: -sh(1600), description: "החזר הלוואה צרכנית" });
    L.push({ account: "bank", date: day(pm, 28), chargeDate: null, amount: -sh(Math.round(160 + r() * 90)), description: "ריבית חובה" });
    for (let w = 0; w < 4; w++) L.push({ account: "bank", date: day(pm, 3 + w * 7), chargeDate: null, amount: -sh(Math.round(1100 + r() * 300)), description: w % 2 ? "ملحمة الكرمل" : "רמי לוי כרמיאל" });
    L.push({ account: "bank", date: day(pm, 20), chargeDate: null, amount: -sh(Math.round(2600 + r() * 900)), description: "משיכת מזומן כספומט" });
    L.push({ account: "bank", date: day(pm, 6), chargeDate: null, amount: -sh(Math.round(1400 + r() * 500)), description: "משיכת מזומן כספומט" });
    L.push({ account: "bank", date: day(pm, 12), chargeDate: null, amount: -sh(380), description: "פרטנר תקשורת" });
    L.push({ account: "bank", date: day(pm, 22), chargeDate: null, amount: -sh(Math.round(900 + r() * 400)), description: "פז מג'ד אל כרום" });
    L.push({ account: "bank", date: day(pm, 25), chargeDate: null, amount: -sh(Math.round(700 + r() * 300)), description: "مطعم ومشاوي الجليل" });
  }
  return L;
}
