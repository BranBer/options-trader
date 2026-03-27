"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface WhaleFilters {
  ticker?: string;
  sentiment?: string;
  minPremium?: number;
}

interface Props {
  filters: WhaleFilters;
  onChange: (f: WhaleFilters) => void;
}

export default function WhaleAlertFilters({ filters, onChange }: Props) {
  return (
    <fieldset
      className="flex flex-wrap items-center gap-3"
      aria-label="Whale alert filters"
    >
      <legend className="sr-only">Filter whale alerts</legend>
      <Input
        aria-label="Filter by ticker"
        placeholder="Filter by ticker (e.g. AAPL)"
        value={filters.ticker ?? ""}
        onChange={(e) =>
          onChange({ ...filters, ticker: e.target.value.toUpperCase() })
        }
        className="w-48"
      />
      <Input
        type="number"
        inputMode="numeric"
        aria-label="Minimum premium in dollars"
        placeholder="Min premium ($)"
        value={filters.minPremium ?? ""}
        onChange={(e) =>
          onChange({
            ...filters,
            minPremium: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="w-40"
      />
      <div className="flex gap-1" role="group" aria-label="Sentiment filter">
        {(["all", "bullish", "bearish"] as const).map((s) => (
          <Button
            key={s}
            aria-pressed={
              (s === "all" && !filters.sentiment) || filters.sentiment === s
            }
            variant={
              (s === "all" && !filters.sentiment) || filters.sentiment === s
                ? "default"
                : "outline"
            }
            size="sm"
            onClick={() =>
              onChange({ ...filters, sentiment: s === "all" ? undefined : s })
            }
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      {(filters.ticker || filters.sentiment || filters.minPremium) && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </fieldset>
  );
}
