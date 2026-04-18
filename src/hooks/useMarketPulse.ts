"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarketPulseStateResponse } from "@/app/api/market-pulse/route";
import type { MarketPulseRunsResponse } from "@/app/api/market-pulse/runs/route";

export function useMarketPulseState() {
  return useQuery<MarketPulseStateResponse>({
    queryKey: ["marketPulseState"],
    queryFn: async () => {
      const res = await fetch("/api/market-pulse");
      if (!res.ok) throw new Error("Failed to fetch Market Pulse state");
      return res.json();
    },
    refetchInterval: (query) => query.state.data?.intervalMs ?? 15 * 60 * 1000,
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketPulseState"] });
    },
  });
}

export function useMarketPulseRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { runId: string; status: "started" },
    Error,
    { ticker: string }
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketPulseState"] });
    },
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
