import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRedditHype } from "@/lib/services/hype-fetcher";

const page = (results: unknown[]) =>
  new Response(JSON.stringify({ count: results.length, pages: 1, current_page: 1, results }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("fetchRedditHype", () => {
  it("maps ApeWisdom rows and coerces numeric strings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([
      { rank: 3, ticker: "MU", name: "Micron Technology", mentions: "30", upvotes: 62, rank_24h_ago: 3, mentions_24h_ago: 155 },
    ])));
    expect(await fetchRedditHype(1)).toEqual([
      { ticker: "MU", rank: 3, mentions: 30, mentions24hAgo: 155, rank24hAgo: 3, upvotes: 62 },
    ]);
  });

  it("drops rows whose symbol isn't a plain US ticker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([
      { rank: 1, ticker: "BRK.B", mentions: 5 },
      { rank: 2, ticker: "SPY", mentions: 4, rank_24h_ago: null },
    ])));
    const rows = await fetchRedditHype(1);
    expect(rows.map((r) => r.ticker)).toEqual(["SPY"]);
    expect(rows[0].rank24hAgo).toBeNull();
  });

  it("returns what it has instead of throwing when a page fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(page([{ rank: 1, ticker: "NVDA", mentions: 9 }]))
      .mockRejectedValueOnce(new Error("network down")));
    expect((await fetchRedditHype(2)).map((r) => r.ticker)).toEqual(["NVDA"]);
  });
});
