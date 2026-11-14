/**
 * Extract installment info ("תשלום 3 מתוך 12", "3 מ-12", "3/12", "قسط 3 من 12").
 * Returns null when the text is not an installment marker.
 */
export function parseInstallment(
  text: string | undefined | null,
  opts: { allowBareSlash?: boolean } = {},
): { number: number; total: number } | null {
  if (!text) return null;
  const s = text.replace(/\s+/g, " ");
  const patterns = [
    /תשלום\s*(\d{1,3})\s*(?:מתוך|מ-|מ)\s*(\d{1,3})/,
    /(\d{1,3})\s*(?:מתוך|מ-)\s*(\d{1,3})/,
    /(?:قسط|دفعة)\s*(\d{1,3})\s*من\s*(\d{1,3})/,
    // "3/12" is only trusted inside a dedicated installment column: in free text it is
    // usually a date ("שופרסל 05/10").
    ...(opts.allowBareSlash ? [/^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/] : []),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const n = Number(m[1]);
      const t = Number(m[2]);
      if (n >= 1 && t >= 2 && n <= t && t <= 120) return { number: n, total: t };
    }
  }
  return null;
}
