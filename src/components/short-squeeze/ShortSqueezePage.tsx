"use client";

import { useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSqueezeData } from "@/hooks/useApiData";
import {
  SqueezeCandidateCard,
  SqueezeCandidateCardSkeleton,
} from "./SqueezeCandidateCard";
import {
  SqueezeFilters,
  applyFilters,
  defaultFilters,
  type SqueezeFilterState,
} from "./SqueezeFilters";

export default function ShortSqueezePage() {
  const [filters, setFilters] = useState<SqueezeFilterState>(defaultFilters);
  const { data, isLoading, isError, isFetching, refresh, dataUpdatedAt } =
    useSqueezeData();

  const candidates = data?.tickers ?? [];
  const universeSize = data?.universeSize;
  const filtered = applyFilters(candidates, filters);

  const extremeCount = candidates.filter((c) => c.squeezeRisk === "extreme").length;
  const highCount = candidates.filter((c) => c.squeezeRisk === "high").length;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-400" />
            Squeeze Scan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {universeSize
              ? `Scanning ${universeSize} stocks — ranked by composite short squeeze probability`
              : "Ranked short squeeze candidates by composite risk score"}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      {!isLoading && candidates.length > 0 && (
        <div
          className="flex items-center gap-4 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span>
            <strong className="text-foreground">{candidates.length}</strong> with data
            {universeSize && universeSize > candidates.length && (
              <span className="text-xs ml-1">(scanned {universeSize})</span>
            )}
          </span>
          {extremeCount > 0 && (
            <span className="text-red-400">
              <strong>{extremeCount}</strong> critical pressure
            </span>
          )}
          {highCount > 0 && (
            <span className="text-orange-400">
              <strong>{highCount}</strong> elevated
            </span>
          )}
          {lastUpdated && (
            <span className="ml-auto text-xs">Last updated: {lastUpdated}</span>
          )}
        </div>
      )}

      {/* Filters */}
      <SqueezeFilters filters={filters} onChange={setFilters} />

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SqueezeCandidateCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive py-8 text-center" role="alert">
          Failed to load squeeze scan data. Please refresh.
        </p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Zap className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-sm">
            {candidates.length === 0
              ? "No candidates with SI data found. Screener universe is loading — try refreshing in a moment."
              : "No candidates match the current filters."}
          </p>
          {candidates.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Refresh now
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <SqueezeCandidateCard key={entry.ticker} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
