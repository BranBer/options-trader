import type { PaperLeg, PaperTradeContext } from "@/types/desk";
import { formatCurrency } from "@/lib/utils/formatters";

export function formatSignedPercent(value: number, decimals = 1): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

export function formatPercent1(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatLegsSummary(legs: PaperLeg[]): string {
  if (legs.length === 0) return "—";
  const parts = legs.map(
    (leg) => `${leg.side > 0 ? "+" : "−"}${leg.qty} ${leg.cp} ${leg.strike}`,
  );
  return `${parts.join(" / ")} · ${legs[0].expiry}`;
}

export function formatContextLines(context: PaperTradeContext): string[] {
  const lines: string[] = [];
  if (context.impliedMove !== undefined) lines.push(`Implied move ±${formatPercent1(context.impliedMove)}`);
  if (context.vix !== undefined) lines.push(`VIX ${context.vix.toFixed(1)}`);
  if (context.hype) {
    const { rank, mentions, mentions24hAgo } = context.hype;
    const change = mentions24hAgo ? ` (${formatSignedPercent(mentions / mentions24hAgo - 1, 0)} in 24h)` : "";
    lines.push(`Reddit #${rank} · ${mentions} mentions${change}`);
  }
  return lines;
}

// asOf is a trading date ("2026-09-25"), not an instant: parsing it as a timestamp shifts it to the prior evening in ET.
export function formatSessionDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// markValue shares entryValue's sign convention: a short (credit) position is worth what it costs to buy back.
export function formatMark(markValue: number | null): string {
  if (markValue === null) return "—";
  return markValue < 0
    ? `${formatCurrency(Math.abs(markValue) * 100)} to close`
    : `${formatCurrency(markValue * 100)} value`;
}

export interface EntryValueDisplay {
  label: "Debit" | "Credit";
  amount: string;
}

// entryValue > 0 = debit paid, < 0 = credit received (see PaperTrade in src/types/desk.ts)
export function formatEntryValue(entryValue: number): EntryValueDisplay {
  return {
    label: entryValue >= 0 ? "Debit" : "Credit",
    amount: formatCurrency(Math.abs(entryValue) * 100),
  };
}

export interface PnlDisplay {
  dollars: string;
  pct: string | null;
  isPositive: boolean;
}

export function formatPnl(pnl: number | null, risk: number): PnlDisplay {
  if (pnl === null) {
    return { dollars: "—", pct: null, isPositive: false };
  }
  const dollars = formatCurrency(pnl * 100);
  const pct = risk !== 0 ? formatSignedPercent(pnl / risk) : null;
  return { dollars, pct, isPositive: pnl >= 0 };
}
