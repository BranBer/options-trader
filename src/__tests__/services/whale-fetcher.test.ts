import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// fetchPolygonOptions() falls back to the dynamic ticker universe when no
// tickers are passed in — stub it so polygon-path tests don't touch the DB.
vi.mock("@/lib/services/ticker-universe", () => ({
  getTickerUniverse: vi.fn(async () => ["SPY", "QQQ", "IWM"]),
}));

import {
  fetchUnusualWhales,
  fetchWhaleAlerts,
  resolveWhaleSource,
} from "@/lib/services/whale-fetcher";

const ENV_KEYS = ["UNUSUAL_WHALES_API_KEY", "WHALE_SOURCE", "MASSIVE_API_KEY", "POLYGON_API_KEY"];
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

// Fixture shaped exactly per docs/research/unusual-whales-api.md §2a row #1
// (option-trade/flow-alerts.md) — DOC-DERIVED / UNVERIFIED with a live key.
// Note UW numbers arrive as strings; the fixture intentionally mixes string
// and number fields the way the doc says the real payload does.
function makeFlowAlertFixture(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "aapl", // lowercase on purpose — mapping should uppercase it
    option_chain: "AAPL240419C00190000",
    type: "call",
    strike: "190", // string, per doc
    expiry: "2024-04-19",
    created_at: "2024-04-01T14:32:00Z",
    alert_rule: "RepeatedHits",
    total_premium: "186705", // string, per doc's own example
    total_ask_side_prem: "160000",
    total_bid_side_prem: "26705",
    total_size: "500",
    trade_count: "12",
    volume: "1200",
    open_interest: "800",
    volume_oi_ratio: "1.5",
    underlying_price: "189.42",
    price: "1.85",
    iv: "0.42",
    delta: "0.55",
    gamma: "0.02",
    theta: "-0.1",
    vega: "0.08",
    rho: "0.01",
    has_sweep: true,
    has_floor: false,
    has_multileg: false,
    all_opening_trades: true,
    issue_type: "Common Stock",
    ...overrides,
  };
}

function mockFetchJson(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
    json: async () => body,
  };
}

describe("fetchUnusualWhales", () => {
  beforeEach(() => {
    process.env.UNUSUAL_WHALES_API_KEY = "test-key";
  });

  it("returns [] with no API key configured", async () => {
    delete process.env.UNUSUAL_WHALES_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchUnusualWhales();

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps a flow-alert fixture to WhaleAlert, coercing numeric strings", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      mockFetchJson(200, { data: [makeFlowAlertFixture()] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [alert] = await fetchUnusualWhales();

    expect(alert).toBeDefined();
    expect(alert.ticker).toBe("AAPL");
    expect(alert.strike).toBe(190); // coerced from "190" to a number
    expect(alert.expiry).toBe("2024-04-19");
    expect(alert.callPut).toBe("C");
    expect(alert.premium).toBe(186705); // coerced from "186705"
    expect(alert.volume).toBe(1200);
    expect(alert.openInterest).toBe(800);
    expect(alert.underlyingPrice).toBeCloseTo(189.42);
    expect(alert.source).toBe("unusual_whales");
    expect(alert.detectedAt).toBe("2024-04-01T14:32:00Z");
    // Greeks/IV carried into the existing optional fields
    expect(alert.delta).toBeCloseTo(0.55);
    expect(alert.gamma).toBeCloseTo(0.02);
    expect(alert.theta).toBeCloseTo(-0.1);
    expect(alert.vega).toBeCloseTo(0.08);
    expect(alert.impliedVolatility).toBeCloseTo(0.42);

    // Called the documented flow-alerts endpoint with server-side filters
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/option-trades/flow-alerts");
    expect(calledUrl).toContain("min_premium=100000");
    expect(calledUrl).toContain("newer_than=");
  });

  it("derives bullish sentiment when ask-side premium dominates on a call", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [
          makeFlowAlertFixture({
            type: "call",
            total_ask_side_prem: "160000",
            total_bid_side_prem: "26705",
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [alert] = await fetchUnusualWhales();
    expect(alert.sentiment).toBe("bullish");
  });

  it("derives bearish sentiment when bid-side premium dominates on a call (aggressive sell)", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [
          makeFlowAlertFixture({
            type: "call",
            total_ask_side_prem: "10000",
            total_bid_side_prem: "150000",
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [alert] = await fetchUnusualWhales();
    expect(alert.sentiment).toBe("bearish");
  });

  it("derives bearish sentiment when ask-side premium dominates on a put", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [
          makeFlowAlertFixture({
            type: "put",
            total_ask_side_prem: "160000",
            total_bid_side_prem: "26705",
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [alert] = await fetchUnusualWhales();
    expect(alert.sentiment).toBe("bearish");
  });

  it("falls back to call=bullish/put=bearish when side premiums are absent", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [
          makeFlowAlertFixture({
            type: "put",
            total_ask_side_prem: undefined,
            total_bid_side_prem: undefined,
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [alert] = await fetchUnusualWhales();
    expect(alert.sentiment).toBe("bearish");
  });

  it("accepts option-type casing variants instead of dropping the row", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [
          makeFlowAlertFixture({ type: "PUT" }),
          makeFlowAlertFixture({ type: "Call" }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const alerts = await fetchUnusualWhales();
    expect(alerts.map((a) => a.callPut)).toEqual(["P", "C"]);
  });

  it("filters out alerts below the $100K premium threshold", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [makeFlowAlertFixture({ total_premium: "5000" })],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUnusualWhales();
    expect(result).toEqual([]);
  });

  it("skips malformed items (missing required fields) without throwing", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(200, {
        data: [{ not_a_ticker_field: true }, makeFlowAlertFixture()],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUnusualWhales();
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("AAPL");
  });

  it("retries once on 429 using the per-minute reset header, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockFetchJson(429, { error: "rate_limited" }, {
          "x-uw-req-per-minute-reset": "5",
        }),
      )
      .mockResolvedValueOnce(mockFetchJson(200, { data: [makeFlowAlertFixture()] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUnusualWhales();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it("gives up after a single retry (does not loop) when 429 persists", async () => {
    const fetchMock = vi.fn(async () =>
      mockFetchJson(429, { error: "rate_limited" }, {
        "x-uw-req-per-minute-reset": "1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchUnusualWhales();

    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 original + 1 retry, never more
    expect(result).toEqual([]);
  });

  it("never throws — returns [] on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await fetchUnusualWhales();
    expect(result).toEqual([]);
  });

  it("never throws — returns [] on a non-429 HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockFetchJson(500, { error: "boom" })));

    const result = await fetchUnusualWhales();
    expect(result).toEqual([]);
  });
});

describe("resolveWhaleSource / fetchWhaleAlerts source selection", () => {
  it("uses unusual_whales when a key is configured and WHALE_SOURCE is unset", () => {
    delete process.env.WHALE_SOURCE;
    process.env.UNUSUAL_WHALES_API_KEY = "real-key";
    expect(resolveWhaleSource()).toBe("unusual_whales");
  });

  it("uses polygon when no UW key is configured and WHALE_SOURCE is unset", () => {
    delete process.env.WHALE_SOURCE;
    delete process.env.UNUSUAL_WHALES_API_KEY;
    expect(resolveWhaleSource()).toBe("polygon");
  });

  it("uses polygon when the UW key is still the placeholder value", () => {
    delete process.env.WHALE_SOURCE;
    process.env.UNUSUAL_WHALES_API_KEY = "your_key_here";
    expect(resolveWhaleSource()).toBe("polygon");
  });

  it("an explicit WHALE_SOURCE=polygon wins even when a UW key is set", () => {
    process.env.WHALE_SOURCE = "polygon";
    process.env.UNUSUAL_WHALES_API_KEY = "real-key";
    expect(resolveWhaleSource()).toBe("polygon");
  });

  it("an explicit WHALE_SOURCE=unusual_whales wins even with no UW key", () => {
    process.env.WHALE_SOURCE = "unusual_whales";
    delete process.env.UNUSUAL_WHALES_API_KEY;
    expect(resolveWhaleSource()).toBe("unusual_whales");
  });

  it("fetchWhaleAlerts routes to fetchUnusualWhales's [] short-circuit when unusual_whales is selected without a key", async () => {
    process.env.WHALE_SOURCE = "unusual_whales";
    delete process.env.UNUSUAL_WHALES_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchWhaleAlerts();

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
