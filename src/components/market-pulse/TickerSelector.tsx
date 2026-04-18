"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MAX_TICKERS = 4;

export default function TickerSelector({
  subscriptions,
  candidates,
  onAdd,
  disabled,
}: {
  subscriptions: string[];
  candidates: string[];
  onAdd: (ticker: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const filteredCandidates = useMemo(
    () =>
      candidates.filter(
        (ticker) =>
          !subscriptions.includes(ticker) &&
          ticker.includes(value.trim().toUpperCase()),
      ),
    [candidates, subscriptions, value],
  );

  const atLimit = subscriptions.length >= MAX_TICKERS;

  return (
    <Card className="border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_42%),linear-gradient(180deg,rgba(7,17,27,0.9),rgba(7,17,27,0.55))]">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>Tracked Tickers</CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Market Pulse keeps a rolling read on up to four symbols, turning
              each 15-minute candle block into structured control events,
              catalyst links, and a live narrative.
            </p>
          </div>
          <Badge variant="outline">
            {subscriptions.length}/{MAX_TICKERS} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase())}
            placeholder="Type a ticker, e.g. AAPL"
            disabled={disabled || atLimit}
            className="md:max-w-xs"
          />
          <Button
            type="button"
            disabled={disabled || atLimit || value.trim().length === 0}
            onClick={() => {
              onAdd(value.trim().toUpperCase());
              setValue("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Ticker
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tickers are being tracked yet.
            </p>
          ) : (
            subscriptions.map((ticker) => (
              <Badge
                key={ticker}
                variant="secondary"
                className="gap-1 px-3 py-1"
              >
                {ticker}
                <X className="h-3 w-3 opacity-50" />
              </Badge>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Suggested from recent flow and news
          </p>
          <div className="flex flex-wrap gap-2">
            {filteredCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matching ticker suggestions right now.
              </p>
            ) : (
              filteredCandidates.slice(0, 12).map((ticker) => (
                <Button
                  key={ticker}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || atLimit}
                  onClick={() => onAdd(ticker)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {ticker}
                </Button>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
