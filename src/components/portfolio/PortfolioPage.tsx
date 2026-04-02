"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  usePortfolio,
  usePortfolioTrades,
  useEquityCurve,
  usePortfolioTrade,
  useDeepDive,
} from "@/hooks/useApiData";
import { formatCurrency, timeAgo } from "@/lib/utils/formatters";
import type {
  SimTrade,
  PortfolioStats,
  TradeDecision,
} from "@/types/portfolio";
import type { DeepDiveAnalysis } from "@/types/analysis";
import type {
  AttributionResponse,
  AttributionMissedOpportunity,
  PostmortemResponse,
  PostmortemResult,
  BenchmarkResponse,
  BenchmarkBaseline,
} from "@/types/analytics";
import { ConfidenceBreakdownPanel } from "@/components/shared/ConfidenceBreakdownPanel";
import TechnicalChart from "@/components/shared/TechnicalChart";
import OptionsStatsPanel from "@/components/charts/OptionsStatsPanel";
import LineChart from "@/components/shared/LineChart";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  ShieldAlert,
  Clock,
  Trophy,
  BarChart3,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Percent,
  Activity,
} from "lucide-react";

// ============================================================
// Portfolio Overview Page
// ============================================================

export default function PortfolioPage() {
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  if (selectedTradeId != null) {
    return (
      <TradeDetail
        tradeId={selectedTradeId}
        onBack={() => setSelectedTradeId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Simulated Portfolio
          </h1>
          {process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" && (
            <Badge
              variant="outline"
              className="text-xs border-amber-500/50 text-amber-400"
            >
              MOCK DATA
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          AI-managed paper trading account following whale activity and analysis
          signals. Starting balance: $2,000.
        </p>
      </div>

      <PortfolioOverview />

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open Positions</TabsTrigger>
          <TabsTrigger value="closed">Trade History</TabsTrigger>
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="postmortem">Postmortem</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <TradeList status="open" onSelectTrade={setSelectedTradeId} />
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <TradeList status="closed" onSelectTrade={setSelectedTradeId} />
        </TabsContent>
        <TabsContent value="equity" className="mt-4">
          <EquityCurveSection />
        </TabsContent>
        <TabsContent value="attribution" className="mt-4">
          <AttributionSection />
        </TabsContent>
        <TabsContent value="postmortem" className="mt-4">
          <PostmortemSection />
        </TabsContent>
        <TabsContent value="benchmark" className="mt-4">
          <BenchmarkSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Portfolio Stats Cards
// ============================================================

function PortfolioOverview() {
  const { data, isLoading } = usePortfolio();

  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="h-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const p = data?.portfolio ?? {
    balance: 2000,
    startingBalance: 2000,
    totalPnl: 0,
    totalPnlPct: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    avgPnl: 0,
    maxDrawdown: 0,
    bestTradePnl: 0,
    worstTradePnl: 0,
    sharpeRatio: null,
    openPositions: 0,
    lastUpdated: null,
  };

  return (
    <TooltipProvider>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Balance"
          value={formatCurrency(p.balance)}
          icon={DollarSign}
          description={`Started at ${formatCurrency(p.startingBalance)}`}
          tooltip="Current cash balance in the simulated portfolio. Decreases when opening debit positions and increases when collecting credits or closing profitable trades."
          trend={p.totalPnl}
        />
        <StatCard
          title="Total P&L"
          value={`${p.totalPnl >= 0 ? "+" : ""}${formatCurrency(p.totalPnl)}`}
          icon={p.totalPnl >= 0 ? TrendingUp : TrendingDown}
          description={`${p.totalPnlPct >= 0 ? "+" : ""}${p.totalPnlPct.toFixed(1)}% return`}
          tooltip="Total profit or loss across all closed trades. This is the net gain/loss compared to the starting balance."
          trend={p.totalPnl}
        />
        <StatCard
          title="Win Rate"
          value={`${p.winRate.toFixed(0)}%`}
          icon={Target}
          description={`${p.winningTrades}W / ${p.losingTrades}L of ${p.totalTrades} trades`}
          tooltip="Percentage of closed trades that were profitable. A win rate above 50% combined with a positive average P&L suggests a sound strategy."
          trend={p.winRate > 50 ? 1 : p.winRate === 0 ? 0 : -1}
        />
        <StatCard
          title="Max Drawdown"
          value={`${p.maxDrawdown.toFixed(1)}%`}
          icon={ShieldAlert}
          description={
            p.sharpeRatio != null
              ? `Sharpe: ${p.sharpeRatio.toFixed(2)}`
              : `${p.openPositions} open position${p.openPositions !== 1 ? "s" : ""}`
          }
          tooltip="The largest peak-to-trough decline in portfolio value. Lower is better — it measures the worst-case loss you would have experienced. The Sharpe ratio measures risk-adjusted returns (higher is better, above 1.0 is good)."
          trend={p.maxDrawdown > 20 ? -1 : 0}
        />
      </div>
    </TooltipProvider>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  tooltip,
  trend,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  tooltip: string;
  trend: number;
}) {
  const trendColor =
    trend > 0
      ? "text-emerald-400"
      : trend < 0
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                {title}
                <HelpCircle className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
          <Icon className={`h-4 w-4 ${trendColor}`} />
        </div>
        <p className={`mt-0.5 text-xl font-bold ${trendColor}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Trade List (Open / Closed)
// ============================================================

function TradeList({
  status,
  onSelectTrade,
}: {
  status: "open" | "closed";
  onSelectTrade: (id: number) => void;
}) {
  const { data, isLoading } = usePortfolioTrades(status);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const trades = data?.trades ?? [];

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            {status === "open"
              ? "No open positions yet. The AI will open trades when it finds high-quality opportunities from whale activity and analysis."
              : "No trade history yet. Closed trades will appear here with full P&L breakdowns."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {trades.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          onClick={() => onSelectTrade(trade.id)}
        />
      ))}
    </div>
  );
}

function TradeRow({
  trade,
  onClick,
}: {
  trade: SimTrade;
  onClick: () => void;
}) {
  const isOpen = trade.status === "open";
  const pnl = trade.pnl ?? 0;
  const pnlPct = trade.pnlPct ?? 0;
  const pnlColor =
    pnl > 0
      ? "text-emerald-400"
      : pnl < 0
        ? "text-red-400"
        : "text-muted-foreground";
  const directionColor =
    trade.direction === "bullish"
      ? "text-emerald-400"
      : trade.direction === "bearish"
        ? "text-red-400"
        : "text-yellow-400";

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold">{trade.ticker}</span>
              <Badge variant="outline" className="text-xs">
                {trade.strategyName}
              </Badge>
              <span className={`text-xs ${directionColor}`}>
                {trade.direction}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Entry: {formatCurrency(Math.abs(trade.entryPrice))} •{" "}
              {timeAgo(trade.entryDate)}
              {trade.exitReason && (
                <> • Exit: {formatExitReason(trade.exitReason)}</>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            {isOpen ? (
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400"
              >
                Open
              </Badge>
            ) : (
              <span className={`font-mono font-bold text-sm ${pnlColor}`}>
                {pnl >= 0 ? "+" : ""}
                {formatCurrency(pnl)}
                <span className="text-xs ml-1">
                  ({pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%)
                </span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Equity Curve
// ============================================================

function EquityCurveSection() {
  const { data, isLoading } = useEquityCurve();
  const snapshots = data?.snapshots ?? [];

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Equity curve data will appear after the first portfolio snapshot.
            Snapshots are taken every 30 minutes during pipeline runs.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date),
    value: s.balance,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Portfolio Value Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart
          data={chartData}
          formatValue={(v) => `$${v.toLocaleString()}`}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Trade Detail (Educational Breakdown)
// ============================================================

function TradeDetail({
  tradeId,
  onBack,
}: {
  tradeId: number;
  onBack: () => void;
}) {
  const { data, isLoading } = usePortfolioTrade(tradeId);
  const [showFullReasoning, setShowFullReasoning] = useState(false);

  // Fetch deep-dive analysis for chart overlays (S/R levels, patterns)
  const ticker = data?.trade?.ticker;
  const { data: deepDiveData } = useDeepDive(ticker);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const trade = data?.trade;
  if (!trade) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Trade not found.</p>
        <button onClick={onBack} className="text-sm text-blue-400 mt-2">
          ← Back to portfolio
        </button>
      </div>
    );
  }

  const decision = trade.geminiReasoning as TradeDecision | null;
  const deepDive = deepDiveData?.analyses?.[0]?.output as
    | DeepDiveAnalysis
    | undefined;
  const pnl = trade.pnl ?? 0;
  const pnlPct = trade.pnlPct ?? 0;
  const pnlColor =
    pnl > 0
      ? "text-emerald-400"
      : pnl < 0
        ? "text-red-400"
        : "text-muted-foreground";
  const isOpen = trade.status === "open";

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Back button + Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to portfolio
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold font-mono">{trade.ticker}</h2>
          <Badge variant="outline">{trade.strategyName}</Badge>
          <Badge
            variant={isOpen ? "default" : pnl >= 0 ? "default" : "destructive"}
            className={
              isOpen
                ? "border-blue-500/30 text-blue-400"
                : pnl >= 0
                  ? "border-emerald-500/30 text-emerald-400"
                  : ""
            }
          >
            {isOpen
              ? "Open"
              : `Closed · ${formatExitReason(trade.exitReason ?? "")}`}
          </Badge>
        </div>

        {/* Educational Summary — prominent placement for beginners */}
        {decision?.educational_summary && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-400 mb-1">
                    What does this trade do? (Plain English)
                  </p>
                  <p className="text-sm text-foreground/90">
                    {decision.educational_summary}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confidence Breakdown — shows how the AI scored each signal factor */}
        {data?.confidenceBreakdown && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <ConfidenceBreakdownPanel breakdown={data.confidenceBreakdown} />
            </CardContent>
          </Card>
        )}

        {/* Price Chart — stock price context with trade strike levels */}
        {ticker && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <TechnicalChart
                ticker={ticker}
                supportResistance={deepDive?.support_resistance}
                technicalPatterns={deepDive?.technical_patterns}
              />
            </CardContent>
          </Card>
        )}

        {/* Trade Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Entry Price"
            value={formatCurrency(Math.abs(trade.entryPrice))}
            icon={DollarSign}
          />
          <MetricCard
            label="Entry Date"
            value={new Date(trade.entryDate).toLocaleDateString()}
            icon={Clock}
          />
          {!isOpen && trade.exitPrice != null && (
            <MetricCard
              label="Exit Price"
              value={formatCurrency(Math.abs(trade.exitPrice))}
              icon={DollarSign}
            />
          )}
          {!isOpen && (
            <MetricCard
              label="P&L"
              value={`${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`}
              icon={pnl >= 0 ? TrendingUp : TrendingDown}
              valueColor={pnlColor}
            />
          )}
          <MetricCard
            label="Profit Target"
            value={`${trade.profitTargetPct?.toFixed(0) ?? "—"}%`}
            icon={Target}
          />
          <MetricCard
            label="Stop Loss"
            value={`${trade.stopLossPct?.toFixed(0) ?? "—"}%`}
            icon={ShieldAlert}
          />
          <MetricCard
            label="Time Limit"
            value={`${trade.timeExitDays ?? "—"} days`}
            icon={Clock}
          />
          {/* IV Regime — from confidence breakdown factors */}
          {data?.confidenceBreakdown?.factors &&
            (() => {
              const ivFactor = data.confidenceBreakdown.factors.find(
                (f) => f.name === "IV Regime",
              );
              if (!ivFactor) return null;
              const regime =
                ivFactor.value >= 0.7
                  ? "Elevated"
                  : ivFactor.value >= 0.4
                    ? "Normal"
                    : "Low";
              const color =
                ivFactor.value >= 0.7
                  ? "text-amber-400"
                  : ivFactor.value >= 0.4
                    ? "text-emerald-400"
                    : "text-blue-400";
              return (
                <MetricCard
                  label="IV Regime"
                  value={regime}
                  icon={Activity}
                  valueColor={color}
                />
              );
            })()}
          {/* Insider Alignment — from confidence breakdown factors */}
          {data?.confidenceBreakdown?.factors &&
            (() => {
              const insiderFactor = data.confidenceBreakdown.factors.find(
                (f) => f.name === "Insider Alignment",
              );
              if (!insiderFactor) return null;
              const alignment =
                insiderFactor.value >= 0.6
                  ? "Bullish"
                  : insiderFactor.value >= 0.4
                    ? "Neutral"
                    : "Bearish";
              const color =
                insiderFactor.value >= 0.6
                  ? "text-emerald-400"
                  : insiderFactor.value >= 0.4
                    ? "text-muted-foreground"
                    : "text-red-400";
              return (
                <MetricCard
                  label="Insider Alignment"
                  value={alignment}
                  icon={TrendingUp}
                  valueColor={color}
                />
              );
            })()}
        </div>

        {/* Strategy Legs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Strategy Legs
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Each &quot;leg&quot; is one part of the options trade. Buy =
                    paying premium, Sell = collecting premium. Call = profits
                    when price goes up, Put = profits when price goes down.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trade.legs.map((leg, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        leg.action === "buy"
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-red-500/30 text-red-400"
                      }
                    >
                      {leg.action.toUpperCase()}
                    </Badge>
                    <span className="font-mono">
                      {leg.type.toUpperCase()} ${leg.strike}
                    </span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span>exp {leg.expiry}</span>
                    <span className="ml-2 font-mono">
                      @ {formatCurrency(leg.premium)}
                    </span>
                    <span className="ml-2">×{leg.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Options & Market Context — from deep dive analysis */}
        {deepDive?.options_context && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <OptionsStatsPanel optionsContext={deepDive.options_context} />
            </CardContent>
          </Card>
        )}

        {/* Gemini Reasoning */}
        {decision && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                AI Decision Reasoning
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      This is the AI&apos;s full reasoning for why it decided to
                      enter this trade. Transparency is key — you should always
                      understand why a trade was made.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{decision.reasoning}</p>

              {decision.risk_notes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Risk Notes
                    </p>
                    <ul className="space-y-1">
                      {decision.risk_notes.map((note, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1"
                        >
                          <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Position size:{" "}
                  <span className="font-mono text-foreground">
                    {formatCurrency(decision.position_size_dollars)}
                  </span>
                </span>
                <span>
                  Strategy:{" "}
                  <span className="text-foreground">
                    {decision.adjusted_entry.strategy_name}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source Signals — trace trade back to whale alert & analysis */}
        {(data?.sourceWhale || data?.sourceAnalysis) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Source Signals
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Every trade originates from a detected whale alert that
                      was analyzed by the AI pipeline. This shows the original
                      signals that led to this trade.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.sourceWhale && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-medium">
                      Whale Alert #{data.sourceWhale.id}
                    </span>
                    <Badge
                      variant={
                        data.sourceWhale.sentiment === "bullish"
                          ? "default"
                          : "destructive"
                      }
                      className="text-xs"
                    >
                      {data.sourceWhale.sentiment}
                    </Badge>
                    {data.sourceWhale.qualityScore != null && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Quality: {data.sourceWhale.qualityScore}/100
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Strike</span>
                      <p className="font-mono">
                        ${data.sourceWhale.strike?.toFixed(0) ?? "—"}{" "}
                        {data.sourceWhale.callPut === "C" ? "Call" : "Put"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expiry</span>
                      <p className="font-mono">
                        {data.sourceWhale.expiry ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Premium</span>
                      <p className="font-mono">
                        {data.sourceWhale.premium != null
                          ? formatCurrency(data.sourceWhale.premium)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vol / OI</span>
                      <p className="font-mono">
                        {data.sourceWhale.volume?.toLocaleString() ?? "—"} /{" "}
                        {data.sourceWhale.openInterest?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                  </div>
                  {data.sourceWhale.detectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Detected:{" "}
                      {new Date(data.sourceWhale.detectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {data.sourceAnalysis && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium">
                      AI Analysis #{data.sourceAnalysis.id}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {data.sourceAnalysis.type?.replace(/_/g, " ")}
                    </Badge>
                    {data.sourceAnalysis.confidence != null && (
                      <span className="text-xs text-muted-foreground ml-auto font-mono">
                        {(data.sourceAnalysis.confidence * 100).toFixed(0)}%
                        confidence
                      </span>
                    )}
                  </div>
                  {data.sourceAnalysis.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      Generated:{" "}
                      {new Date(data.sourceAnalysis.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Attribution — did this trade capture a whale opportunity? */}
        {data?.sourceWhale && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Opportunity Attribution
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Whether this trade successfully captured a whale-driven
                      opportunity. Shows the original whale alert quality and
                      how the trade performed relative to expectations.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AttributionCard
                ticker={trade.ticker}
                sentiment={data.sourceWhale.sentiment ?? "neutral"}
                qualityScore={data.sourceWhale.qualityScore}
                premium={data.sourceWhale.premium}
                pnl={pnl}
                pnlPct={pnlPct}
                isOpen={isOpen}
              />
            </CardContent>
          </Card>
        )}

        {/* Postmortem — avoidable loss classification for closed losing trades */}
        {!isOpen && pnl < 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Postmortem Analysis
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Classification of whether this loss was avoidable based on
                      pre-trade signals that were available at entry time.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PostmortemCard
                tradeId={trade.id}
                ticker={trade.ticker}
                entryDate={trade.entryDate}
                exitDate={trade.exitDate ?? ""}
                entryPrice={Number(trade.entryPrice)}
                exitPrice={Number(trade.exitPrice)}
                pnl={pnl}
                pnlPct={pnlPct}
              />
            </CardContent>
          </Card>
        )}

        {/* Lifecycle Timeline — chronological journey of the trade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Trade Lifecycle
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    The full journey of this trade — from the original whale
                    alert detection, through AI analysis, to entry and (if
                    closed) exit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TradeTimeline
              whaleDetectedAt={data?.sourceWhale?.detectedAt ?? null}
              analysisCreatedAt={data?.sourceAnalysis?.createdAt ?? null}
              entryDate={trade.entryDate}
              exitDate={trade.exitDate ?? null}
              exitReason={trade.exitReason ?? null}
              isOpen={isOpen}
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Attribution Section (Missed Opportunities)
// ============================================================

function AttributionSection() {
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=attribution")
      .then((r) => r.json())
      .then((d) => {
        setData(d.attribution);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Attribution data will appear once there are whale alerts and trades
            to analyze.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard
          title="Capture Rate"
          value={`${data.captureRate?.toFixed(1) ?? 0}%`}
          icon={Target}
          description={`${data.capturedCount ?? 0} of ${data.totalCandidates ?? 0} alerts`}
          tooltip="Percentage of whale alerts that resulted in a trade. Higher is better — it means the algorithm is capturing opportunities."
          trend={data.captureRate > 50 ? 1 : data.captureRate > 20 ? 0 : -1}
        />
        <StatCard
          title="Captured"
          value={data.capturedCount?.toString() ?? "0"}
          icon={TrendingUp}
          description="Whale alerts traded"
          tooltip="Number of whale alerts that the algorithm successfully traded on."
          trend={1}
        />
        <StatCard
          title="Missed"
          value={data.missedCount?.toString() ?? "0"}
          icon={TrendingDown}
          description="Whale alerts not traded"
          tooltip="Number of whale alerts that were not traded. Some may have been intentionally skipped due to low quality scores."
          trend={-1}
        />
      </div>

      {data.missed?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Missed High-Quality Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.missed.map((m: AttributionMissedOpportunity, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{m.ticker}</span>
                    <Badge variant="outline" className="text-xs">
                      {m.sentiment}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Quality: {m.qualityScore ?? "?"}/100
                    </span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {m.missReason?.replace(/_/g, " ") ?? "unknown"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Postmortem Section (Bad Trade Analysis)
// ============================================================

function PostmortemSection() {
  const [data, setData] = useState<PostmortemResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=postmortem")
      .then((r) => r.json())
      .then((d) => {
        setData(d.postmortem);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Postmortem data will appear once there are closed losing trades to
            analyze.
          </p>
        </CardContent>
      </Card>
    );
  }

  const avoidableResults =
    data.results?.filter((r: PostmortemResult) => r.isAvoidable) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <StatCard
          title="Avoidable Losses"
          value={data.avoidableCount?.toString() ?? "0"}
          icon={ShieldAlert}
          description="Losses that could have been prevented"
          tooltip="Number of losing trades that were likely avoidable based on pre-trade signals."
          trend={-1}
        />
        <StatCard
          title="Unavoidable Losses"
          value={data.unavoidableCount?.toString() ?? "0"}
          icon={Activity}
          description="Market noise — no fault"
          tooltip="Number of losing trades that appear unavoidable given the information available at entry time."
          trend={0}
        />
      </div>

      {avoidableResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Avoidable Losses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {avoidableResults.map((r: PostmortemResult, i: number) => (
                <div key={i} className="p-3 rounded bg-muted/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">
                        {r.ticker ?? `Trade #${r.tradeId}`}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        {r.avoidableCategory?.replace(/_/g, " ") ?? "unknown"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Risk: {r.riskScore}/100
                    </span>
                  </div>
                  {r.preTradeWarnings?.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {r.preTradeWarnings.map((w: string, j: number) => (
                        <li key={j} className="flex items-start gap-1">
                          <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Benchmark Section (Algorithm Comparison)
// ============================================================

function BenchmarkSection() {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=benchmark")
      .then((r) => r.json())
      .then((d) => {
        setData(d.benchmark);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleExport = () => {
    if (!data?.report) return;
    const blob = new Blob([data.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmark-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Benchmark data will appear once there are trades to compare against
            baseline strategies.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
        >
          <BarChart3 className="h-3 w-3" />
          Export Report
        </button>
      </div>
      {/* Current Algorithm vs Best Baseline */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard
          title="Win Rate vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.winRateDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.winRateDiff?.toFixed(1) ?? 0}%`}
          icon={Target}
          description="Current algorithm vs best baseline"
          tooltip="Difference in win rate between the current algorithm and the best-performing baseline strategy."
          trend={
            data.comparison?.currentVsBestBaseline?.winRateDiff >= 0 ? 1 : -1
          }
        />
        <StatCard
          title="P&L vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.pnlDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.pnlDiff?.toFixed(2) ?? 0}%`}
          icon={
            data.comparison?.currentVsBestBaseline?.pnlDiff >= 0
              ? TrendingUp
              : TrendingDown
          }
          description="Current algorithm vs best baseline"
          tooltip="Difference in total P&L between the current algorithm and the best-performing baseline strategy."
          trend={data.comparison?.currentVsBestBaseline?.pnlDiff >= 0 ? 1 : -1}
        />
        <StatCard
          title="Sharpe vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.sharpeDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.sharpeDiff?.toFixed(2) ?? 0}`}
          icon={BarChart3}
          description="Current algorithm vs best baseline"
          tooltip="Difference in Sharpe ratio between the current algorithm and the best-performing baseline strategy."
          trend={
            data.comparison?.currentVsBestBaseline?.sharpeDiff >= 0 ? 1 : -1
          }
        />
      </div>

      {/* Baseline Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Baseline Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Current Algorithm */}
            <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-400">
                  {data.current?.name ?? "Current Algorithm"}
                </span>
                <Badge
                  variant="outline"
                  className="border-blue-500/30 text-blue-400"
                >
                  Your Strategy
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Win Rate</span>
                  <p className="font-mono">
                    {data.current?.metrics?.winRate?.toFixed(1) ?? 0}%
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total P&L</span>
                  <p className="font-mono">
                    {data.current?.metrics?.totalPnlPct?.toFixed(2) ?? 0}%
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sharpe</span>
                  <p className="font-mono">
                    {data.current?.metrics?.sharpeRatio?.toFixed(2) ?? 0}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max DD</span>
                  <p className="font-mono">
                    {data.current?.metrics?.maxDrawdownPct?.toFixed(2) ?? 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Baselines */}
            {data.baselines?.map((b: BenchmarkBaseline, i: number) => (
              <div key={i} className="p-3 rounded bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">{b.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Win Rate</span>
                    <p className="font-mono">
                      {b.metrics?.winRate?.toFixed(1) ?? 0}%
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total P&L</span>
                    <p className="font-mono">
                      {b.metrics?.totalPnlPct?.toFixed(2) ?? 0}%
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sharpe</span>
                    <p className="font-mono">
                      {b.metrics?.sharpeRatio?.toFixed(2) ?? 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max DD</span>
                    <p className="font-mono">
                      {b.metrics?.maxDrawdownPct?.toFixed(2) ?? 0}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PostmortemCard (inline classification for trade detail)
// ============================================================

function PostmortemCard({
  tradeId,
  ticker,
  entryDate,
  exitDate,
  entryPrice,
  exitPrice,
  pnl,
  pnlPct,
}: {
  tradeId: number;
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
}) {
  const [result, setResult] = useState<PostmortemResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=postmortem")
      .then((r) => r.json())
      .then((d) => {
        const postmortem = d.postmortem;
        const match = postmortem?.results?.find(
          (r: PostmortemResult) => r.tradeId === tradeId,
        );
        setResult(match ?? null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [tradeId]);

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded bg-muted" />;
  }

  if (!result) {
    return (
      <p className="text-xs text-muted-foreground">
        Postmortem data not available for this trade.
      </p>
    );
  }

  if (!result.isAvoidable) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Activity className="h-4 w-4 text-blue-400" />
        <span className="text-blue-400 font-medium">Unavoidable Loss</span>
        <span className="text-muted-foreground text-xs">
          — This loss appears to be market noise given the pre-trade signals.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <span className="text-red-400 font-medium text-sm">Avoidable Loss</span>
        <Badge variant="destructive" className="text-xs">
          {result.avoidableCategory?.replace(/_/g, " ") ?? "unknown"}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          Risk score: {result.riskScore}/100
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{result.explanation}</p>
      {result.preTradeWarnings?.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {result.preTradeWarnings.map((w: string, i: number) => (
            <li key={i} className="flex items-start gap-1">
              <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// AttributionCard (inline attribution for trade detail)
// ============================================================

function AttributionCard({
  ticker,
  sentiment,
  qualityScore,
  premium,
  pnl,
  pnlPct,
  isOpen,
}: {
  ticker: string;
  sentiment: string;
  qualityScore: number | null;
  premium: number | null;
  pnl: number;
  pnlPct: number;
  isOpen: boolean;
}) {
  if (isOpen) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Target className="h-4 w-4 text-blue-400" />
        <span className="text-blue-400 font-medium">Open Position</span>
        <span className="text-muted-foreground text-xs">
          — Attribution will be calculated when this trade closes.
        </span>
      </div>
    );
  }

  const isCaptured = pnl >= 0;
  const qualityLabel =
    qualityScore != null
      ? qualityScore >= 80
        ? "High"
        : qualityScore >= 60
          ? "Medium"
          : "Low"
      : "Unknown";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isCaptured ? (
          <>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-emerald-400 font-medium text-sm">
              Captured Opportunity
            </span>
          </>
        ) : (
          <>
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-red-400 font-medium text-sm">
              Opportunity Lost
            </span>
          </>
        )}
        <Badge
          variant="outline"
          className={
            sentiment === "bullish"
              ? "border-emerald-500/30 text-emerald-400"
              : "border-red-500/30 text-red-400"
          }
        >
          {sentiment}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Whale Quality</span>
          <p className="font-mono">
            {qualityScore != null
              ? `${qualityScore}/100 (${qualityLabel})`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Premium</span>
          <p className="font-mono">
            {premium != null ? formatCurrency(premium) : "—"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Result</span>
          <p
            className={`font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {pnl >= 0 ? "+" : ""}
            {pnlPct.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Small helpers
// ============================================================

function MetricCard({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <p className={`text-sm font-bold font-mono ${valueColor ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function formatExitReason(reason: string): string {
  const map: Record<string, string> = {
    profit_target: "Profit Target",
    stop_loss: "Stop Loss",
    time_exit: "Time Limit",
    expiry: "Expired",
    manual: "Manual",
    insufficient_data: "No Data",
  };
  return map[reason] ?? reason;
}

function TradeTimeline({
  whaleDetectedAt,
  analysisCreatedAt,
  entryDate,
  exitDate,
  exitReason,
  isOpen,
}: {
  whaleDetectedAt: string | null;
  analysisCreatedAt: string | null;
  entryDate: string;
  exitDate: string | null;
  exitReason: string | null;
  isOpen: boolean;
}) {
  const events: { label: string; time: string; icon: string; color: string }[] =
    [];

  if (whaleDetectedAt) {
    events.push({
      label: "Whale Alert Detected",
      time: new Date(whaleDetectedAt).toLocaleString(),
      icon: "🐋",
      color: "border-blue-500",
    });
  }
  if (analysisCreatedAt) {
    events.push({
      label: "AI Analysis Generated",
      time: new Date(analysisCreatedAt).toLocaleString(),
      icon: "🤖",
      color: "border-purple-500",
    });
  }
  events.push({
    label: "Trade Entered",
    time: new Date(entryDate).toLocaleString(),
    icon: "📈",
    color: "border-emerald-500",
  });
  if (!isOpen && exitDate) {
    events.push({
      label: `Trade Closed — ${formatExitReason(exitReason ?? "")}`,
      time: new Date(exitDate).toLocaleString(),
      icon: "🏁",
      color:
        exitReason === "profit_target"
          ? "border-emerald-500"
          : "border-red-500",
    });
  } else if (isOpen) {
    events.push({
      label: "Position Open",
      time: "Now",
      icon: "⏳",
      color: "border-amber-500",
    });
  }

  return (
    <div className="relative space-y-0">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3 pb-4 last:pb-0">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div
              className={`w-6 h-6 rounded-full border-2 ${event.color} bg-background flex items-center justify-center text-xs`}
            >
              {event.icon}
            </div>
            {i < events.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-4" />
            )}
          </div>
          {/* Content */}
          <div className="pt-0.5">
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">{event.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
