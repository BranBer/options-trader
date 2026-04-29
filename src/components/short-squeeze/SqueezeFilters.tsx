"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SqueezeRankingEntry, SqueezeScoreResult } from "@/types/squeeze";

export type SortKey = "score" | "siPct" | "dtc" | "whaleFlow";

export interface SqueezeFilterState {
  tiers: Set<SqueezeScoreResult["squeezeRisk"]>;
  minSiPct: number;
  minDtc: number;
  minScore: number;
  sort: SortKey;
}

export function defaultFilters(): SqueezeFilterState {
  return {
    tiers: new Set(["extreme", "high", "moderate", "low"]),
    minSiPct: 0,
    minDtc: 0,
    minScore: 0,
    sort: "score",
  };
}

export function applyFilters(
  entries: SqueezeRankingEntry[],
  filters: SqueezeFilterState,
): SqueezeRankingEntry[] {
  return entries
    .filter((e) => {
      if (!filters.tiers.has(e.squeezeRisk)) return false;
      if (e.shortPercentOfFloat != null && e.shortPercentOfFloat * 100 < filters.minSiPct)
        return false;
      if (e.shortRatio != null && e.shortRatio < filters.minDtc) return false;
      if (e.totalScore < filters.minScore) return false;
      return true;
    })
    .sort((a, b) => {
      switch (filters.sort) {
        case "siPct":
          return (b.shortPercentOfFloat ?? 0) - (a.shortPercentOfFloat ?? 0);
        case "dtc":
          return (b.shortRatio ?? 0) - (a.shortRatio ?? 0);
        case "whaleFlow":
          return b.components.whalePremium - a.components.whalePremium;
        default:
          return b.totalScore - a.totalScore;
      }
    });
}

const TIER_OPTIONS: { key: SqueezeScoreResult["squeezeRisk"]; label: string }[] = [
  { key: "extreme", label: "Critical" },
  { key: "high", label: "Elevated" },
  { key: "moderate", label: "Developing" },
  { key: "low", label: "Low" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score ↓" },
  { key: "siPct", label: "SI% ↓" },
  { key: "dtc", label: "DTC ↓" },
  { key: "whaleFlow", label: "Whale Flow ↓" },
];

interface Props {
  filters: SqueezeFilterState;
  onChange: (f: SqueezeFilterState) => void;
}

export function SqueezeFilters({ filters, onChange }: Props) {
  function toggleTier(tier: SqueezeScoreResult["squeezeRisk"]) {
    const next = new Set(filters.tiers);
    if (next.has(tier)) {
      if (next.size === 1) return; // keep at least one active
      next.delete(tier);
    } else {
      next.add(tier);
    }
    onChange({ ...filters, tiers: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {/* Tier toggles */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-muted-foreground text-xs">Tier:</span>
        {TIER_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggleTier(key)}
            aria-pressed={filters.tiers.has(key)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              filters.tiers.has(key)
                ? key === "extreme"
                  ? "bg-red-500/20 border-red-500 text-red-400"
                  : key === "high"
                  ? "bg-orange-500/20 border-orange-500 text-orange-400"
                  : key === "moderate"
                  ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                  : "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                : "border-border text-muted-foreground hover:border-foreground/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Min SI% */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Min SI%:</span>
        <Input
          type="number"
          min={0}
          max={100}
          value={filters.minSiPct}
          onChange={(e) =>
            onChange({ ...filters, minSiPct: Math.max(0, Number(e.target.value)) })
          }
          className="h-6 w-14 text-xs px-1.5"
          aria-label="Minimum short interest percent"
        />
      </div>

      {/* Min DTC */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Min DTC:</span>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={filters.minDtc}
          onChange={(e) =>
            onChange({ ...filters, minDtc: Math.max(0, Number(e.target.value)) })
          }
          className="h-6 w-14 text-xs px-1.5"
          aria-label="Minimum days to cover"
        />
      </div>

      {/* Min Score */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Min score:</span>
        <Input
          type="number"
          min={0}
          max={100}
          value={filters.minScore}
          onChange={(e) =>
            onChange({ ...filters, minScore: Math.max(0, Number(e.target.value)) })
          }
          className="h-6 w-14 text-xs px-1.5"
          aria-label="Minimum squeeze score"
        />
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-muted-foreground text-xs">Sort:</span>
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange({ ...filters, sort: key })}
            aria-pressed={filters.sort === key}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${
              filters.sort === key
                ? "bg-primary/20 border-primary text-primary"
                : "border-border text-muted-foreground hover:border-foreground/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Reset */}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs text-muted-foreground"
        onClick={() => onChange(defaultFilters())}
      >
        Reset
      </Button>
    </div>
  );
}
