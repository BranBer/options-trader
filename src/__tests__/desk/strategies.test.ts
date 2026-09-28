import { describe, expect, it } from "vitest";
import {
  computeForwardStats,
  computeStatus,
  ironFlyCloseCost,
  ironFlyCredit,
  ironFlyReturn,
  ironFlyRisk,
  ironFlyWings,
  ivProxy,
  LIVE_CRITERIA,
  nearestStrike,
  pickRecTrendContract,
  selectCheapVolCandidates,
  straddleDebit,
  straddleExitValue,
  tpSlExitReason,
  trendAgrees,
  trendVs10DayAverage,
  type CheapVolCandidate,
} from "@/lib/desk/strategies";
import { payoffGridMaxLoss, type PayoffLeg } from "@/lib/desk/market";

describe("earnings_iron_fly math", () => {
  it("computes credit as the straddle sold minus the wings bought, at half-spread cost", () => {
    // straddle closes 5+5=10, wings 1+1=2, h=0.02
    const credit = ironFlyCredit(5, 5, 1, 1, 0.02);
    expect(credit).toBeCloseTo((5 + 5) * 0.98 - (1 + 1) * 1.02, 6);
    expect(credit).toBeGreaterThan(0);
  });

  it("selects wings at the first/last listed strikes >=/<= K +/- 1.25x the straddle", () => {
    const strikes = [90, 95, 100, 105, 110, 115, 120];
    // K=100, straddle=8 -> 1.25*8=10 -> call wing >= 110, put wing <= 90
    const { callWing, putWing } = ironFlyWings(strikes, 100, 8);
    expect(callWing).toBe(110);
    expect(putWing).toBe(90);
  });

  it("returns null wings when no listed strike is far enough away", () => {
    const strikes = [99, 100, 101];
    const { callWing, putWing } = ironFlyWings(strikes, 100, 8);
    expect(callWing).toBeNull();
    expect(putWing).toBeNull();
  });

  it("risk is the wider wing's width minus the credit collected", () => {
    // K=100, callWing=110 (width 10), putWing=92 (width 8) -> wider is 10
    const credit = 3;
    const risk = ironFlyRisk(100, 110, 92, credit);
    expect(risk).toBe(10 - credit);
  });

  it("close cost buys back the straddle and sells the wings, at half-spread cost", () => {
    const cost = ironFlyCloseCost(6, 6, 0.5, 0.5, 0.02, false);
    expect(cost).toBeCloseTo((6 + 6) * 1.02 - (0.5 + 0.5) * 0.98, 6);
  });

  it("settling at/after expiry uses intrinsic value with no cost", () => {
    const cost = ironFlyCloseCost(4, 0, 2, 0, 0.02, true);
    expect(cost).toBe(4 + 0 - 2 - 0);
  });

  it("floors the return at -1 — a defined-risk credit spread cannot lose more than its risk", () => {
    // credit collected 2, but closing costs 50 (stale-data blowup) against a risk of 10
    const ret = ironFlyReturn(2, 50, 10);
    expect(ret).toBe(-1);
  });

  it("returns the normal (credit - closeCost)/risk when within bounds", () => {
    const ret = ironFlyReturn(3, 1, 10);
    expect(ret).toBeCloseTo((3 - 1) / 10, 6);
  });
});

describe("nearestStrike", () => {
  it("picks the closest listed strike to the target", () => {
    expect(nearestStrike([90, 95, 100, 105], 97)).toBe(95);
    expect(nearestStrike([90, 95, 100, 105], 103)).toBe(105);
  });

  it("returns null for an empty strike list", () => {
    expect(nearestStrike([], 100)).toBeNull();
  });
});

describe("cheap_vol_straddle math", () => {
  it("computes an IV proxy from the ATM straddle price", () => {
    const iv = ivProxy(10, 100, 30 / 365);
    expect(iv).toBeCloseTo(10 / (0.8 * 100 * Math.sqrt(30 / 365)), 6);
  });

  it("debit is the straddle bought at half-spread cost; exit value is the straddle sold at half-spread cost", () => {
    expect(straddleDebit(3, 4, 0.02)).toBeCloseTo((3 + 4) * 1.02, 6);
    expect(straddleExitValue(2, 3, 0.02)).toBeCloseTo((2 + 3) * 0.98, 6);
  });

  it("selects the top decile of candidates by HV/IV ratio, at least 1 when >=5 priced, at most 6", () => {
    const rows: CheapVolCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      ticker: `T${i}`,
      hv20: 0.3,
      iv: 0.2,
      ratio: i, // 0..19, higher = cheaper (more attractive)
    }));
    const selected = selectCheapVolCandidates(rows);
    // 10% of 20 = 2
    expect(selected).toHaveLength(2);
    expect(selected[0].ticker).toBe("T19");
    expect(selected[1].ticker).toBe("T18");
  });

  it("selects at least 1 when there are >=5 priced candidates but the decile rounds to 0", () => {
    const rows: CheapVolCandidate[] = Array.from({ length: 5 }, (_, i) => ({
      ticker: `T${i}`,
      hv20: 0.3,
      iv: 0.2,
      ratio: i,
    }));
    const selected = selectCheapVolCandidates(rows);
    expect(selected.length).toBeGreaterThanOrEqual(1);
  });

  it("never selects more than 6 candidates", () => {
    const rows: CheapVolCandidate[] = Array.from({ length: 100 }, (_, i) => ({
      ticker: `T${i}`,
      hv20: 0.3,
      iv: 0.2,
      ratio: i,
    }));
    const selected = selectCheapVolCandidates(rows);
    expect(selected.length).toBeLessThanOrEqual(6);
  });

  it("returns nothing for an empty candidate list", () => {
    expect(selectCheapVolCandidates([])).toEqual([]);
  });
});

describe("credit-structure max loss via the payoff grid", () => {
  it("computes max loss for a bounded credit spread (short call vertical)", () => {
    // Sold 100C, bought 110C for a net credit of 3 -> v0 = -3, max loss = width(10) - credit(3) = 7
    const legs: PayoffLeg[] = [
      { side: -1, qty: 1, cp: "C", strike: 100 },
      { side: 1, qty: 1, cp: "C", strike: 110 },
    ];
    const v0 = -3;
    expect(payoffGridMaxLoss(legs, v0)).toBeCloseTo(7, 6);
  });

  it("is unbounded (Infinity) for a naked short call with no covering long call", () => {
    const legs: PayoffLeg[] = [{ side: -1, qty: 1, cp: "C", strike: 100 }];
    expect(payoffGridMaxLoss(legs, -3)).toBe(Infinity);
  });

  it("is bounded for a naked short put (loss capped at the strike)", () => {
    const legs: PayoffLeg[] = [{ side: -1, qty: 1, cp: "P", strike: 100 }];
    const v0 = -3;
    // worst case: underlying -> 0, payoff = -100, loss = -100 - (-3) = -97 magnitude
    expect(payoffGridMaxLoss(legs, v0)).toBeCloseTo(97, 6);
  });
});

describe("exit timing helper", () => {
  it("triggers take-profit at +50%", () => {
    expect(tpSlExitReason(0.5, 1, 10)).toBe("take-profit");
    expect(tpSlExitReason(0.6, 1, 10)).toBe("take-profit");
  });

  it("triggers stop-loss at -50%", () => {
    expect(tpSlExitReason(-0.5, 1, 10)).toBe("stop-loss");
  });

  it("triggers the time cap after N sessions with no TP/SL hit", () => {
    expect(tpSlExitReason(0.1, 10, 10)).toBe("time-cap");
  });

  it("does not exit before TP/SL/cap", () => {
    expect(tpSlExitReason(0.1, 3, 10)).toBeNull();
  });
});

describe("status computation", () => {
  it("marks a non-control strategy live-eligible once it clears the bar", () => {
    const forward = computeForwardStats(
      Array.from({ length: 61 }, () => 0.05),
      Array.from({ length: 61 }, () => 5),
      0,
    );
    expect(forward.tStat).not.toBeNull();
    expect(computeStatus("earnings_iron_fly", forward)).toBe("live-eligible");
  });

  it("keeps a non-control strategy on paper below the closed-trade floor", () => {
    const forward = computeForwardStats([0.05, 0.05, 0.05], [5, 5, 5], 0);
    expect(computeStatus("earnings_iron_fly", forward)).toBe("paper");
  });

  it("keeps a non-control strategy on paper when the mean is negative", () => {
    const rets = Array.from({ length: 61 }, () => -0.05);
    const forward = computeForwardStats(rets, rets.map(() => -5), 0);
    expect(computeStatus("cheap_vol_straddle", forward)).toBe("paper");
  });

  it("never promotes a control strategy, even with a strong forward record", () => {
    const rets = Array.from({ length: 200 }, () => 0.1);
    const forward = computeForwardStats(rets, rets.map(() => 10), 0);
    expect(forward.tStat).not.toBeNull();
    expect(computeStatus("whale_follow", forward)).toBe("paper");
    expect(computeStatus("llm_recommendation", forward)).toBe("paper");
  });

  it("reports null stats with zero closed trades", () => {
    const forward = computeForwardStats([], [], 4);
    expect(forward.closed).toBe(0);
    expect(forward.open).toBe(4);
    expect(forward.meanRet).toBeNull();
    expect(forward.tStat).toBeNull();
    expect(forward.totalPnl).toBe(0);
  });

  it("live criteria match the pre-registered rule", () => {
    expect(LIVE_CRITERIA.minClosedTrades).toBe(60);
    expect(LIVE_CRITERIA.minTStat).toBe(2);
  });
});

describe("rec_trend rules", () => {
  it("measures QQQ against its 10-session average and needs 10 closes", () => {
    expect(trendVs10DayAverage([1, 2, 3])).toBeNull();
    // 10 closes 1..10: average 5.5, last 10 → +4.5
    expect(trendVs10DayAverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(4.5);
  });

  it("only agrees when the recommendation and the trend point the same way", () => {
    expect(trendAgrees("bullish", 2)).toBe(true);
    expect(trendAgrees("bullish", -2)).toBe(false);
    expect(trendAgrees("bearish", -2)).toBe(true);
    expect(trendAgrees("neutral", 2)).toBe(false);
    expect(trendAgrees("bullish", null)).toBe(false);
  });

  it("picks the expiry closest to 10 days out, then the strike nearest the stock", () => {
    const chain = [
      { expiry: "2026-10-02", strike: 100 },
      { expiry: "2026-10-09", strike: 100 },
      { expiry: "2026-10-09", strike: 105 },
      { expiry: "2026-10-16", strike: 104 },
    ];
    // asOf 2026-09-28 → target 2026-10-08, so 10-09 wins; spot 104 → strike 105 beats 100
    expect(pickRecTrendContract(chain, 104, "2026-09-28")).toEqual({ expiry: "2026-10-09", strike: 105 });
    expect(pickRecTrendContract([], 104, "2026-09-28")).toBeNull();
  });

  it("is a promotable candidate, not a control", () => {
    const passing = computeForwardStats(Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? -0.2 : 0.6)), [], 0);
    expect(computeStatus("rec_trend", passing)).toBe("live-eligible");
  });

  it("lets winners run to +100% before taking profit", () => {
    expect(tpSlExitReason(0.8, 2, 5, 1.0, -0.5)).toBeNull();
    expect(tpSlExitReason(1.05, 2, 5, 1.0, -0.5)).toBe("take-profit");
    expect(tpSlExitReason(-0.55, 2, 5, 1.0, -0.5)).toBe("stop-loss");
    expect(tpSlExitReason(0.1, 5, 5, 1.0, -0.5)).toBe("time-cap");
  });
});
