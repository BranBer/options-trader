"use client";

import { useEffect, useState } from "react";
import { ActivitySquare, LineChart, Loader2, Radar } from "lucide-react";
import TickerPulseCard from "@/components/market-pulse/TickerPulseCard";
import TickerSelector from "@/components/market-pulse/TickerSelector";
import {
  useMarketPulseRefreshMutation,
  useMarketPulseState,
  useMarketPulseSubscriptionMutation,
} from "@/hooks/useMarketPulse";

type ActionNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

function noticeToneClasses(tone: ActionNotice["tone"]) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }

  if (tone === "error") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-100";
}

export default function MarketPulsePage() {
  const { data, isLoading, error } = useMarketPulseState();
  const subscriptionMutation = useMarketPulseSubscriptionMutation();
  const refreshMutation = useMarketPulseRefreshMutation();
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  useEffect(() => {
    if (!notice) return;

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(2,6,23,0.78))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_320px] xl:items-end">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">
              <Radar className="h-3.5 w-3.5" />
              Market Pulse
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                A near-real-time read on who actually controls the tape.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">
                Each tracked ticker rolls through 15-minute candle
                classification, catalyst correlation, and narrative synthesis so
                you can follow structure shifts without reverse-engineering raw
                bars every cycle.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <ActivitySquare className="h-3.5 w-3.5 text-emerald-400" />
                Active
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">
                {data?.subscriptions.length ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <LineChart className="h-3.5 w-3.5 text-sky-400" />
                Cadence
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">15m</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Radar className="h-3.5 w-3.5 text-amber-400" />
                Max
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">4</p>
            </div>
          </div>
        </div>
      </section>

      <TickerSelector
        subscriptions={data?.subscriptions ?? []}
        candidates={data?.candidates ?? []}
        disabled={subscriptionMutation.isPending}
        onAdd={(ticker) => {
          subscriptionMutation.mutate(
            { ticker, action: "add" },
            {
              onSuccess: () => {
                setNotice({
                  tone: "success",
                  message: `${ticker} is now tracked in Market Pulse.`,
                });
              },
              onError: (mutationError) => {
                setNotice({ tone: "error", message: mutationError.message });
              },
            },
          );
        }}
      />

      {notice ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-[0_16px_40px_rgba(2,6,23,0.18)] ${noticeToneClasses(notice.tone)}`}
        >
          {notice.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-60 items-center justify-center rounded-3xl border border-border/70 bg-card/60 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Market Pulse state...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm text-rose-200">
          {error.message}
        </div>
      ) : data != null && data.tickers.length > 0 ? (
        <div className="space-y-6">
          {data.tickers.map((state) => (
            <TickerPulseCard
              key={state.ticker}
              state={state}
              removing={subscriptionMutation.isPending}
              refreshing={
                refreshMutation.isPending &&
                refreshMutation.variables?.ticker === state.ticker
              }
              onRemove={(ticker) =>
                subscriptionMutation.mutate(
                  { ticker, action: "remove" },
                  {
                    onSuccess: () => {
                      setNotice({
                        tone: "info",
                        message: `${ticker} was removed from Market Pulse.`,
                      });
                    },
                    onError: (mutationError) => {
                      setNotice({
                        tone: "error",
                        message: mutationError.message,
                      });
                    },
                  },
                )
              }
              onRefresh={(ticker) =>
                refreshMutation.mutate(
                  { ticker },
                  {
                    onSuccess: () => {
                      setNotice({
                        tone: "info",
                        message: `Manual refresh queued for ${ticker}.`,
                      });
                    },
                    onError: (mutationError) => {
                      setNotice({
                        tone: "error",
                        message: mutationError.message,
                      });
                    },
                  },
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[28px] border border-dashed border-border/70 bg-card/40 p-10 text-center">
          <p className="text-lg font-medium">No tickers tracked yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add up to four symbols above to start the rolling Market Pulse
            pipeline for this page.
          </p>
        </div>
      )}
    </div>
  );
}
