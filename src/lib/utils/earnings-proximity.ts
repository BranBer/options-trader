export interface EarningsProximity {
  earningsDate: string | null;
  daysToEarnings: number | null;
  earningsBeforeExpiry: boolean;
  ivCrushRisk: "high" | "moderate" | "low" | "none";
}

export function getEarningsProximity(
  earningsDate: string | null,
  optionExpiry?: string,
): EarningsProximity {
  if (!earningsDate) {
    return {
      earningsDate: null,
      daysToEarnings: null,
      earningsBeforeExpiry: false,
      ivCrushRisk: "none",
    };
  }

  const now = new Date();
  const earnings = new Date(earningsDate);
  const daysToEarnings = Math.ceil(
    (earnings.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  // If earnings already passed, no crush risk going forward
  if (daysToEarnings < 0) {
    return {
      earningsDate,
      daysToEarnings,
      earningsBeforeExpiry: false,
      ivCrushRisk: "none",
    };
  }

  let earningsBeforeExpiry = false;
  if (optionExpiry) {
    const expiry = new Date(optionExpiry);
    earningsBeforeExpiry = earnings.getTime() < expiry.getTime();
  }

  let ivCrushRisk: EarningsProximity["ivCrushRisk"];
  if (daysToEarnings <= 3) ivCrushRisk = "high";
  else if (daysToEarnings <= 7) ivCrushRisk = "moderate";
  else ivCrushRisk = "low";

  return { earningsDate, daysToEarnings, earningsBeforeExpiry, ivCrushRisk };
}
