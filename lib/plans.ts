export type PlanName = "starter" | "growth" | "scale" | "enterprise";

export const PLAN_LIMITS: Record<Exclude<PlanName, "enterprise">, number> = {
  starter: 50,
  growth: 150,
  scale: 500,
};

export function isPlanName(value: string): value is PlanName {
  return ["starter", "growth", "scale", "enterprise"].includes(value);
}

export function deriveUserLimit(planName: PlanName, userLimit?: number | null) {
  if (planName === "enterprise") {
    if (!userLimit || userLimit < 501) {
      throw new Error("Enterprise plan requires a custom userLimit of 501 or higher.");
    }
    return userLimit;
  }

  const limit = PLAN_LIMITS[planName];
  return limit;
}
