"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MarketPulseApiTickerState,
  MarketPulseStateResponse,
} from "@/app/api/market-pulse/route";
import type { MarketPulseRunsResponse } from "@/app/api/market-pulse/runs/route";

function makeRunningTickerShell(ticker: string): MarketPulseApiTickerState {
  return {
    ticker,
    status: "running",
    lastRunId: null,
    lastRunAt: null,
    nextRunAt: null,
    progress: { pct: 0, currentStage: null },
    errorMessage: null,
    candles: [],
    fallbackCandles: [],
    classifications: [],
    correlations: [],
    narrative: null,
  };
}
import type { MarketPulseTickerProgress } from "@/lib/services/market-pulse-progress";

export type { MarketPulseTickerProgress };

interface MarketPulseProgressResponse {
  progress: (MarketPulseTickerProgress | null)[];
}

export function useMarketPulseProgress(tickers: string[]) {
  const key = tickers.slice().sort().join(",");
  return useQuery<MarketPulseProgressResponse>({
    queryKey: ["marketPulseProgress", key],
    queryFn: async () => {
      if (tickers.length === 0) return { progress: [] };
      const res = await fetch(
        `/api/market-pulse/progress?tickers=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch Market Pulse progress");
      return res.json();
    },
    enabled: tickers.length > 0,
    // Poll every 1.5 s — this is fast enough to feel real-time without hammering
    refetchInterval: 1500,
  });
}

export function useMarketPulseState() {
  return useQuery<MarketPulseStateResponse>({
    queryKey: ["marketPulseState"],
    queryFn: async () => {
      const res = await fetch("/api/market-pulse");
      if (!res.ok) throw new Error("Failed to fetch Market Pulse state");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 15 * 60 * 1000;
      // Fast-poll while any ticker is actively running so progress bar and
      // completed status land quickly (progress is now inline in the response)
      const hasRunning = data.tickers.some((t) => t.status === "running");
      if (hasRunning) return 2_000;
      // Poll every 5 min while any ticker is pending so fallback candles stay fresh
      const hasPending = data.tickers.some((t) => t.status === "pending");
      return hasPending ? 5 * 60 * 1000 : data.intervalMs;
    },
  });
}

export function useMarketPulseSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { subscriptions: string[] },
    Error,
    { ticker: string; action: "add" | "remove" }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/market-pulse/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        subscriptions?: string[];
      };

      if (!res.ok) {
        throw new Error(
          body.error ?? "Failed to update Market Pulse subscriptions",
        );
      }

      return { subscriptions: body.subscriptions ?? [] };
    },
    onSuccess: (data, variables) => {
      const ticker = variables.ticker.toUpperCase();
      const prev = queryClient.getQueryData<MarketPulseStateResponse>([
        "marketPulseState",
      ]);

      if (variables.action === "add") {
        if (prev) {
          const exists = prev.tickers.some((t) => t.ticker === ticker);
          // Optimistically mark the new ticker as running — the initial catch-up
          // run has already been fired server-side at this point
          queryClient.setQueryData<MarketPulseStateResponse>(
            ["marketPulseState"],
            {
              ...prev,
              subscriptions: data.subscriptions,
              tickers: exists
                ? prev.tickers.map((t) =>
                    t.ticker === ticker
                      ? { ...t, status: "running" as const }
                      : t,
                  )
                : [...prev.tickers, makeRunningTickerShell(ticker)],
            },
          );
        } else {
          void queryClient.invalidateQueries({
            queryKey: ["marketPulseState"],
          });
        }
      } else {
        // remove — immediately drop the ticker from the cache so the card
        // disappears at once rather than waiting for the next poll
        if (prev) {
          queryClient.setQueryData<MarketPulseStateResponse>(
            ["marketPulseState"],
            {
              ...prev,
              subscriptions: data.subscriptions,
              tickers: prev.tickers.filter((t) => t.ticker !== ticker),
            },
          );
        } else {
          void queryClient.invalidateQueries({
            queryKey: ["marketPulseState"],
          });
        }
      }
    },
  });
}

export function useMarketPulseRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { runId: string; status: "started" },
    Error,
    { ticker: string },
    { prev?: MarketPulseStateResponse }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/market-pulse/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        runId?: string;
        status?: "started";
      };

      if (!res.ok || !body.runId || !body.status) {
        throw new Error(body.error ?? "Failed to refresh Market Pulse ticker");
      }

      return { runId: body.runId, status: body.status };
    },
    onMutate: async (variables) => {
      // Cancel any in-flight state fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["marketPulseState"] });
      const prev = queryClient.getQueryData<MarketPulseStateResponse>([
        "marketPulseState",
      ]);
      if (prev) {
        const ticker = variables.ticker.toUpperCase();
        // Optimistically mark the ticker as running so the progress bar activates
        // immediately rather than waiting for the next state poll (5-15 min).
        queryClient.setQueryData<MarketPulseStateResponse>(
          ["marketPulseState"],
          {
            ...prev,
            tickers: prev.tickers.map((t) =>
              t.ticker === ticker ? { ...t, status: "running" as const } : t,
            ),
          },
        );
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      // Roll back to the previous state if the request failed
      if (context?.prev) {
        queryClient.setQueryData(["marketPulseState"], context.prev);
      }
    },
    // No onSuccess invalidation — the 3 s fast-poll (driven by status === "running"
    // in the optimistic cache) picks up the real completed status once the run finishes.
  });
}

export function useMarketPulseRuns(ticker?: string, limit = 8) {
  return useQuery<MarketPulseRunsResponse>({
    queryKey: ["marketPulseRuns", ticker, limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/market-pulse/runs?ticker=${encodeURIComponent(ticker!)}&limit=${limit}`,
      );
      if (!res.ok) throw new Error("Failed to fetch Market Pulse run history");
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60_000,
  });
}

export function useMarketPulseRunDetails(runId?: string) {
  return useQuery({
    queryKey: ["marketPulseRun", runId],
    queryFn: async () => {
      const res = await fetch(
        `/api/market-pulse/run/${encodeURIComponent(runId!)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch Market Pulse run details");
      return res.json();
    },
    enabled: !!runId,
    staleTime: 60_000,
  });
}
