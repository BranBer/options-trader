"use client";

import {
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { useHistoricalData } from "@/hooks/useApiData";
import type { TechnicalPattern } from "@/types/analysis";
import type { DeepDiveAnalysis } from "@/types/analysis";
import {
  CHART_HISTORY_LABELS,
  CHART_HISTORY_PERIODS,
  type ChartHistoryPeriod,
} from "@/lib/utils/chart-timeframes";
import { getTechnicalPatternsForTimeframe } from "@/lib/utils/deep-dive-patterns";
import { detectAllIndicatorPatterns } from "@/lib/utils/indicator-patterns";
import type { IndicatorPattern } from "@/lib/utils/indicator-patterns";
import type { Candle } from "@/lib/utils/technical-indicators";
import PriceChart, {
  type IndicatorConfig,
  type PriceChartHandle,
} from "@/components/charts/PriceChart";
import type { EconomicEvent } from "@/lib/utils/economic-calendar";
import type { TriggerMarker } from "@/components/charts/PriceChart";
import type { TriggerAnnotation } from "@/lib/utils/trigger-annotations";
import {
  buildIntradayResistanceLevels,
  buildIntradaySupportLevels,
  getIntradayResistanceControl,
  getIntradaySupportControl,
  summarizeIntradayResistance,
  summarizeIntradaySupport,
  type IntradayResistanceLevel,
  type IntradaySupportLevel,
} from "@/lib/utils/intraday-resistance";
import PatternLegendBar from "@/components/charts/PatternLegendBar";
import type { CalloutEntry } from "@/components/charts/primitives/CalloutAnnotationPrimitive";
import ChartLegend from "@/components/charts/ChartLegend";
import { Eye, EyeOff, HelpCircle } from "lucide-react";
import {
  IndicatorGuidePanel,
  InfoTooltip,
} from "@/components/charts/IndicatorExplainers";
import IndicatorPatternSummary from "@/components/charts/IndicatorPatternSummary";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type IntradayGuideEntry = {
  label: string;
  fullName: string;
  description: string;
  tradingUse: string;
};

const INTRADAY_LEVEL_GUIDE: Record<string, IntradayGuideEntry> = {
  ORH: {
    label: "ORH",
    fullName: "Opening Range High",
    description:
      "The high from the first 30 minutes of regular trading. It is often the first price area sellers defend if the stock tries to push higher.",
    tradingUse:
      "A clean break above ORH can signal early strength. A rejection there can confirm short-term resistance.",
  },
  ORL: {
    label: "ORL",
    fullName: "Opening Range Low",
    description:
      "The low from the first 30 minutes of regular trading. It marks the first meaningful intraday support zone.",
    tradingUse:
      "Holding ORL can suggest buyers are defending the session. Losing ORL often weakens the short-term setup.",
  },
  PMH: {
    label: "PMH",
    fullName: "Premarket High",
    description:
      "The highest price traded before the opening bell. It shows where overnight sellers previously stepped in.",
    tradingUse:
      "If price reclaims PMH during the day, it can confirm improving momentum. If it fails there, the overnight ceiling is still active.",
  },
  PML: {
    label: "PML",
    fullName: "Premarket Low",
    description:
      "The lowest price traded before the opening bell. It often acts as an early downside reference for intraday buyers.",
    tradingUse:
      "If price holds above PML, the overnight floor is still intact. A break below it can signal weaker intraday demand.",
  },
  PDH: {
    label: "PDH",
    fullName: "Prior-Day High",
    description:
      "Yesterday's high. Traders watch it because prior session extremes often carry forward as resistance.",
    tradingUse:
      "Breaking above PDH can show continuation. Repeated failure there can confirm overhead supply.",
  },
  PDL: {
    label: "PDL",
    fullName: "Prior-Day Low",
    description:
      "Yesterday's low. Traders use it as a carryover support level when price moves lower during the current session.",
    tradingUse:
      "Holding PDL can keep a bounce thesis alive. Losing it can open the door to more downside.",
  },
  PDC: {
    label: "PDC",
    fullName: "Prior-Day Close",
    description:
      "Yesterday's closing price. It often behaves like a balance line where the market decides whether it accepts or rejects prior-day value.",
    tradingUse:
      "Trading back above PDC can restore balance after weakness. Falling back below it can show the prior close is now resistance.",
  },
  "VWAP +1σ": {
    label: "VWAP +1σ",
    fullName: "VWAP Plus One Standard Deviation",
    description:
      "A volatility band above session VWAP. It shows price is stretching above average value for the day.",
    tradingUse:
      "Useful for spotting overextended upside. The farther price moves beyond VWAP, the more likely traders look for pause or mean reversion.",
  },
  "VWAP -1σ": {
    label: "VWAP -1σ",
    fullName: "VWAP Minus One Standard Deviation",
    description:
      "A volatility band below session VWAP. It shows price is stretching below average value for the day.",
    tradingUse:
      "Useful for spotting washed-out downside. It can act as a bounce zone if sellers are becoming exhausted.",
  },
  "AVWAP LOD": {
    label: "AVWAP LOD",
    fullName: "Anchored VWAP From Low of Day",
    description:
      "An anchored VWAP measured from the session low. It approximates the average price paid by buyers since the reversal low formed.",
    tradingUse:
      "If price stays above AVWAP LOD, buyers who stepped in at the low are still in control. Losing it can show that bounce is fading.",
  },
  "AVWAP HOD": {
    label: "AVWAP HOD",
    fullName: "Anchored VWAP From High of Day",
    description:
      "An anchored VWAP measured from the session high. It approximates the average price of participants active after the high formed.",
    tradingUse:
      "If price cannot reclaim AVWAP HOD after a drop, the post-high sellers still have control. Reclaiming it can improve the recovery case.",
  },
};

const INTRADAY_GUIDE_ORDER = [
  "ORH",
  "ORL",
  "PMH",
  "PML",
  "PDH",
  "PDL",
  "PDC",
  "VWAP +1σ",
  "VWAP -1σ",
  "AVWAP LOD",
  "AVWAP HOD",
] as const;

function extractIntradayGuideEntries(
  levels: Array<IntradayResistanceLevel | IntradaySupportLevel>,
): IntradayGuideEntry[] {
  const labels = new Set<string>();

  for (const level of levels) {
    for (const labelPart of level.label.split("/")) {
      const trimmed = labelPart.trim();
      if (trimmed in INTRADAY_LEVEL_GUIDE) {
        labels.add(trimmed);
      }
    }
  }

  return INTRADAY_GUIDE_ORDER.filter((label) => labels.has(label)).map(
    (label) => INTRADAY_LEVEL_GUIDE[label],
  );
}

function getIntradayGuideEntry(label: string): IntradayGuideEntry | null {
  return INTRADAY_LEVEL_GUIDE[label] ?? null;
}

/** Convert client-side indicator patterns into TechnicalPattern[] for chart overlays. */
function indicatorPatternsToOverlays(
  patterns: IndicatorPattern[],
  candles: Candle[],
): TechnicalPattern[] {
  return patterns
    .filter(
      (p) => p.isRecent && p.detectedAt >= 0 && p.detectedAt < candles.length,
    )
    .map((p) => {
      const candle = candles[p.detectedAt];
      const time =
        typeof candle.time === "number"
          ? new Date(candle.time * 1000).toISOString()
          : candle.time;
      return {
        name: p.name,
        type: p.signal,
        description: p.description,
        confidence: p.confidence,
        timeframe: null,
        price_target: null,
        drawing_type: "marker" as const,
        start_time: time,
        end_time: time,
        start_price: p.signal === "bearish" ? candle.high : candle.low,
        end_price: p.signal === "bearish" ? candle.high : candle.low,
        secondary_start_price: null,
        secondary_end_price: null,
        indicator: p.indicator,
      };
    });
}

const INDICATOR_OPTIONS: {
  key: keyof IndicatorConfig;
  label: string;
  color: string;
}[] = [
  { key: "ema9", label: "EMA 9", color: "bg-cyan-500" },
  { key: "ema21", label: "EMA 21", color: "bg-orange-500" },
  { key: "bollinger", label: "BB", color: "bg-blue-400" },
  { key: "volumeMA", label: "Vol MA", color: "bg-white/60" },
  { key: "rsi", label: "RSI", color: "bg-purple-500" },
  { key: "macd", label: "MACD", color: "bg-blue-500" },
];

interface TechnicalChartProps {
  ticker: string;
  supportResistance?: DeepDiveAnalysis["support_resistance"];
  technicalPatterns?: TechnicalPattern[];
  technicalPatternsByTimeframe?: DeepDiveAnalysis["timeframe_patterns"];
  /** Entry price line (green for bullish, red for bearish) */
  entryPrice?: number;
  /** Exit price line (shown only for closed trades) */
  exitPrice?: number;
  /** Pattern hover index shared with external pattern list */
  hoveredPatternIndex?: number | null;
  onHoveredPattern?: (idx: number | null) => void;
  height?: number;
  /** Options context for OI walls / max pain / GEX flip lines */
  optionsContext?: DeepDiveAnalysis["options_context"];
  /** Which computed indicators to display */
  indicators?: IndicatorConfig;
  timeframe?: ChartHistoryPeriod;
  onTimeframeChange?: (timeframe: ChartHistoryPeriod) => void;
  /** Economic event markers to overlay on the chart */
  economicEvents?: EconomicEvent[];
  /** Trigger markers from the trigger engine to overlay on the chart */
  triggerMarkers?: TriggerMarker[];
  /** Trigger interaction drawings derived from the trigger engine */
  triggerAnnotations?: TriggerAnnotation[];
}

export interface TechnicalChartHandle {
  takeScreenshot: () => string | null;
}

const TechnicalChart = forwardRef<TechnicalChartHandle, TechnicalChartProps>(
  function TechnicalChart(
    {
      ticker,
      supportResistance,
      technicalPatterns,
      technicalPatternsByTimeframe,
      entryPrice,
      exitPrice,
      hoveredPatternIndex = null,
      onHoveredPattern,
      height = 300,
      optionsContext,
      indicators,
      timeframe,
      onTimeframeChange,
      economicEvents,
      triggerMarkers,
      triggerAnnotations,
    },
    ref,
  ) {
    const priceChartRef = useRef<PriceChartHandle>(null);

    useImperativeHandle(ref, () => ({
      takeScreenshot: () => priceChartRef.current?.takeScreenshot() ?? null,
    }));
    const [internalTimeframe, setInternalTimeframe] =
      useState<ChartHistoryPeriod>("3mo");
    const [showPatterns, setShowPatterns] = useState(true);
    const [showAllSignals, setShowAllSignals] = useState(false);
    const [calloutEntries, setCalloutEntries] = useState<CalloutEntry[]>([]);
    const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig>({
      ema9: false,
      ema21: false,
      bollinger: false,
      volumeMA: false,
      rsi: false,
      macd: false,
    });

    // Merge external indicators prop with local toggle state
    const mergedIndicators: IndicatorConfig = indicators
      ? { ...activeIndicators, ...indicators }
      : activeIndicators;
    const activeTimeframe = timeframe ?? internalTimeframe;
    const activePatterns = useMemo(
      () =>
        getTechnicalPatternsForTimeframe({
          technicalPatterns,
          timeframePatterns: technicalPatternsByTimeframe,
          period: activeTimeframe,
        }),
      [activeTimeframe, technicalPatterns, technicalPatternsByTimeframe],
    );

    const handleTimeframeChange = useCallback(
      (nextTimeframe: ChartHistoryPeriod) => {
        onTimeframeChange?.(nextTimeframe);
        if (!timeframe) {
          setInternalTimeframe(nextTimeframe);
        }
      },
      [onTimeframeChange, timeframe],
    );

    const toggleIndicator = useCallback((key: keyof IndicatorConfig) => {
      setActiveIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const { data: histData, isLoading } = useHistoricalData(
      ticker,
      activeTimeframe,
    );
    const { data: dailyHistData } = useHistoricalData(ticker, "1mo");
    const candles = histData?.candles ?? [];
    const dailyCandles = dailyHistData?.candles ?? [];
    const indicatorPatternReport = useMemo(
      () =>
        candles.length > 0
          ? detectAllIndicatorPatterns(candles, ticker, activeTimeframe)
          : null,
      [activeTimeframe, candles, ticker],
    );

    const indicatorOverlays = useMemo(
      () =>
        indicatorPatternReport
          ? indicatorPatternsToOverlays(
              indicatorPatternReport.patterns,
              candles,
            )
          : [],
      [indicatorPatternReport, candles],
    );

    const mergedPatterns = useMemo(
      () => [...activePatterns, ...indicatorOverlays],
      [activePatterns, indicatorOverlays],
    );

    const intradayResistanceLevels = useMemo<IntradayResistanceLevel[]>(
      () =>
        activeTimeframe === "1d"
          ? buildIntradayResistanceLevels({
              intradayCandles: candles,
              dailyCandles,
            })
          : [],
      [activeTimeframe, candles, dailyCandles],
    );

    const intradaySupportLevels = useMemo<IntradaySupportLevel[]>(
      () =>
        activeTimeframe === "1d"
          ? buildIntradaySupportLevels({
              intradayCandles: candles,
              dailyCandles,
            })
          : [],
      [activeTimeframe, candles, dailyCandles],
    );

    const intradayControl = useMemo(
      () => getIntradayResistanceControl(intradayResistanceLevels),
      [intradayResistanceLevels],
    );

    const intradaySupportControl = useMemo(
      () => getIntradaySupportControl(intradaySupportLevels),
      [intradaySupportLevels],
    );

    const intradayResistanceSummary = useMemo(
      () =>
        candles.length > 0
          ? summarizeIntradayResistance(
              intradayResistanceLevels,
              candles[candles.length - 1].close,
            )
          : "",
      [candles, intradayResistanceLevels],
    );

    const intradaySupportSummary = useMemo(
      () =>
        candles.length > 0
          ? summarizeIntradaySupport(
              intradaySupportLevels,
              candles[candles.length - 1].close,
            )
          : "",
      [candles, intradaySupportLevels],
    );

    const intradayGuideEntries = useMemo(
      () =>
        activeTimeframe === "1d"
          ? extractIntradayGuideEntries([
              ...intradayResistanceLevels,
              ...intradaySupportLevels,
            ])
          : [],
      [activeTimeframe, intradayResistanceLevels, intradaySupportLevels],
    );

    const hasAnyPatterns =
      mergedPatterns.length > 0 ||
      (technicalPatterns?.length ?? 0) > 0 ||
      Object.values(technicalPatternsByTimeframe ?? {}).some(
        (patterns) => (patterns?.length ?? 0) > 0,
      );

    const handleHover = useCallback(
      (idx: number | null) => onHoveredPattern?.(idx),
      [onHoveredPattern],
    );

    return (
      <div className="space-y-2">
        {/* Controls row */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Price Action</p>
          <div className="flex items-center gap-2">
            {hasAnyPatterns && (
              <>
                <button
                  onClick={() => setShowPatterns(!showPatterns)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors bg-muted text-muted-foreground hover:bg-muted/80"
                  aria-pressed={showPatterns}
                  title={
                    showPatterns
                      ? "Hide pattern overlays"
                      : "Show pattern overlays"
                  }
                >
                  {showPatterns ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  Patterns
                </button>
                {showPatterns && (
                  <button
                    onClick={() => setShowAllSignals(!showAllSignals)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                      showAllSignals
                        ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    aria-pressed={showAllSignals}
                    title={
                      showAllSignals
                        ? "Showing all signals — click to filter to high-confidence only"
                        : "Showing high-confidence signals only — click to show all"
                    }
                  >
                    {showAllSignals ? "All signals" : "High-conf"}
                  </button>
                )}
              </>
            )}
            <div className="flex gap-1">
              {CHART_HISTORY_PERIODS.map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    activeTimeframe === tf
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  aria-pressed={activeTimeframe === tf}
                >
                  {CHART_HISTORY_LABELS[tf]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Indicator toggles */}
        <div className="flex flex-wrap gap-1.5">
          {INDICATOR_OPTIONS.map(({ key, label, color }) => {
            const active = mergedIndicators[key];
            return (
              <span key={key} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => toggleIndicator(key)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 text-xs rounded transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground ring-1 ring-accent"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  aria-pressed={!!active}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${color} ${active ? "opacity-100" : "opacity-40"}`}
                  />
                  {label}
                </button>
                <InfoTooltip text="" indicatorKey={key} />
              </span>
            );
          })}
        </div>

        {/* Chart */}
        {isLoading ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground animate-pulse"
            style={{ height }}
          >
            Loading chart data...
          </div>
        ) : (
          <>
            {activeTimeframe === "1d" && candles.length > 0 && (
              <div className="rounded-lg border border-border/80 bg-muted/25 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Intraday Control
                </p>
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-1 rounded-md border border-border/70 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          intradayControl.tone === "seller-control"
                            ? "bg-red-500/15 text-red-300"
                            : intradayControl.tone === "approaching-supply"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {intradayControl.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {intradayControl.detail}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {intradayResistanceSummary}
                    </p>
                    {intradayResistanceLevels.length > 0 && (
                      <TooltipProvider delay={200}>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {intradayResistanceLevels.slice(0, 3).map((level) => {
                            const guideEntry = getIntradayGuideEntry(
                              level.label.split("/")[0].trim(),
                            );

                            return (
                              <Tooltip key={`${level.label}-${level.level}`}>
                                <TooltipTrigger className="inline-flex rounded-full border border-border/80 bg-background/60 px-2 py-0.5 text-xs text-foreground cursor-help">
                                  {level.label} ${level.level.toFixed(2)}
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-72 text-xs"
                                >
                                  <div className="space-y-1">
                                    <p className="font-medium text-background">
                                      {guideEntry?.fullName ?? level.label}
                                    </p>
                                    <p>
                                      {guideEntry?.description ?? level.note}
                                    </p>
                                    <p className="text-background/80">
                                      {guideEntry?.tradingUse ?? level.note}
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="space-y-1 rounded-md border border-border/70 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          intradaySupportControl.tone === "buyer-control"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : intradaySupportControl.tone ===
                                "approaching-support"
                              ? "bg-cyan-500/15 text-cyan-300"
                              : "bg-slate-500/15 text-slate-300"
                        }`}
                      >
                        {intradaySupportControl.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {intradaySupportControl.detail}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {intradaySupportSummary}
                    </p>
                    {intradaySupportLevels.length > 0 && (
                      <TooltipProvider delay={200}>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {intradaySupportLevels.slice(0, 3).map((level) => {
                            const guideEntry = getIntradayGuideEntry(
                              level.label.split("/")[0].trim(),
                            );

                            return (
                              <Tooltip key={`${level.label}-${level.level}`}>
                                <TooltipTrigger className="inline-flex rounded-full border border-border/80 bg-background/60 px-2 py-0.5 text-xs text-foreground cursor-help">
                                  {level.label} ${level.level.toFixed(2)}
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-72 text-xs"
                                >
                                  <div className="space-y-1">
                                    <p className="font-medium text-background">
                                      {guideEntry?.fullName ?? level.label}
                                    </p>
                                    <p>
                                      {guideEntry?.description ?? level.note}
                                    </p>
                                    <p className="text-background/80">
                                      {guideEntry?.tradingUse ?? level.note}
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    )}
                  </div>
                </div>

                {intradayGuideEntries.length > 0 && (
                  <div className="mt-3 rounded-md border border-border/70 bg-background/40 p-3">
                    <div className="flex items-start gap-2">
                      <HelpCircle className="mt-0.5 h-4 w-4 text-cyan-400" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          What these 1D levels mean
                        </p>
                        <p className="text-xs text-muted-foreground">
                          The chart uses short labels so the price panel stays
                          readable. This guide translates those labels into
                          plain English and explains why traders watch them.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {intradayGuideEntries.map((entry) => (
                        <div
                          key={entry.label}
                          className="rounded-md border border-border/70 bg-muted/20 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex rounded-full border border-border/80 bg-background/70 px-2 py-0.5 text-xs font-medium text-foreground">
                              {entry.label}
                            </span>
                            <p className="text-xs font-medium text-foreground">
                              {entry.fullName}
                            </p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                          <p className="mt-2 text-xs text-foreground/90">
                            {entry.tradingUse}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {showPatterns && calloutEntries.length > 0 && (
              <PatternLegendBar entries={calloutEntries} />
            )}
            <PriceChart
              ref={priceChartRef}
              candles={candles}
              supportResistance={supportResistance}
              technicalPatterns={mergedPatterns}
              showPatterns={showPatterns}
              highlightedPatternIndex={hoveredPatternIndex}
              onHoveredPattern={handleHover}
              height={height}
              entryPrice={entryPrice}
              exitPrice={exitPrice}
              optionsContext={optionsContext}
              indicators={mergedIndicators}
              timeframe={activeTimeframe}
              minConfidence={showAllSignals ? 0 : 0.6}
              onCalloutEntries={setCalloutEntries}
              economicEvents={economicEvents}
              triggerMarkers={triggerMarkers}
              triggerAnnotations={triggerAnnotations}
              intradayResistanceLevels={intradayResistanceLevels}
              intradaySupportLevels={intradaySupportLevels}
              fitContentOnInit
            />
            <ChartLegend
              supportResistance={supportResistance}
              technicalPatterns={mergedPatterns}
              showPatterns={showPatterns}
            />
            <IndicatorPatternSummary report={indicatorPatternReport} />
            <IndicatorGuidePanel
              activeIndicators={Object.entries(mergedIndicators)
                .filter(([, v]) => v)
                .map(([k]) => k)}
              showOptionsContext={!!optionsContext}
            />
          </>
        )}
      </div>
    );
  },
);

export default TechnicalChart;
