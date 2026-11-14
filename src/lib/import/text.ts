/** Text normalization shared by dedup, categorization and recurring detection. */

const NIQQUD_TASHKEEL = /[֑-ׇؐ-ًؚ-ٰٟۖ-ۭ]/g;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(BIDI, "")
    .replace(NIQQUD_TASHKEEL, "")
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’`]/g, "'")
    .replace(/ـ/g, "") // Arabic tatweel
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A stable "merchant identity": normalized text without digits, dates, branch numbers and
 * punctuation. "שופרסל דיל 123 כרמיאל 05/10" → "שופרסל דיל כרמיאל".
 */
export function merchantKey(description: string): string {
  return normalizeText(description.split(" | ")[0] ?? description)
    .replace(/\d+[/.\-]\d+([/.\-]\d+)?/g, " ")
    .replace(/[0-9٠-٩]+/g, " ")
    .replace(/[^\p{L}\s'"&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
