/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EventTimeline, {
  type TimelineItem,
} from "@/components/market-pulse/EventTimeline";

const timelineItems: TimelineItem[] = [
  {
    id: "classification-1",
    time: "2026-04-18T12:10:00.000Z",
    level: "candle",
    title: "Buyers defended the opening dip.",
    detail: "buyers control · medium significance · watch",
    tone: "buyers",
  },
  {
    id: "classification-2",
    time: "2026-04-18T12:15:00.000Z",
    level: "sequence",
    title: "Buyers held control across the sequence.",
    detail: "buyers control · high significance · actionable",
    tone: "buyers",
  },
  {
    id: "correlation-1",
    time: "2026-04-18T12:20:00.000Z",
    level: "news",
    title: "AI headline lifted sentiment.",
    detail: "84% confidence · bullish",
    tone: "catalyst",
  },
];

describe("EventTimeline", () => {
  it("filters items by level and falls back to a visible selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <EventTimeline
        items={timelineItems}
        selectedId="classification-1"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Catalyst" }));

    expect(screen.getByText("AI headline lifted sentiment.")).toBeTruthy();
    expect(screen.queryByText("Buyers defended the opening dip.")).toBeNull();
    expect(onSelect).toHaveBeenCalledWith("correlation-1");
  });
});
