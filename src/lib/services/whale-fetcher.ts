import { z } from "zod";
import type { WhaleAlert } from "@/types/whale";

const WHALE_PREMIUM_THRESHOLD = 100_000; // $100K minimum
const UW_LOOKBACK_HOURS = 24; // "recent window" for flow-alert discovery
const UW_LIMIT = 200; // max allowed by /api/option-trades/flow-alerts

// ---------- Unusual Whales ----------
//
// Endpoint + fields are DOC-DERIVED from docs/research/unusual-whales-api.md
// (VERIFIED against UW's markdown docs, but NOT yet exercised with a live
// key — see the report handed back with this story for exactly what to
// re-check on the first real call).
//
// GET /api/option-trades/flow-alerts
//   Query: min_premium, limit, newer_than
//   Fields (row 1 of the endpoint table in the research doc):
//     ticker, option_chain, type, strike, expiry, created_at, alert_rule,
//     total_premium, total_ask_side_prem, total_bid_side_prem, total_size,
//     trade_count, volume, open_interest, volume_oi_ratio, underlying_price,
//     price, iv, delta, gamma, theta, vega, rho, has_sweep, has_floor,
//     has_multileg, all_opening_trades, issue_type
//
// Many UW numbers arrive as STRINGS (e.g. "total_premium": "186705") — the
// schema below coerces them. `.passthrough()` keeps unknown/extra fields
// from breaking parsing.

const uwFlowAlertItemSchema = z
  .object({
    ticker: z.string(),
    option_chain: z.string().optional(),
    // Casing is unverified live ("call" per the docs); accept "Put"/"P"/"PUT" rather than drop every row.
    type: z
      .string()
      .transform((t): "call" | "put" => (/^p/i.test(t) ? "put" : "call"))
      .optional(),
    strike: z.coerce.number().optional(),
    expiry: z.string().optional(),
    created_at: z.string().optional(),
    total_premium: z.coerce.number().optional(),
    total_ask_side_prem: z.coerce.number().optional(),
    total_bid_side_prem: z.coerce.number().optional(),
    volume: z.coerce.number().optional(),
    open_interest: z.coerce.number().optional(),
    underlying_price: z.coerce.number().optional(),
    iv: z.coerce.number().optional(),
    delta: z.coerce.number().optional(),
    gamma: z.coerce.number().optional(),
    theta: z.coerce.number().optional(),
    vega: z.coerce.number().optional(),
  })
  .passthrough();

type UWFlowAlertItem = z.infer<typeof uwFlowAlertItemSchema>;

/**
 * Sentiment from side-of-tape premium when available: an alert whose
 * ask-side premium dominates is an aggressive buy, which is bullish for a
 * call and bearish for a put; bid-side domination is the aggressive-sell
 * mirror image. Falls back to the naive call=bullish/put=bearish rule only
 * when side premiums are both absent.
 *
 * UNVERIFIED: whether UW's own "bullish/bearish" convention for flow-alerts
 * matches this ask/bid-vs-type combination — there is no `sentiment` field
 * in the documented response to compare against. Re-check against real
 * alert_rule / total_ask_side_prem / total_bid_side_prem values on first
 * live call.
 */
function deriveSentiment(
  type: "call" | "put" | undefined,
  askPrem: number | undefined,
  bidPrem: number | undefined,
): "bullish" | "bearish" {
  const hasSideData =
    (askPrem != null && askPrem > 0) || (bidPrem != null && bidPrem > 0);
  if (hasSideData) {
    const aggressiveBuy = (askPrem ?? 0) >= (bidPrem ?? 0);
    if (type === "put") return aggressiveBuy ? "bearish" : "bullish";
    return aggressiveBuy ? "bullish" : "bearish";
  }
  return type === "put" ? "bearish" : "bullish";
}

function mapFlowAlertToWhaleAlert(item: UWFlowAlertItem): WhaleAlert | null {
  if (!item.ticker || item.strike == null || !item.expiry) return null;

  const premium = item.total_premium ?? 0;
  const volume = Math.round(item.volume ?? 0);
  const openInterest = Math.round(item.open_interest ?? 0);

  return {
    ticker: item.ticker.toUpperCase(),
    strike: item.strike,
    expiry: item.expiry,
    callPut: item.type === "put" ? "P" : "C",
    premium,
    volume,
    openInterest,
    underlyingPrice: item.underlying_price,
    sentiment: deriveSentiment(
      item.type,
      item.total_ask_side_prem,
      item.total_bid_side_prem,
    ),
    source: "unusual_whales",
    detectedAt: item.created_at || new Date().toISOString(),
    delta: item.delta,
    gamma: item.gamma,
    theta: item.theta,
    vega: item.vega,
    impliedVolatility: item.iv,
  };
}

/**
 * Fetch one page from a UW endpoint, retrying once on 429 using the
 * `x-uw-req-per-minute-reset` header (ms until the per-minute window resets).
 * VERIFIED (rate-limit headers + 429 behavior): docs/research/unusual-whales-api.md §5.
 */
async function fetchUWWithRetry(
  url: string,
  apiKey: string,
): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    // UNCERTAIN whether this header is actually required — a third-party
    // "skill.md" claims it, UW's own conventions/errors docs do not. It is
    // harmless to send either way.
    "UW-CLIENT-API-ID": "100001",
  };

  let res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) {
    const resetMs = Number(res.headers.get("x-uw-req-per-minute-reset"));
    const waitMs = Number.isFinite(resetMs) && resetMs > 0 ? resetMs : 1_000;
    console.warn(
      `[whale-fetcher] UW rate limited (429), waiting ${waitMs}ms for one retry`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  }

  return res;
}

export async function fetchUnusualWhales(): Promise<WhaleAlert[]> {
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("[whale-fetcher] No Unusual Whales API key configured");
    return [];
  }

  try {
    const newerThan = new Date(
      Date.now() - UW_LOOKBACK_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const params = new URLSearchParams({
      min_premium: String(WHALE_PREMIUM_THRESHOLD),
      limit: String(UW_LIMIT),
      newer_than: newerThan,
    });

    const res = await fetchUWWithRetry(
      `https://api.unusualwhales.com/api/option-trades/flow-alerts?${params.toString()}`,
      apiKey,
    );

    if (!res.ok) {
      console.error(
        `[whale-fetcher] UW API error: ${res.status} ${res.statusText}`,
      );
      return [];
    }

    const json = await res.json();
    const rawItems: unknown[] = Array.isArray(json?.data) ? json.data : [];

    const alerts: WhaleAlert[] = [];
    let malformed = 0;
    let firstIssue: string | undefined;
    for (const raw of rawItems) {
      const parsed = uwFlowAlertItemSchema.safeParse(raw);
      if (!parsed.success) {
        malformed++;
        firstIssue ??= parsed.error.issues[0]?.message;
        continue;
      }
      const mapped = mapFlowAlertToWhaleAlert(parsed.data);
      if (mapped && mapped.premium >= WHALE_PREMIUM_THRESHOLD) {
        alerts.push(mapped);
      }
    }
    if (malformed > 0) {
      console.warn(
        `[whale-fetcher] Skipped ${malformed}/${rawItems.length} malformed UW flow-alert rows (first: ${firstIssue})`,
      );
    }

    return alerts;
  } catch (error) {
    console.error("[whale-fetcher] UW fetch failed:", error);
    return [];
  }
}

// ---------- Massive (formerly Polygon.io) Options (fallback) ----------

interface PolygonOptionSnapshot {
  details: {
    ticker: string;
    strike_price: number;
    expiration_date: string;
    contract_type: "call" | "put";
  };
  day: {
    volume: number;
    open: number;
    close: number;
  };
  open_interest: number;
  underlying_asset: {
    ticker: string;
    price: number;
    change_to_break_even: number;
  };
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  implied_volatility?: number;
  break_even_price?: number;
}

/**
 * Fetch options snapshots from Polygon and detect unusual activity.
 * "Unusual" = day volume > 5x open interest (whale-like activity).
 *
 * `tickers` defaults to the dynamic ticker universe (whale-alert / news-event
 * derived, see ticker-universe.ts) instead of a fixed mega-cap list.
 */
export async function fetchPolygonOptions(
  tickers?: string[],
): Promise<WhaleAlert[]> {
  const apiKey = process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("[whale-fetcher] No Massive API key configured");
    return [];
  }

  let resolvedTickers = tickers;
  if (!resolvedTickers) {
    const { getTickerUniverse } = await import("./ticker-universe");
    resolvedTickers = await getTickerUniverse();
  }

  const alerts: WhaleAlert[] = [];
  const statusCounts: Record<number, number> = {};
  const failedTickers: string[] = [];
  const networkFailures: string[] = [];

  for (const ticker of resolvedTickers) {
    try {
      const res = await fetch(
        `https://api.massive.com/v3/snapshot/options/${ticker}?limit=50&apiKey=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!res.ok) {
        if (res.status === 429) {
          console.warn("[whale-fetcher] Massive rate limited, pausing...");
          await new Promise((r) => setTimeout(r, 12_000));
          continue;
        }
        statusCounts[res.status] = (statusCounts[res.status] ?? 0) + 1;
        failedTickers.push(ticker);
        continue;
      }

      const json = await res.json();
      const results: PolygonOptionSnapshot[] = json.results ?? [];

      for (const snap of results) {
        const vol = snap.day?.volume ?? 0;
        const oi = snap.open_interest ?? 0;
        // Unusual activity: volume > 5x OI, or very large volume with any OI
        const isUnusual = (oi > 0 && vol > 5 * oi) || vol > 10_000;
        if (!isUnusual) continue;

        const estPremium = vol * (snap.day?.close ?? 1) * 100; // rough premium = vol * price * 100 shares
        if (estPremium < WHALE_PREMIUM_THRESHOLD) continue;

        alerts.push({
          ticker: snap.underlying_asset?.ticker ?? ticker,
          strike: snap.details.strike_price,
          expiry: snap.details.expiration_date,
          callPut: snap.details.contract_type === "call" ? "C" : "P",
          premium: estPremium,
          volume: vol,
          openInterest: oi,
          underlyingPrice: snap.underlying_asset?.price,
          sentiment:
            snap.details.contract_type === "call" ? "bullish" : "bearish",
          source: "polygon",
          detectedAt: new Date().toISOString(),
          delta: snap.greeks?.delta,
          gamma: snap.greeks?.gamma,
          theta: snap.greeks?.theta,
          vega: snap.greeks?.vega,
          impliedVolatility: snap.implied_volatility,
          breakEvenPrice: snap.break_even_price,
        });
      }

      // Massive free tier: 5 calls/min — small delay between tickers
      await new Promise((r) => setTimeout(r, 1_200));
    } catch {
      networkFailures.push(ticker);
    }
  }

  if ((statusCounts[403] ?? 0) > 0) {
    console.warn(
      `[whale-fetcher] Massive returned 403 for ${statusCounts[403]}/${resolvedTickers.length} tickers (${failedTickers.join(", ")}). Check MASSIVE_API_KEY permissions/plan.`,
    );
  }

  Object.entries(statusCounts)
    .filter(([status]) => status !== "403")
    .forEach(([status, count]) => {
      console.warn(
        `[whale-fetcher] Massive HTTP ${status} for ${count} ticker(s)`,
      );
    });

  if (networkFailures.length > 0) {
    console.warn(
      `[whale-fetcher] Massive network failures for ${networkFailures.length} ticker(s): ${networkFailures.join(", ")}`,
    );
  }

  return alerts;
}

// ---------- Unified fetcher ----------

/**
 * Source selection: an explicit WHALE_SOURCE wins. Otherwise, use
 * unusual_whales when a key is configured, else fall back to polygon.
 */
export function resolveWhaleSource(): "unusual_whales" | "polygon" {
  const explicit = process.env.WHALE_SOURCE;
  if (explicit === "unusual_whales" || explicit === "polygon") {
    return explicit;
  }

  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  return apiKey && apiKey !== "your_key_here" ? "unusual_whales" : "polygon";
}

export async function fetchWhaleAlerts(): Promise<WhaleAlert[]> {
  const source = resolveWhaleSource();
  console.log(`[whale-fetcher] Using source: ${source}`);

  let alerts: WhaleAlert[];
  if (source === "polygon") {
    alerts = await fetchPolygonOptions();
  } else {
    alerts = await fetchUnusualWhales();
  }

  console.log(
    `[whale-fetcher] Fetched ${alerts.length} whale alerts (premium >= $${WHALE_PREMIUM_THRESHOLD.toLocaleString()})`,
  );
  return alerts;
}
