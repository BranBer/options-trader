import { z } from "zod";

// --- Market snapshot for a ticker ---
export const marketSnapshotSchema = z.object({
  ticker: z.string(),
  price: z.number(),
  volume: z.number().int(),
  iv: z.number().optional(),
  ivRank: z.number().optional(),
  dayChangePct: z.number(),
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
      })
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
      })
    ),
  }),
});

export type OptionsChainSummary = z.infer<typeof optionsChainSummarySchema>;

// --- DB row type ---
export interface MarketSnapshotRow {
  id: number;
  ticker: string;
  price: number | null;
  volume: number | null;
  iv: number | null;
  ivRank: number | null;
  dayChangePct: number | null;
  capturedAt: string | null;
}
