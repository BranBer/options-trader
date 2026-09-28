import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TradeRow } from "./TradeRow";
import type { TradesTableProps } from "./types";

const EMPTY_TEXT: Record<TradesTableProps["variant"], string> = {
  open: "No open positions.",
  closed: "No closed positions yet.",
};

export function TradesTable({ variant, trades }: TradesTableProps) {
  if (trades.length === 0) {
    return <p className="text-sm text-muted-foreground">{EMPTY_TEXT[variant]}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableCaption>
          {variant === "open" ? "Open positions" : "Recently closed"} —
          simulated, paper only.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Strategy</TableHead>
            <TableHead scope="col">Ticker</TableHead>
            <TableHead scope="col">Legs</TableHead>
            <TableHead scope="col">Entry date</TableHead>
            <TableHead scope="col">{variant === "open" ? "Planned exit" : "Exit"}</TableHead>
            <TableHead scope="col">Entry value</TableHead>
            <TableHead scope="col">Mark</TableHead>
            <TableHead scope="col">P&amp;L</TableHead>
            <TableHead scope="col">Context</TableHead>
            <TableHead scope="col">Jev readings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} variant={variant} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
