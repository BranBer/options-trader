"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Globe,
  BarChart3,
  Home,
  Radar,
  RefreshCw,
  Menu,
  X,
  Check,
  Loader2,
  Circle,
  AlertTriangle,
  Cpu,
  Zap,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PipelineStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}

interface PipelineStatus {
  active: boolean;
  steps: PipelineStep[];
  startedAt: string | null;
  lastRefreshAt: string | null;
  lastError: { stage: string; message: string; timestamp: string } | null;
  stageResults: {
    fetch: string;
    classify: string;
    analysis: string;
  } | null;
  pipelineHealth?: {
    isStale: boolean;
    minutesSinceRefresh: number | null;
    status: "healthy" | "stale" | "running" | "never_run";
  };
}

const navLinks = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/desk", label: "Desk", icon: Briefcase },
  { href: "/whale-alerts", label: "Whale Alerts", icon: Activity },
  { href: "/globe", label: "Globe", icon: Globe },
  { href: "/tech-globe", label: "Tech Globe", icon: Cpu },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
  { href: "/market-pulse", label: "Market Pulse", icon: Radar },
  { href: "/short-squeeze", label: "Squeeze Scan", icon: Zap },
];

function NavItems({
  pathname,
  onMobileClose,
}: {
  pathname: string;
  onMobileClose?: () => void;
}) {
  return (
    <>
      {navLinks.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onMobileClose}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

function StepIcon({ status }: { status: PipelineStep["status"] }) {
  switch (status) {
    case "done":
      return <Check className="h-3 w-3 text-green-500" />;
    case "active":
      return <Loader2 className="h-3 w-3 text-primary animate-spin" />;
    case "error":
      return <X className="h-3 w-3 text-destructive" />;
    default:
      return <Circle className="h-3 w-3 text-muted-foreground/40" />;
  }
}

function calcProgressPct(steps: PipelineStep[]): number {
  const total = steps.length;
  if (total === 0) return 0;
  let pct = 0;
  for (const step of steps) {
    if (step.status === "done") {
      pct += 100 / total;
    } else if (step.status === "active") {
      const match = step.detail?.match(/(\d+)\/(\d+)/);
      if (match) {
        pct += (parseInt(match[1]) / parseInt(match[2])) * (100 / total);
      } else {
        pct += (100 / total) * 0.3;
      }
    }
  }
  return Math.min(100, pct);
}

export default function Navbar() {
  const pathname = usePathname();
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const pipelineActive = pipeline?.active ?? false;
  const activeStep = pipeline?.steps.find((s) => s.status === "active");
  const progressPct = pipeline?.active ? calcProgressPct(pipeline.steps) : 0;
  const pipelineHealth = pipeline?.pipelineHealth;

  // Poll pipeline status
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/pipeline-status");
        if (!res.ok) return;
        const data: PipelineStatus = await res.json();
        if (active) {
          setPipeline(data);
          if (data.lastRefreshAt) {
            // Keep countdown synced
          }
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerRefresh = useCallback(() => {
    fetch("/api/cron")
      .then(() => setCountdown(30 * 60))
      .catch(() => {});
  }, []);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            aria-label={
              mobileOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="md:hidden inline-flex items-center justify-center rounded-md text-sm font-medium h-9 w-9 hover:bg-muted transition-colors"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <div className="flex flex-col gap-1 mt-6">
              <NavItems
                pathname={pathname}
                onMobileClose={() => setMobileOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Activity className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">Options Intel</span>
        </Link>

        <Separator orientation="vertical" className="h-6 hidden md:block" />

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-1"
          aria-label="Primary navigation"
        >
          <NavItems pathname={pathname} />
        </nav>

        {/* Right side: refresh controls */}
        <div className="ml-auto flex items-center gap-3">
          {/* Pipeline step label */}
          {pipelineActive && activeStep && (
            <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-50">
              {activeStep.label}
              {activeStep.detail && ` (${activeStep.detail})`}
            </span>
          )}

          {/* Story 17.6 — Error indicator when a pipeline stage failed */}
          {!pipelineActive && pipeline?.lastError && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="flex items-center gap-1 text-amber-500" />
                  }
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs hidden sm:inline">Partial</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="w-72 p-3">
                  <p className="text-xs font-semibold mb-1 text-amber-500">
                    Pipeline Stage Failed
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">
                      {pipeline.lastError.stage}
                    </span>
                    : {pipeline.lastError.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Subsequent stages used prior-cycle data
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {!pipelineActive && pipelineHealth && !pipeline?.lastError && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wide ${
                          pipelineHealth.status === "healthy"
                            ? "text-emerald-500 border-emerald-500/40"
                            : pipelineHealth.status === "stale"
                              ? "text-amber-500 border-amber-500/40"
                              : "text-muted-foreground"
                        }`}
                      />
                    </span>
                  }
                >
                  {pipelineHealth.status}
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="w-64 p-3">
                  <p className="text-xs font-semibold mb-1">Pipeline Health</p>
                  <p className="text-xs text-muted-foreground">
                    {pipelineHealth.status === "healthy"
                      ? `Last completed refresh ${pipelineHealth.minutesSinceRefresh ?? 0} minute(s) ago.`
                      : pipelineHealth.status === "stale"
                        ? `No completed refresh for ${pipelineHealth.minutesSinceRefresh ?? "?"} minute(s). In local dev this often means the server was restarted or idle.`
                        : pipelineHealth.status === "never_run"
                          ? "No completed refresh has been recorded in the database yet."
                          : "The pipeline is currently running."}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    View analysis
                    {pipelineHealth.status === "stale" ||
                    pipelineHealth.status === "never_run"
                      ? " — pipeline freshness degraded"
                      : " for recent alert traces"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {countdown > 0 && !pipelineActive && (
            <Badge variant="outline" className="text-xs font-mono">
              {formatCountdown(countdown)}
            </Badge>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={triggerRefresh}
                    disabled={pipelineActive}
                    aria-label={
                      pipelineActive
                        ? "Pipeline running"
                        : "Trigger manual refresh"
                    }
                    title="Trigger manual refresh"
                  />
                }
              >
                <RefreshCw
                  className={`h-4 w-4 ${pipelineActive ? "animate-spin" : ""}`}
                />
              </TooltipTrigger>
              {pipelineActive && pipeline?.steps && (
                <TooltipContent side="bottom" align="end" className="w-64 p-3">
                  <p className="text-xs font-semibold mb-2">
                    Pipeline Progress
                  </p>
                  <div className="space-y-1.5">
                    {pipeline.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <StepIcon status={step.status} />
                        <span
                          className={
                            step.status === "active"
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {step.label}
                        </span>
                        {step.detail && (
                          <span className="ml-auto text-muted-foreground/60 font-mono text-[10px]">
                            {step.detail}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <span className="sr-only" aria-live="polite">
            {pipelineActive
              ? `Pipeline running: ${activeStep?.label ?? "processing"}`
              : pipeline?.lastRefreshAt
                ? `Last refresh ${new Date(pipeline.lastRefreshAt).toLocaleTimeString()}`
                : "No refresh run yet"}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {pipelineActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </header>
  );
}
