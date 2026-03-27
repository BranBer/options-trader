"use client";

import { useState, type KeyboardEvent } from "react";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWhaleAlerts, type WhaleAlert } from "@/hooks/useApiData";
import {
  formatPremium,
  formatNumber,
  timeAgo,
  formatCurrency,
} from "@/lib/utils/formatters";
import WhaleAlertDetail from "./WhaleAlertDetail";
import WhaleAlertFilters, { type WhaleFilters } from "./WhaleAlertFilters";

export default function WhaleAlertsPage() {
  const [filters, setFilters] = useState<WhaleFilters>({});
  const [selected, setSelected] = useState<WhaleAlert | null>(null);

  const { data, isLoading } = useWhaleAlerts({
    ticker: filters.ticker || undefined,
    sentiment: filters.sentiment || undefined,
    minPremium: filters.minPremium || undefined,
    limit: 100,
  });

  const alerts = data?.alerts ?? [];

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    alert: WhaleAlert,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(alert);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Whale Alerts</h1>
        <p className="text-muted-foreground text-sm">
          Unusual options activity detected across markets.
        </p>
      </div>

      <WhaleAlertFilters filters={filters} onChange={setFilters} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Table */}
        <Card className={selected ? "lg:col-span-2" : "lg:col-span-3"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isLoading ? "Loading..." : `${alerts.length} alerts`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="pr-3">
                <Table>
                  <caption className="sr-only">
                    Whale alerts table. Select a row to view detailed options
                    flow information.
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Strike</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">OI</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.length === 0 && !isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center text-muted-foreground py-8"
                        >
                          No whale alerts found. Run a pipeline refresh or
                          adjust filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alerts.map((alert) => (
                        <TableRow
                          key={alert.id}
                          className={`cursor-pointer transition-colors ${
                            selected?.id === alert.id
                              ? "bg-muted"
                              : "hover:bg-muted/50"
                          }`}
                          role="button"
                          tabIndex={0}
                          aria-label={`View details for ${alert.ticker} ${alert.callPut === "C" ? "call" : "put"} option`}
                          onClick={() => setSelected(alert)}
                          onKeyDown={(event) => handleRowKeyDown(event, alert)}
                        >
                          <TableCell className="font-mono font-medium">
                            {alert.ticker}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                alert.callPut === "C"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {alert.callPut === "C" ? "CALL" : "PUT"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {alert.strike ? formatCurrency(alert.strike) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {alert.expiry ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {alert.premium ? formatPremium(alert.premium) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {alert.volume ? formatNumber(alert.volume) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {alert.openInterest
                              ? formatNumber(alert.openInterest)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                alert.sentiment === "bullish"
                                  ? "text-emerald-400"
                                  : alert.sentiment === "bearish"
                                    ? "text-red-400"
                                    : "text-muted-foreground"
                              }
                            >
                              {alert.sentiment ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {alert.detectedAt ? timeAgo(alert.detectedAt) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selected && (
          <WhaleAlertDetail
            alert={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
