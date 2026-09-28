import { TableCell, TableRow } from "@/components/ui/table";
import {
  formatContextLines,
  formatEntryValue,
  formatLegsSummary,
  formatMark,
  formatPnl,
} from "@/components/desk/desk-format";
import { STRATEGY_SHORT_LABEL } from "@/components/desk/constants";
import type { TradeRowProps } from "./types";

export function TradeRow({ trade, variant }: TradeRowProps) {
  const entryValue = formatEntryValue(trade.entryValue);
  const pnl = formatPnl(trade.pnl, trade.risk);
  const contextLines = formatContextLines(trade.context);

  return (
    <TableRow>
      <TableCell>{STRATEGY_SHORT_LABEL[trade.strategy] ?? trade.strategy}</TableCell>
      <TableCell>{trade.ticker}</TableCell>
      <TableCell className="whitespace-normal min-w-44">{formatLegsSummary(trade.legs)}</TableCell>
      <TableCell>{trade.entryDate}</TableCell>
      {variant === "open" ? (
        <TableCell>{trade.plannedExit}</TableCell>
      ) : (
        <TableCell>
          {trade.exitDate ?? "—"}
          {trade.exitReason ? ` (${trade.exitReason})` : ""}
        </TableCell>
      )}
      <TableCell>
        {entryValue.label} {entryValue.amount}
      </TableCell>
      <TableCell>{formatMark(trade.markValue)}</TableCell>
      <TableCell className={pnl.isPositive ? "text-emerald-500" : "text-destructive"}>
        {pnl.dollars}
        {pnl.pct ? ` (${pnl.pct} of risk)` : ""}
      </TableCell>
      <TableCell>
        {contextLines.length > 0
          ? contextLines.map((line) => (
              <p key={line} className="text-xs whitespace-nowrap">
                {line}
              </p>
            ))
          : "—"}
      </TableCell>
      <TableCell>
        {trade.context.jev && trade.context.jev.length > 0 ? (
          <div className="space-y-0.5">
            {trade.context.jev.map((reading, i) => (
              <p key={i} className="text-xs">
                {reading.question}: {reading.answer}
              </p>
            ))}
            <p className="text-[10px] text-muted-foreground">
              evidence reading, not a probability of profit
            </p>
          </div>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
}
