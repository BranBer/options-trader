import { describe, expect, it } from "vitest";
import {
  candleTimeToSeconds,
  resolveTriggerMarkerTime,
} from "@/components/charts/PriceChart";

describe("PriceChart trigger marker resolution", () => {
  it("keeps exact timestamp matches on daily ranges", () => {
    const candleTimes = [
      candleTimeToSeconds("2026-04-10"),
      candleTimeToSeconds("2026-04-11"),
      candleTimeToSeconds("2026-04-12"),
    ];

    expect(resolveTriggerMarkerTime(candleTimes[1], candleTimes, "3mo")).toBe(
      candleTimes[1],
    );
  });

  it("does not snap across days on daily ranges", () => {
    const candleTimes = [
      candleTimeToSeconds("2026-04-10"),
      candleTimeToSeconds("2026-04-11"),
      candleTimeToSeconds("2026-04-12"),
    ];
    const triggerTime = candleTimeToSeconds("2026-04-13");

    expect(
      resolveTriggerMarkerTime(triggerTime, candleTimes, "3mo"),
    ).toBeNull();
  });

  it("snaps a daily trigger to the nearest intraday candle on 1d", () => {
    const triggerTime = candleTimeToSeconds("2026-04-15");
    const candleTimes = [1776245400, 1776247200, 1776250800, 1776254400];

    expect(resolveTriggerMarkerTime(triggerTime, candleTimes, "1d")).toBe(
      1776245400,
    );
  });

  it("snaps a daily trigger to the nearest hourly candle on 1wk", () => {
    const triggerTime = candleTimeToSeconds("2026-04-15");
    const candleTimes = [1776243600, 1776247200, 1776250800];

    expect(resolveTriggerMarkerTime(triggerTime, candleTimes, "1wk")).toBe(
      1776243600,
    );
  });

  it("does not snap when the intraday series has no candle on that day", () => {
    const triggerTime = candleTimeToSeconds("2026-04-15");
    const candleTimes = [1776157200, 1776160800, 1776164400];

    expect(resolveTriggerMarkerTime(triggerTime, candleTimes, "1d")).toBeNull();
  });
});
