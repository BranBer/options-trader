import type { TechnicalPattern } from "@/types/analysis";

function hasTaggedTechnicalPatterns(patterns: unknown): boolean {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    const timeframe = (pattern as TechnicalPattern | null)?.timeframe;
    return typeof timeframe === "string" && timeframe.length > 0;
  });
}

export function isTimeframeAwareDeepDiveOutput(output: string | null | undefined): boolean {
  if (!output) {
    return false;
  }

  try {
    const parsed = JSON.parse(output) as {
      timeframe_patterns?: unknown;
      technical_patterns?: unknown;
    };

    if (
      parsed.timeframe_patterns &&
      typeof parsed.timeframe_patterns === "object" &&
      !Array.isArray(parsed.timeframe_patterns)
    ) {
      return true;
    }

    return hasTaggedTechnicalPatterns(parsed.technical_patterns);
  } catch {
    return false;
  }
}