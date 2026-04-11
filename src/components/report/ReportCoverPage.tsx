import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "@/types/report";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import ReportPage from "./ReportPage";
import {
  colors,
  fontSize,
  baseStyles,
  getSignalStyle,
  getRiskStyle,
  formatReportDate,
} from "./styles";

const s = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  brandBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  brandTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  brandSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  ticker: {
    fontSize: fontSize.title,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  dateLine: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    marginBottom: 4,
  },
  whaleLine: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: "center",
    maxWidth: 400,
  },
  metricsCard: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 14,
    width: "100%",
    maxWidth: 420,
    marginBottom: 16,
  },
  metricsTitle: {
    fontSize: fontSize.caption,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  cascadeCard: {
    backgroundColor: "#3b82f610",
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.accentBlue,
    padding: 10,
    width: "100%",
    maxWidth: 420,
  },
  cascadeTitle: {
    fontSize: fontSize.body,
    fontFamily: "Helvetica-Bold",
    color: colors.accentBlue,
    marginBottom: 4,
  },
  cascadeDetail: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});

function Badge({
  label,
  signal,
}: {
  label: string;
  signal: "bullish" | "bearish" | "neutral";
}) {
  const style = getSignalStyle(signal);
  return (
    <View
      style={[
        baseStyles.badge,
        {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
        },
      ]}
    >
      <Text style={{ color: style.color, fontSize: fontSize.badge }}>
        {label}
      </Text>
    </View>
  );
}

function CascadeBanner({ cascades }: { cascades: ActiveCascadeEntry[] }) {
  const cascade = cascades[0];
  if (!cascade) return null;

  const direction = cascade.epsSurprisePct >= 0 ? "Beat" : "Miss";
  const sign = cascade.epsSurprisePct >= 0 ? "+" : "";

  return (
    <View style={s.cascadeCard}>
      <Text style={s.cascadeTitle}>Active Earnings Cascade</Text>
      <Text style={s.cascadeDetail}>
        {cascade.nexusName} ({cascade.nexusTicker}) {direction} {sign}
        {cascade.epsSurprisePct.toFixed(1)}% —{" "}
        {Math.round(cascade.hoursSinceReport)}h ago — {cascade.dependentCount}{" "}
        dependent tickers
      </Text>
    </View>
  );
}

export default function ReportCoverPage({ data }: { data: ReportData }) {
  const { deepDive, recommendation, confidenceBreakdown } = data;
  const riskLevel = deepDive.risk_assessment.overall_risk;
  const riskStyle = getRiskStyle(riskLevel);
  const direction = recommendation?.direction ?? "neutral";

  const confidencePct = confidenceBreakdown
    ? `${Math.round(confidenceBreakdown.composite * 100)}%`
    : recommendation
      ? `${Math.round(recommendation.confidence * 100)}%`
      : "—";

  return (
    <ReportPage ticker={data.ticker} generatedAt={data.generatedAt} hideHeader>
      <View style={s.centered}>
        {/* Branding */}
        <View style={s.brandBox}>
          <Text style={s.brandTitle}>OPTIONS DASHBOARD</Text>
          <Text style={s.brandSub}>Deep Dive Analysis Report</Text>
        </View>

        {/* Ticker */}
        <Text style={s.ticker}>{data.ticker}</Text>
        <Text style={s.dateLine}>
          Analysis Date: {formatReportDate(data.generatedAt)}
        </Text>
        <Text style={s.whaleLine}>{deepDive.whale_trade_summary}</Text>

        {/* Key Metrics */}
        <View style={s.metricsCard}>
          <Text style={s.metricsTitle}>Key Metrics</Text>
          <View style={s.metricsRow}>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Confidence</Text>
              <Text style={s.metricValue}>{confidencePct}</Text>
            </View>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Direction</Text>
              <Badge
                label={direction.charAt(0).toUpperCase() + direction.slice(1)}
                signal={direction}
              />
            </View>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Risk</Text>
              <View
                style={[
                  baseStyles.badge,
                  {
                    backgroundColor: riskStyle.backgroundColor,
                    borderColor: riskStyle.borderColor,
                  },
                ]}
              >
                <Text
                  style={{
                    color: riskStyle.color,
                    fontSize: fontSize.badge,
                  }}
                >
                  {riskLevel.replace("_", " ").toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={s.metricsRow}>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Strategy</Text>
              <Text style={s.metricValue}>
                {deepDive.entry_exit.recommended_option_type}
              </Text>
            </View>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Strike</Text>
              <Text style={s.metricValue}>
                {deepDive.entry_exit.strike_selection}
              </Text>
            </View>
            <View style={s.metricItem}>
              <Text style={s.metricLabel}>Expiry</Text>
              <Text style={s.metricValue}>
                {deepDive.entry_exit.expiry_guidance}
              </Text>
            </View>
          </View>
        </View>

        {/* Cascade (conditional) */}
        {data.cascadeContext && data.cascadeContext.length > 0 && (
          <CascadeBanner cascades={data.cascadeContext} />
        )}
      </View>
    </ReportPage>
  );
}
