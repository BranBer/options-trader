import type { AnalysisTimeframe } from "@/lib/utils/chart-timeframes";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { IVSkew, OISummary } from "@/lib/utils/options-analytics";
import type { AlgoSRLevel } from "@/lib/utils/algo-sr";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { VolumeProfile } from "@/lib/utils/volume-profile";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type {
  CandleData,
  MarketSnapshot,
  OptionsChainSummary,
} from "@/types/market";

export interface TickerAnalysisContext {
  ticker: string;
  computedAt: string;
  marketSnapshot: MarketSnapshot | null;
  optionsChain: OptionsChainSummary | null;
  candlesByTimeframe: Partial<Record<AnalysisTimeframe, CandleData[]>>;
  indicatorsByTimeframe: Partial<
    Record<AnalysisTimeframe, IndicatorPatternReport>
  >;
  realizedVol: number | null;
  atmIV: number | null;
  ivRvSpread: number | null;
  volumeProfile: VolumeProfile | null;
  algoSR: AlgoSRLevel[];
  ivSkew: IVSkew | null;
  oiSummary: OISummary | null;
  triggerReport: TriggerReport | null;
  shortInterest: ShortInterestData | null;
}
