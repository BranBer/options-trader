import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent1 } from "@/components/desk/desk-format";
import type { CalibrationTableProps } from "./types";

export function CalibrationTable({ calibration }: CalibrationTableProps) {
  if (calibration.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Jev judgments have matured yet — each needs 5 trading days after
        it&apos;s logged.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableCaption>Signal calibration — Jev ledger.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Context</TableHead>
            <TableHead scope="col">Question</TableHead>
            <TableHead scope="col">N scored</TableHead>
            <TableHead scope="col">Hit rate</TableHead>
            <TableHead scope="col">Brier (Jev vs base rate)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calibration.map((row) => (
            <TableRow key={`${row.contextType}-${row.questionId}`}>
              <TableCell>{row.contextType}</TableCell>
              <TableCell>{row.questionId}</TableCell>
              <TableCell>{row.n}</TableCell>
              <TableCell>
                {row.hitRate !== null ? formatPercent1(row.hitRate) : "—"}
              </TableCell>
              <TableCell>
                {row.brier
                  ? `${row.brier.jev.toFixed(3)} vs ${row.brier.baseline.toFixed(3)}`
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
