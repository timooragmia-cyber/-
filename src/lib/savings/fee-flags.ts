export type FeeBenchmarkRow = { productType: string; feeBase: "DEPOSITS" | "ACCUMULATION"; benchmarkPpm: number | null; legalCeilingPpm: number | null; status: "VERIFIED" | "UNVERIFIED" | "MISSING" };

export type FeeFlag = {
  feeBase: "DEPOSITS" | "ACCUMULATION";
  actualPpm: number;
  benchmarkPpm: number | null;
  ceilingPpm: number | null;
  /** ABOVE_CEILING usually means a data-entry error — or a real compliance issue. */
  level: "ABOVE_CEILING" | "ABOVE_BENCHMARK" | "OK" | "NO_BENCHMARK";
  /** actual − benchmark (ppm), when above benchmark. */
  gapPpm: number;
  configStatus: FeeBenchmarkRow["status"] | "NONE";
};

/** Compare a product's actual fees with the configured benchmark and legal ceiling. */
export function feeFlags(productType: string, actual: { dep: number; acc: number }, rows: readonly FeeBenchmarkRow[]): FeeFlag[] {
  return (["DEPOSITS", "ACCUMULATION"] as const).map((feeBase) => {
    const row = rows.find((r) => r.productType === productType && r.feeBase === feeBase);
    const actualPpm = feeBase === "DEPOSITS" ? actual.dep : actual.acc;
    const benchmarkPpm = row?.benchmarkPpm ?? null;
    const ceilingPpm = row?.legalCeilingPpm ?? null;
    let level: FeeFlag["level"] = "NO_BENCHMARK";
    if (ceilingPpm !== null && actualPpm > ceilingPpm) level = "ABOVE_CEILING";
    else if (benchmarkPpm !== null) level = actualPpm > benchmarkPpm ? "ABOVE_BENCHMARK" : "OK";
    return { feeBase, actualPpm, benchmarkPpm, ceilingPpm, level, gapPpm: benchmarkPpm !== null && actualPpm > benchmarkPpm ? actualPpm - benchmarkPpm : 0, configStatus: row?.status ?? "NONE" };
  });
}

/** The fee the simulator should target: the benchmark when lower than actual, else actual. */
export function targetFees(actual: { dep: number; acc: number }, flags: FeeFlag[]): { dep: number; acc: number } {
  const t = (base: "DEPOSITS" | "ACCUMULATION", a: number) => {
    const f = flags.find((x) => x.feeBase === base);
    return f && f.benchmarkPpm !== null && f.benchmarkPpm < a ? f.benchmarkPpm : a;
  };
  return { dep: t("DEPOSITS", actual.dep), acc: t("ACCUMULATION", actual.acc) };
}
