import {
  ANALYSIS_TIMEFRAME_TO_CHART_HISTORY,
  type AnalysisTimeframe,
} from "@/lib/utils/chart-timeframes";
import {
  computeRealizedVol,
  fetchHistoricalData,
  fetchMarketData,
  fetchOptionsChain,
  getOrFetchShortInterest,
} from "@/lib/services/market-fetcher";
import {
  detectAllIndicatorPatterns,
  type IndicatorPatternReport,
} from "@/lib/utils/indicator-patterns";
import { computeVolumeProfile } from "@/lib/utils/volume-profile";
import { computeAlgoSR } from "@/lib/utils/algo-sr";
import { computeIVSkew, computeOISummary } from "@/lib/utils/options-analytics";
import { buildTriggerReport } from "@/lib/utils/trigger-engine";
import { vwap } from "@/lib/utils/technical-indicators";
import type {
  CandleData,
  MarketSnapshot,
  OptionsChainSummary,
} from "@/types/market";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { TickerAnalysisContext } from "@/types/ticker-context";

interface BuildTickerAnalysisContextOptions {
  timeframes: AnalysisTimeframe[];
  existingContext?: TickerAnalysisContext | null;
  marketSnapshot?: MarketSnapshot | null;
  optionsChain?: OptionsChainSummary | null;
  shortInterest?: ShortInterestData | null;
}

function getProfileCandles(
  candlesByTimeframe: Partial<Record<AnalysisTimeframe, CandleData[]>>,
): CandleData[] {
  const priority: AnalysisTimeframe[] = ["3M", "6M", "1M", "1Y", "1W", "1D"];
  for (const timeframe of priority) {
    const candles = candlesByTimeframe[timeframe];
    if (candles && candles.length > 0) {
      return candles;
    }
  }
  return [];
}

function computeAtmIV(
  chain: OptionsChainSummary | null,
  currentPrice: number | null | undefined,
): number | null {
  if (!chain || !currentPrice || currentPrice <= 0) {
    return null;
  }

  const contracts = [...chain.nearestExpiry.calls, ...chain.nearestExpiry.puts];
  const atmContracts = contracts.filter(
    (contract) =>
      contract.iv > 0 &&
      Math.abs(contract.strike - currentPrice) / currentPrice < 0.05,
  );

  if (atmContracts.length === 0) {
    return null;
  }

  return (
    atmContracts.reduce((sum, contract) => sum + contract.iv, 0) /
    atmContracts.length
  );
}

function isCompleteIndicatorReport(
  report: IndicatorPatternReport | undefined,
): report is IndicatorPatternReport {
  return report?.aggregateSignal?.direction != null;
}

export async function buildTickerAnalysisContext(
  ticker: string,
  options: BuildTickerAnalysisContextOptions,
): Promise<TickerAnalysisContext> {
  const existingContext = options.existingContext ?? null;
  const requestedTimeframes = Array.from(new Set(options.timeframes));
  const missingTimeframes = requestedTimeframes.filter(
    (timeframe) => existingContext?.candlesByTimeframe[timeframe] == null,
  );

  const shouldFetchMarketSnapshot =
    options.marketSnapshot === undefined &&
    existingContext?.marketSnapshot === undefined;
  const shouldFetchOptionsChain =
    options.optionsChain === undefined &&
    existingContext?.optionsChain === undefined;
  const shouldFetchShortInterest =
    options.shortInterest === undefined &&
    existingContext?.shortInterest === undefined;

  const [
    marketSnapshotResult,
    optionsChainResult,
    shortInterestResult,
    candleResults,
  ] = await Promise.all([
    shouldFetchMarketSnapshot ? fetchMarketData([ticker]) : Promise.resolve([]),
    shouldFetchOptionsChain ? fetchOptionsChain(ticker) : Promise.resolve(null),
    shouldFetchShortInterest
      ? getOrFetchShortInterest(ticker).catch(() => null)
      : Promise.resolve(null),
    Promise.allSettled(
      missingTimeframes.map((timeframe) =>
        fetchHistoricalData(
          ticker,
          ANALYSIS_TIMEFRAME_TO_CHART_HISTORY[timeframe],
        ),
      ),
    ),
  ]);

  const candlesByTimeframe: Partial<Record<AnalysisTimeframe, CandleData[]>> = {
    ...(existingContext?.candlesByTimeframe ?? {}),
  };

  missingTimeframes.forEach((timeframe, index) => {
    const result = candleResults[index];
    candlesByTimeframe[timeframe] =
      result?.status === "fulfilled" ? result.value : [];
  });

  const indicatorsByTimeframe: Partial<
    Record<AnalysisTimeframe, ReturnType<typeof detectAllIndicatorPatterns>>
  > = {
    ...(existingContext?.indicatorsByTimeframe ?? {}),
  };

  for (const timeframe of requestedTimeframes) {
    if (indicatorsByTimeframe[timeframe]) {
      continue;
    }

    const candles = candlesByTimeframe[timeframe] ?? [];
    if (candles.length > 0) {
      indicatorsByTimeframe[timeframe] = detectAllIndicatorPatterns(
        candles,
        ticker,
        timeframe,
      );
    }
  }

  const marketSnapshot =
    options.marketSnapshot ??
    existingContext?.marketSnapshot ??
    marketSnapshotResult[0] ??
    null;
  const optionsChain =
    options.optionsChain ??
    existingContext?.optionsChain ??
    optionsChainResult ??
    null;
  const shortInterest =
    options.shortInterest ??
    existingContext?.shortInterest ??
    shortInterestResult ??
    null;

  const profileCandles = getProfileCandles(candlesByTimeframe);
  const currentPrice = marketSnapshot?.price ?? null;
  const atmIV = computeAtmIV(optionsChain, currentPrice);
  const realizedVol =
    profileCandles.length > 0 ? computeRealizedVol(profileCandles) : null;
  const ivRvSpread =
    atmIV != null && realizedVol != null ? atmIV - realizedVol : null;

  const volumeProfile =
    profileCandles.length >= 10 ? computeVolumeProfile(profileCandles) : null;

  const intradayCandles = candlesByTimeframe["1D"] ?? [];
  const vwapValues = intradayCandles.length > 0 ? vwap(intradayCandles) : [];
  const latestVwap =
    vwapValues.length > 0 ? vwapValues[vwapValues.length - 1] : null;

  const algoSR =
    profileCandles.length >= 7 && currentPrice != null
      ? computeAlgoSR({
          candles: profileCandles,
          currentPrice,
          volumeProfile,
          oiWalls: optionsChain?.oiWalls ?? null,
          maxPain: optionsChain?.maxPain ?? null,
          gex: optionsChain?.gex ?? null,
          vwap: latestVwap,
        })
      : [];

  const ivSkew =
    optionsChain && currentPrice != null && currentPrice > 0
      ? computeIVSkew(optionsChain, currentPrice)
      : null;
  const oiSummary = optionsChain ? computeOISummary(optionsChain) : null;

  const htfPatterns = [
    indicatorsByTimeframe["1W"],
    indicatorsByTimeframe["1M"],
    indicatorsByTimeframe["3M"],
  ].filter(isCompleteIndicatorReport);

  const dailyPatterns = isCompleteIndicatorReport(indicatorsByTimeframe["3M"])
    ? indicatorsByTimeframe["3M"]
    : null;

  const triggerReport =
    profileCandles.length >= 10
      ? buildTriggerReport({
          ticker,
          candles: profileCandles,
          algoSRLevels: algoSR,
          volumeProfile,
          dailyPatterns,
          htfPatterns,
        })
      : null;

  return {
    ticker,
    computedAt: new Date().toISOString(),
    marketSnapshot,
    optionsChain,
    candlesByTimeframe,
    indicatorsByTimeframe,
    realizedVol,
    atmIV,
    ivRvSpread,
    volumeProfile,
    algoSR,
    ivSkew,
    oiSummary,
    triggerReport,
    shortInterest,
  };
}
