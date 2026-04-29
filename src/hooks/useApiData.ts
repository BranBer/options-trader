"use client";

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { NexusDriftAnalysis } from "@/types/analysis";
import type { ActiveCascadesResponse } from "@/app/api/analysis/active-cascades/route";
import type { EconomicEvent } from "@/lib/utils/economic-calendar";

export interface NewsEvent {
  id: number;
  headline: string;
  category: string;
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
  // Epic 41 — Short interest
  shortPercentOfFloat: number | null;
  shortRatio: number | null;
  squeezePressure: string | null;
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

export function useNews(
  minImpact = 1,
  limit = 100,
  category: "general" | "tech" | "all" = "general",
) {
  return useQuery<{ events: NewsEvent[]; count: number }>({
    queryKey: ["news", minImpact, limit, category],
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const sp = new URLSearchParams({
        minImpact: String(minImpact),
        limit: String(limit),
      });
      if (category) sp.set("category", category);
      const res = await fetch(`/api/news?${sp.toString()}`);
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
  refetchInterval?: number;
}) {
  const { refetchInterval, ...queryParams } = params ?? {};
  const sp = new URLSearchParams();
  if (queryParams.ticker) sp.set("ticker", queryParams.ticker);
  if (queryParams.minPremium)
    sp.set("minPremium", String(queryParams.minPremium));
  if (queryParams.sentiment) sp.set("sentiment", queryParams.sentiment);
  if (queryParams.limit) sp.set("limit", String(queryParams.limit));

  return useQuery<{ alerts: WhaleAlert[]; marketPulse: MarketPulse }>({
    queryKey: ["whaleAlerts", queryParams],
    staleTime: 60 * 1000, // 1 minute — matches the 60s refetchInterval on the alerts page
    queryFn: async () => {
      const res = await fetch(`/api/whales?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch whale alerts");
      return res.json();
    },
    refetchInterval,
  });
}

export function useAnalyses(type?: string, limit = 20) {
  const sp = new URLSearchParams();
  if (type) sp.set("type", type);
  sp.set("limit", String(limit));

  return useQuery<{ analyses: Analysis[] }>({
    queryKey: ["analyses", type, limit],
    staleTime: 5 * 60 * 1000, // 5 minutes — analyses change only when pipeline runs
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
export function useNexusDriftAnalysis() {
  return useMutation<NexusDriftAnalysis, Error>({
    mutationKey: ["nexusDrift"],
    mutationFn: async () => {
      const res = await fetch("/api/analysis/nexus-drift", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Nexus drift analysis failed (${res.status})`,
        );
      }
      return res.json();
    },
  });
}

export function useRefreshDeepDive(ticker: string) {
  const queryClient = useQueryClient();
  return useMutation<
    {
      success: boolean;
      analysis: unknown;
      triggerReport: unknown;
      createdAt: string;
    },
    Error
  >({
    mutationKey: ["refreshDeepDive", ticker],
    mutationFn: async () => {
      const res = await fetch("/api/analysis/deep-dive/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Deep dive refresh failed (${res.status})`,
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deepDive", ticker] });
    },
  });
}

export interface CalendarStatusResponse {
  totalEvents: number;
  fetchedAt: string | null;
  isStale: boolean;
  sourceStatus: Record<string, string>;
  nextEvents: EconomicEvent[];
}

export function useCalendarStatus() {
  return useQuery<CalendarStatusResponse>({
    queryKey: ["calendarStatus"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/status");
      if (!res.ok) throw new Error("Failed to fetch calendar status");
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 h — calendar data changes once a day
    refetchOnWindowFocus: false,
  });
}

export function useActiveCascades() {
  return useQuery<ActiveCascadesResponse>({
    queryKey: ["activeCascades"],
    queryFn: async () => {
      const res = await fetch("/api/analysis/active-cascades");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ?? `Active cascades fetch failed (${res.status})`,
        );
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — cascade data changes infrequently
    refetchInterval: 10 * 60 * 1000, // auto-refresh every 10 min
  });
}

// ---- Epic 51 — Short Squeeze ----

import type { SqueezeRankingEntry } from "@/types/squeeze";

export interface SqueezeDataResponse {
  tickers: SqueezeRankingEntry[];
  generatedAt: string;
  count: number;
  /** Total tickers scanned before filtering to those with SI data */
  universeSize?: number;
}

export function useSqueezeData(refresh = false) {
  const queryClient = useQueryClient();

  const query = useQuery<SqueezeDataResponse>({
    queryKey: ["shortSqueeze", refresh],
    queryFn: async () => {
      const url = refresh
        ? "/api/short-squeeze?refresh=true"
        : "/api/short-squeeze";
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Squeeze scan failed (${res.status})`);
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
    refetchInterval: 5 * 60 * 1000,
  });

  const refresh$ = () =>
    queryClient.invalidateQueries({ queryKey: ["shortSqueeze"] });

  return { ...query, refresh: refresh$ };
}

