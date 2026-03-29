import { z } from "zod";

// --- Insider Transaction (from Finnhub) ---
export const insiderTransactionSchema = z.object({
  name: z.string(),
  share: z.number(),
  change: z.number(),
  transactionDate: z.string(),
  transactionCode: z.string(), // "P" = purchase, "S" = sale, etc.
  transactionPrice: z.number(),
  filingDate: z.string(),
});

export type InsiderTransaction = z.infer<typeof insiderTransactionSchema>;

// --- Aggregated Insider Sentiment ---
export interface InsiderSentiment {
  ticker: string;
  /** Number of buy transactions in period */
  buyCount: number;
  /** Total $ value of buys */
  buyValue: number;
  /** Number of sell transactions in period */
  sellCount: number;
  /** Total $ value of sells */
  sellValue: number;
  /** Net sentiment direction */
  sentiment: "bullish" | "bearish" | "neutral";
  /** Date range of transactions */
  periodDays: number;
}
