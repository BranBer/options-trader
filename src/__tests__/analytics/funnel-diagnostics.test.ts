import { describe, expect, it } from "vitest";
import { buildAttributionDiagnostics } from "@/lib/analytics/funnel-diagnostics";

describe("buildAttributionDiagnostics", () => {
  it("builds funnel counters from whales, evaluations, and missed reasons", () => {
    const diagnostics = buildAttributionDiagnostics({
      whales: [
        { qualityScore: 80 },
        { qualityScore: 40 },
        { qualityScore: 75 },
      ],
      evaluations: [
        {
          ticker: "NVDA",
          shouldEnter: false,
          rejectionGate: "llm_eval",
          rejectionReason: "confidence too low",
          createdAt: "2026-04-02T12:00:00.000Z",
        },
        {
          ticker: "AAPL",
          shouldEnter: true,
          rejectionGate: null,
          rejectionReason: null,
          createdAt: "2026-04-02T12:01:00.000Z",
        },
        {
          ticker: "TSLA",
          shouldEnter: false,
          rejectionGate: "concentration",
          rejectionReason: "Directional concentration",
          createdAt: "2026-04-02T12:02:00.000Z",
        },
      ],
      missed: [
        { ticker: "SPY", missReason: "pipeline_not_run" },
        { ticker: "AMD", missReason: "position_size_limit" },
      ],
    });

    expect(diagnostics.funnel.detected).toBe(3);
    expect(diagnostics.funnel.qualityPassed).toBe(2);
    expect(diagnostics.funnel.evaluated).toBe(3);
    expect(diagnostics.funnel.llmAccepted).toBe(1);
    expect(diagnostics.funnel.entered).toBe(1);
    expect(diagnostics.funnel.droppedByStage.entryDecision).toBe(1);
    expect(diagnostics.funnel.droppedByStage.riskCheck).toBe(1);
    expect(diagnostics.funnel.droppedByStage.tradeOpen).toBe(1);
    expect(diagnostics.funnel.droppedByStage.pipeline).toBe(1);
  });

  it("returns recent decision traces with readable stages", () => {
    const diagnostics = buildAttributionDiagnostics({
      whales: [],
      evaluations: [
        {
          ticker: "MSFT",
          shouldEnter: false,
          rejectionGate: "iv_environment",
          rejectionReason: "Options overpriced",
          createdAt: "2026-04-02T12:03:00.000Z",
        },
      ],
      missed: [],
    });

    expect(diagnostics.recentDecisions).toHaveLength(1);
    expect(diagnostics.recentDecisions[0]).toMatchObject({
      ticker: "MSFT",
      outcome: "rejected",
      stage: "IV environment",
    });
  });
});
