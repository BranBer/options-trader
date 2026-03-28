import { z } from "zod";

// --- Whale alert from Unusual Whales or Polygon ---
export const whaleAlertSchema = z.object({
  ticker: z.string(),
  strike: z.number(),
  expiry: z.string(),
  callPut: z.enum(["C", "P"]),
  premium: z.number(),
  volume: z.number().int(),
  openInterest: z.number().int(),
  underlyingPrice: z.number().optional(),
  sentiment: z.enum(["bullish", "bearish"]),
  source: z.string(),
  detectedAt: z.string(),
  qualityScore: z.number().int().min(0).max(100).optional(),
});

export type WhaleAlert = z.infer<typeof whaleAlertSchema>;

// --- Gemini cross-reference whale trade subset ---
export const whaleTradeRefSchema = z.object({
  ticker: z.string(),
  strike: z.number(),
  expiry: z.string(),
  type: z.enum(["call", "put"]),
  premium: z.number(),
  volume: z.number().int(),
});

export type WhaleTradeRef = z.infer<typeof whaleTradeRefSchema>;

// --- DB row type ---
export interface WhaleAlertRow {
  id: number;
  ticker: string;
  strike: number | null;
  expiry: string | null;
  callPut: string | null;
  premium: number | null;
  volume: number | null;
  openInterest: number | null;
  underlyingPrice: number | null;
  sentiment: string | null;
  source: string | null;
  detectedAt: string | null;
  qualityScore: number | null;
  createdAt: string | null;
}
