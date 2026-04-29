import { z } from "zod";

// --- Market snapshot for a ticker ---
export const marketSnapshotSchema = z.object({
  ticker: z.string(),
  price: z.number(),
  volume: z.number().int(),
  avgVolume: z.number().int().optional(),
  iv: z.number().optional(),
  ivRank: z.number().optional(),
  dayChangePct: z.number(),
  realizedVol: z.number().optional(),
  ivRvSpread: z.number().optional(),
  ivPercentileMethod: z.enum(["real", "heuristic"]).optional(),
});

export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

// --- Options chain summary (for trade analyzer context) ---
export const optionsChainSummarySchema = z.object({
  ticker: z.string(),
  expirations: z.array(z.string()),
  nearestExpiry: z.object({
    date: z.string(),
    calls: z.array(
      z.object({
        strike: z.number(),
        bid: z.number(),
        ask: z.number(),
        volume: z.number().int(),
        openInterest: z.number().int(),
        iv: z.number(),
        delta: z.number().optional(),
        gamma: z.number().optional(),
        theta: z.number().optional(),
      }),
    ),
    puts: z.array(
      z.object({
        strike: z.number(),
        bid: z.number(),
        ask: z.number(),
        volume: z.number().int(),
        openInterest: z.number().int(),
        iv: z.number(),
        delta: z.number().optional(),
        gamma: z.number().optional(),
        theta: z.number().optional(),
      }),
    ),
  }),
  maxPain: z.number().nullable().optional(),
  oiWalls: z
    .object({
      callWalls: z.array(
        z.object({ strike: z.number(), oi: z.number().int() }),
      ),
      putWalls: z.array(z.object({ strike: z.number(), oi: z.number().int() })),
    })
    .nullable()
    .optional(),
  gex: z
    .object({
      netGEX: z.number(),
      gexFlipLevel: z.number().nullable(),
      topConcentrations: z.array(
        z.object({ strike: z.number(), gex: z.number() }),
      ),
      dealerPositioning: z.enum(["long_gamma", "short_gamma", "neutral"]),
    })
    .nullable()
    .optional(),
});

export type OptionsChainSummary = z.infer<typeof optionsChainSummarySchema>;

// --- GEX Summary (re-exported from gex-calculator) ---
export type { GEXSummary } from "@/lib/utils/gex-calculator";

// --- Historical candle data ---
export interface CandleData {
  time: string | number; // YYYY-MM-DD for daily, unix seconds for intraday
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- DB row type ---
export interface MarketSnapshotRow {
  id: number;
  ticker: string;
  price: number | null;
  volume: number | null;
  avgVolume: number | null;
  iv: number | null;
  ivRank: number | null;
  dayChangePct: number | null;
  realizedVol: number | null;
  ivRvSpread: number | null;
  ivPercentileMethod: string | null;
  capturedAt: string | null;
}
