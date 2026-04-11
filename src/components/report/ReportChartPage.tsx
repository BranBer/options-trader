import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { TimeframeReportData } from "@/types/report";
import type { IndicatorAnalysis } from "@/types/analysis";
import ReportPage from "./ReportPage";
import { colors, fontSize, baseStyles, getSignalStyle } from "./styles";

const TIMEFRAME_LABELS: Record<string, string> = {
  "1D": "1-Day Analysis",
  "1W": "1-Week Analysis",
  "1M": "1-Month Analysis",
  "3M": "3-Month Analysis",
  "6M": "6-Month Analysis",
  "1Y": "1-Year Analysis",
};

const s = StyleSheet.create({
  chartImage: {
    width: "100%",
    height: 260,
    borderRadius: 4,
    marginBottom: 10,
  },
  placeholder: {
    width: "100%",
    height: 260,
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: fontSize.body,
    color: colors.textMuted,
  },
  // Pattern table
  patternCol1: { width: "38%" },
  patternCol2: { width: "22%" },
  patternCol3: { width: "20%" },
  patternCol4: { width: "20%" },
  noPatterns: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    fontStyle: "italic",
    marginTop: 4,
  },
  // Indicator grid
  indicatorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  indicatorCard: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 8,
    width: "48%",
  },
  indicatorName: {
    fontSize: fontSize.caption,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  indicatorValue: {
    fontSize: fontSize.body,
    fontFamily: "Courier",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  indicatorExpl: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  badgeInline: {
    fontSize: fontSize.badge,
    fontFamily: "Helvetica-Bold",
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderWidth: 0.5,
    alignSelf: "flex-start",
    marginBottom: 3,
  },
});

function PatternTable({
  patterns,
}: {
  patterns: TimeframeReportData["patterns"];
}) {
  if (!patterns.length) {
    return (
      <Text style={s.noPatterns}>No patterns detected for this timeframe.</Text>
    );
  }

  return (
    <View>
      {/* Header */}
      <View style={baseStyles.tableHeader}>
        <Text style={[baseStyles.tableCellHeader, s.patternCol1]}>Pattern</Text>
        <Text style={[baseStyles.tableCellHeader, s.patternCol2]}>Type</Text>
        <Text style={[baseStyles.tableCellHeader, s.patternCol3]}>
          Confidence
        </Text>
        <Text style={[baseStyles.tableCellHeader, s.patternCol4]}>Target</Text>
      </View>

      {/* Rows */}
      {patterns.map((p, i) => {
        const signal = getSignalStyle(p.type);
        return (
          <View key={i} style={baseStyles.tableRow} wrap={false}>
            <Text style={[baseStyles.tableCell, s.patternCol1]}>{p.name}</Text>
            <View style={[s.patternCol2, { paddingHorizontal: 4 }]}>
              <View
                style={[
                  s.badgeInline,
                  {
                    backgroundColor: signal.backgroundColor,
                    borderColor: signal.borderColor,
                  },
                ]}
              >
                <Text style={{ color: signal.color, fontSize: fontSize.badge }}>
                  {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                </Text>
              </View>
            </View>
            <Text style={[baseStyles.tableCell, s.patternCol3]}>
              {Math.round(p.confidence * 100)}%
            </Text>
            <Text style={[baseStyles.tableCell, s.patternCol4]}>
              {p.price_target ? `$${p.price_target.toFixed(2)}` : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function IndicatorGrid({ indicators }: { indicators: IndicatorAnalysis[] }) {
  if (!indicators.length) return null;

  return (
    <View style={s.indicatorGrid}>
      {indicators.map((ind, i) => {
        const signal = getSignalStyle(ind.signal);
        return (
          <View key={i} style={s.indicatorCard} wrap={false}>
            <Text style={s.indicatorName}>{ind.name}</Text>
            <View
              style={[
                s.badgeInline,
                {
                  backgroundColor: signal.backgroundColor,
                  borderColor: signal.borderColor,
                },
              ]}
            >
              <Text style={{ color: signal.color, fontSize: fontSize.badge }}>
                {ind.value} — {ind.signal}
              </Text>
            </View>
            <Text style={s.indicatorExpl}>{ind.explanation}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface ReportChartPageProps {
  ticker: string;
  generatedAt: string;
  tfData: TimeframeReportData;
  chartScreenshot: string;
  indicators: IndicatorAnalysis[];
}

export default function ReportChartPage({
  ticker,
  generatedAt,
  tfData,
  chartScreenshot,
  indicators,
}: ReportChartPageProps) {
  const title =
    TIMEFRAME_LABELS[tfData.timeframe] ?? `${tfData.timeframe} Analysis`;
  const allPatterns = [...tfData.patterns, ...tfData.indicatorPatterns];

  return (
    <ReportPage ticker={ticker} generatedAt={generatedAt}>
      <Text style={baseStyles.h1}>{title}</Text>

      {/* Chart image or placeholder */}
      <View wrap={false}>
        {chartScreenshot ? (
          <Image src={chartScreenshot} style={s.chartImage} />
        ) : (
          <View style={s.placeholder}>
            <Text style={s.placeholderText}>
              Chart data unavailable for this timeframe.
            </Text>
          </View>
        )}
      </View>

      {/* Pattern table */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h2}>Detected Patterns</Text>
        <PatternTable patterns={allPatterns} />
      </View>

      {/* Indicator grid (shared across timeframes — from LLM analysis) */}
      {indicators.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h2}>Technical Indicators</Text>
          <IndicatorGrid indicators={indicators} />
        </View>
      )}
    </ReportPage>
  );
}
