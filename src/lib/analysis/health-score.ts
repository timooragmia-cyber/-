/**
 * Financial health score — transparent by design: every component, its input, its 0–100
 * sub-score and its weight are returned and shown. Weights and targets come from
 * AdvisoryParameter ("health_score.weights", "health_score.targets").
 * Components whose data is not collected yet (emergency fund → Phase 2 balances,
 * debt load → Phase 4) are reported as UNAVAILABLE and the remaining weights are
 * re-normalized, so the score is never computed from guessed data.
 */
export type HealthWeights = { savingsRate: number; emergencyFund: number; debtLoad: number; fixedCostRatio: number };
export type HealthTargets = {
  /** savings rate at or above this scores 100; ≤ 0 scores 0 (linear in between). */
  savingsRateGoodPpm: number;
  /** fixed-cost ratio at or below "good" scores 100; at or above "bad" scores 0. */
  fixedCostRatioGoodPpm: number;
  fixedCostRatioBadPpm: number;
  /** months of expenses covered by liquid savings for a score of 100. */
  emergencyFundGoodMonths: number;
};

export type HealthInputs = {
  /** Average over the closed months considered (null = not enough data). */
  savingsRatePpm: number | null;
  fixedCostRatioPpm: number | null;
  emergencyFundMonths: number | null; // Phase 2
  debtServiceRatioPpm: number | null; // Phase 4
};

export type HealthComponent = {
  key: keyof HealthWeights;
  weight: number;
  input: number | null;
  score: number | null; // 0..100, null = unavailable
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function computeHealthScore(inputs: HealthInputs, w: HealthWeights, t: HealthTargets): { score: number | null; components: HealthComponent[] } {
  const components: HealthComponent[] = [
    {
      key: "savingsRate",
      weight: w.savingsRate,
      input: inputs.savingsRatePpm,
      score: inputs.savingsRatePpm === null ? null : clamp(Math.round((inputs.savingsRatePpm / t.savingsRateGoodPpm) * 100)),
    },
    {
      key: "fixedCostRatio",
      weight: w.fixedCostRatio,
      input: inputs.fixedCostRatioPpm,
      score:
        inputs.fixedCostRatioPpm === null
          ? null
          : clamp(Math.round(((t.fixedCostRatioBadPpm - inputs.fixedCostRatioPpm) / (t.fixedCostRatioBadPpm - t.fixedCostRatioGoodPpm)) * 100)),
    },
    {
      key: "emergencyFund",
      weight: w.emergencyFund,
      input: inputs.emergencyFundMonths,
      score: inputs.emergencyFundMonths === null ? null : clamp(Math.round((inputs.emergencyFundMonths / t.emergencyFundGoodMonths) * 100)),
    },
    { key: "debtLoad", weight: w.debtLoad, input: inputs.debtServiceRatioPpm, score: null },
  ];
  const available = components.filter((c) => c.score !== null && c.weight > 0);
  const totalWeight = available.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return { score: null, components };
  const score = Math.round(available.reduce((s, c) => s + c.score! * c.weight, 0) / totalWeight);
  return { score, components };
}
