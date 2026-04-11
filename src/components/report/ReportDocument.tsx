import { Document } from "@react-pdf/renderer";
import type { ReportData } from "@/types/report";
import ReportCoverPage from "./ReportCoverPage";
import ReportNarrativePage from "./ReportNarrativePage";
import ReportChartPage from "./ReportChartPage";
import ReportOptionsPage from "./ReportOptionsPage";
import ReportMarketStructurePage from "./ReportMarketStructurePage";
import ReportStrategyPage from "./ReportStrategyPage";
import ReportFooterPage from "./ReportFooterPage";

interface ReportDocumentProps {
  data: ReportData;
}

export default function ReportDocument({ data }: ReportDocumentProps) {
  return (
    <Document
      title={`Deep Dive Report — ${data.ticker}`}
      author="Options Dashboard"
      subject={`Options analysis report for ${data.ticker}`}
    >
      {/* Page 1: Cover */}
      <ReportCoverPage data={data} />

      {/* Page 2: Market Narrative + Global Events + Confidence */}
      <ReportNarrativePage data={data} />

      {/* Pages 3–8: Chart pages (one per timeframe) */}
      {data.timeframes.map((tf) => (
        <ReportChartPage
          key={tf.timeframe}
          ticker={data.ticker}
          generatedAt={data.generatedAt}
          tfData={tf}
          chartScreenshot={data.chartScreenshots[tf.timeframe] ?? ""}
          indicators={data.deepDive.indicators}
        />
      ))}

      {/* Page 9: Technical Indicators + Options Context */}
      <ReportOptionsPage
        ticker={data.ticker}
        generatedAt={data.generatedAt}
        optionsContext={data.deepDive.options_context}
        indicators={data.deepDive.indicators}
      />

      {/* Page 10: Market Structure (Volume Profile, Algo S/R, Options Positioning, Catalysts) */}
      <ReportMarketStructurePage
        ticker={data.ticker}
        generatedAt={data.generatedAt}
        enrichedData={data.enrichedData}
        optionsContext={data.deepDive.options_context}
      />

      {/* Page 11: Strategy + Risk */}
      <ReportStrategyPage data={data} />

      {/* Page 11-12: Educational Notes + Disclaimer */}
      <ReportFooterPage data={data} />
    </Document>
  );
}
