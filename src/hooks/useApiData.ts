"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

export interface NewsEvent {
  id: number;
  headline: string;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  impactScore: number | null;
  sentiment: string | null;
  sectors: string | null;
  tickers: string | null;
  eventType: string | null;
  rawSummary: string | null;
  geminiAnalysis: string | null;
  createdAt: string | null;
}

export interface WhaleAlert {
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
  createdAt: string | null;
  currentPrice: number | null;
  dayChangePct: number | null;
  qualityScore: number | null;
  // Epic 21 fields
  delta: number | null;
  impliedVolatility: number | null;
  breakEvenPrice: number | null;
  inferredSentiment: string | null;
  sentimentConfidence: string | null;
  intentHint: string | null;
}

export interface MarketPulse {
  totalAlerts: number;
  callCount: number;
  putCount: number;
  pcRatio: number;
  callPremium: number;
  putPremium: number;
  netSentimentScore: number;
  sentimentLabel: string;
  topBearishSignals: Array<{
    ticker: string;
    strike: number;
    premium: number;
    type: string;
  }>;
}

export interface ConfidenceFactor {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface ConfidenceBreakdown {
  composite: number;
  factors: ConfidenceFactor[];
}

export interface Analysis {
  id: number;
  type: string | null;
  inputRefs: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  confidence: number | null;
  confidenceBreakdown: ConfidenceBreakdown | null;
  createdAt: string | null;
}

export function useNews(minImpact = 1, limit = 100) {
  return useQuery<{ events: NewsEvent[]; count: number }>({
    queryKey: ["news", minImpact, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/news?minImpact=${minImpact}&limit=${limit}`,
      );
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
  });
}

export function useWhaleAlerts(params?: {
  ticker?: string;
  minPremium?: number;
  sentiment?: string;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.ticker) sp.set("ticker", params.ticker);
  if (params?.minPremium) sp.set("minPremium", String(params.minPremium));
  if (params?.sentiment) sp.set("sentiment", params.sentiment);
  if (params?.limit) sp.set("limit", String(params.limit));

  return useQuery<{ alerts: WhaleAlert[]; marketPulse: MarketPulse }>({
    queryKey: ["whaleAlerts", params],
    queryFn: async () => {
      const res = await fetch(`/api/whales?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch whale alerts");
      return res.json();
    },
  });
}

export function useAnalyses(type?: string, limit = 20) {
  const sp = new URLSearchParams();
  if (type) sp.set("type", type);
  sp.set("limit", String(limit));

  return useQuery<{ analyses: Analysis[] }>({
    queryKey: ["analyses", type, limit],
    queryFn: async () => {
      const res = await fetch(`/api/analysis?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analyses");
      return res.json();
    },
  });
}

export function useInfiniteAnalyses(type?: string, limit = 20) {
  return useInfiniteQuery<{
    analyses: Analysis[];
    nextCursor: number | null;
    hasMore: boolean;
  }>({
    queryKey: ["infiniteAnalyses", type],
    queryFn: async ({ pageParam }) => {
      const sp = new URLSearchParams();
      if (type) sp.set("type", type);
      sp.set("limit", String(limit));
      if (pageParam) sp.set("cursor", String(pageParam));
      const res = await fetch(`/api/analysis?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analyses");
      return res.json();
    },
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useMarket(ticker?: string, limit = 10) {
  const sp = new URLSearchParams();
  if (ticker) sp.set("ticker", ticker);
  sp.set("limit", String(limit));

  return useQuery({
    queryKey: ["market", ticker, limit],
    queryFn: async () => {
      const res = await fetch(`/api/market?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch market data");
      return res.json();
    },
    enabled: !!ticker,
  });
}

export function useDeepDive(ticker?: string) {
  const sp = new URLSearchParams();
  sp.set("type", "deep_dive");
  if (ticker) sp.set("ticker", ticker);
  sp.set("limit", "1");

  return useQuery<{ analyses: Analysis[] }>({
    queryKey: ["deepDive", ticker],
    queryFn: async () => {
      const res = await fetch(`/api/analysis?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch deep dive");
      return res.json();
    },
    enabled: !!ticker,
  });
}

export interface CandleDataResponse {
  ticker: string;
  period: string;
  candles: Array<{
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export function useHistoricalData(ticker?: string, period = "3mo") {
  return useQuery<CandleDataResponse>({
    queryKey: ["historicalData", ticker, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/market/history?ticker=${encodeURIComponent(ticker!)}&period=${period}`,
      );
      if (!res.ok) throw new Error("Failed to fetch historical data");
      const data = await res.json();
      if (!data.candles?.length) throw new Error("No candle data returned");
      return data;
    },
    enabled: !!ticker,
    staleTime: 10 * 60 * 1000, // 10 min — candle data is relatively static
    refetchInterval: false, // historical data doesn't need periodic refetch
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev, // keep previous data while refetching
  });
}
