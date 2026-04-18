"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMarketPulseRunDetails } from "@/hooks/useMarketPulse";

type InspectorTarget =
  | { type: "classification"; label: string; runId: string; rowId: number }
  | { type: "correlation"; label: string; runId: string; rowId: number }
  | { type: "narrative"; label: string; runId: string }
  | { type: "run"; label: string; runId: string };

function prettyPrint(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function InspectorDrawer({
  target,
  open,
  onOpenChange,
}: {
  target: InspectorTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useMarketPulseRunDetails(target?.runId);
  const [copied, setCopied] = useState(false);

  const payload = useMemo(() => {
    if (!target || !data) return null;

    if (target.type === "classification") {
      return (
        data.classifications.find(
          (item: { id: number }) => item.id === target.rowId,
        ) ?? null
      );
    }

    if (target.type === "correlation") {
      return (
        data.correlations.find(
          (item: { id: number }) => item.id === target.rowId,
        ) ?? null
      );
    }

    if (target.type === "narrative") {
      return data.narratives?.[0] ?? null;
    }

    return data;
  }, [data, target]);

  const jsonText = payload ? prettyPrint(payload) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border/70">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <SheetTitle>Inspector</SheetTitle>
              <SheetDescription>
                {target?.label ??
                  "Select an event, narrative, or run to inspect the stored structured output."}
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!payload}
              onClick={async () => {
                if (!payload) return;
                await navigator.clipboard.writeText(jsonText);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading run details...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
              {error.message}
            </div>
          ) : payload ? (
            <pre className="overflow-auto rounded-2xl border border-border/70 bg-[#06101b] p-4 font-mono text-xs leading-6 text-slate-200">
              {jsonText}
            </pre>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              No structured payload is available for the current selection.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
