import { z } from "zod";

/** Value schema per advisory parameter. Unknown keys are rejected (no free-form config). */
const ppm = z.number().int().min(0).max(1_000_000);
export const ADVISORY_SCHEMAS: Record<string, z.ZodType> = {
  "monthly_close.grace_days": z.number().int().min(0).max(28),
  "dashboard.trend_flat_threshold_ppm": ppm,
  "emergency_fund.months": z.object({ min: z.number().int().min(0).max(24), target: z.number().int().min(1).max(36) }).refine((v) => v.target >= v.min),
  "debt.expensive_threshold_ppm": ppm.nullable(),
  "health_score.weights": z
    .object({ savingsRate: z.number().int().min(0), emergencyFund: z.number().int().min(0), debtLoad: z.number().int().min(0), fixedCostRatio: z.number().int().min(0) })
    .refine((w) => w.savingsRate + w.emergencyFund + w.debtLoad + w.fixedCostRatio === 100, "weights must sum to 100"),
  "health_score.targets": z
    .object({ savingsRateGoodPpm: ppm.min(1), fixedCostRatioGoodPpm: ppm, fixedCostRatioBadPpm: ppm, emergencyFundGoodMonths: z.number().int().min(1).max(36) })
    .refine((t) => t.fixedCostRatioBadPpm > t.fixedCostRatioGoodPpm, "bad must be above good"),
  "recurring.detection": z.object({ minMonths: z.number().int().min(2).max(12), tolerancePpm: ppm, lookbackMonths: z.number().int().min(3).max(24) }),
  "highlights.thresholds": z.object({ minChangePpm: ppm, minChangeAgorot: z.number().int().min(0), max: z.number().int().min(1).max(20) }),
  "retirement.defaults": z
    .object({
      retirementAge: z.number().int().min(50).max(80),
      conservativeReturnPpm: z.number().int().min(-50_000).max(150_000),
      baseReturnPpm: z.number().int().min(-50_000).max(150_000),
      optimisticReturnPpm: z.number().int().min(-50_000).max(150_000),
      depositGrowthPpm: z.number().int().min(-50_000).max(100_000),
      annuityFactorMilli: z.number().int().min(50_000).max(400_000),
    })
    .refine((v) => v.conservativeReturnPpm <= v.baseReturnPpm && v.baseReturnPpm <= v.optimisticReturnPpm, "scenarios must be ordered"),
  "cashflow.calendar": z.object({ lookbackMonths: z.number().int().min(2).max(12), minMonths: z.number().int().min(2).max(12), projectionDays: z.number().int().min(7).max(92) }),
};
