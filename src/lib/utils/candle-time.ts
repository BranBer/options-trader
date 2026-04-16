import type { Candle } from "./technical-indicators";

export function normalizeCandleTimeMs(time: Candle["time"]): number {
  if (typeof time === "number") {
    return time > 10_000_000_000 ? time : time * 1000;
  }

  return new Date(time).getTime();
}
