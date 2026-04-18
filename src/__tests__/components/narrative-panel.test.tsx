/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import NarrativePanel from "@/components/market-pulse/NarrativePanel";

describe("NarrativePanel", () => {
  it("shows high-confidence catalyst context and links to prior narratives", () => {
    render(
      <NarrativePanel
        narrative={{
          currentControl: "buyers",
          controlStrength: 7,
          marketPhase: "trend",
          expectedBehavior: "continuation",
          narrativeSummary:
            "Buyers absorbed the dip, reclaimed intraday control, and kept the tape trending higher into midday.",
          keyConflicts: [
            "Momentum improved, but volume confirmation stayed uneven.",
          ],
          confidenceInAssessment: 0.82,
          createdAt: "2026-04-18T12:15:00.000Z",
        }}
        correlations={[
          {
            id: 1,
            candleTime: "2026-04-18T12:15:00.000Z",
            priceEvent: "buyers reclaimed the opening range",
            externalEventType: "news",
            externalEventSummary: "Analyst upgrade lifted semiconductor peers.",
            correlationConfidence: 0.88,
            sentiment: "bullish",
            reasoning: "The timing lined up with sector-wide upside momentum.",
            externalEventPayload: null,
          },
          {
            id: 2,
            candleTime: "2026-04-18T12:00:00.000Z",
            priceEvent: "buyers defended the open",
            externalEventType: "news",
            externalEventSummary: "Low-confidence rumor flow.",
            correlationConfidence: 0.41,
            sentiment: "neutral",
            reasoning: null,
            externalEventPayload: null,
          },
        ]}
        runHistoryHref="#market-pulse-runs-aapl"
      />,
    );

    expect(screen.getByText("Catalyst Context")).toBeTruthy();
    expect(
      screen.getByText(
        "Correlated with: Analyst upgrade lifted semiconductor peers. (88% confidence)",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Low-confidence rumor flow.")).toBeNull();

    const generatedAt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date("2026-04-18T12:15:00.000Z"));

    expect(screen.getByText(`Generated ${generatedAt}`)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /view prior narratives/i })
        .getAttribute("href"),
    ).toBe("#market-pulse-runs-aapl");
  });
});
