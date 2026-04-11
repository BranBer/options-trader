import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "@/types/report";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
import ReportPage from "./ReportPage";
import { colors, fontSize, baseStyles } from "./styles";

const s = StyleSheet.create({
  barOuter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    flex: 1,
    marginHorizontal: 6,
  },
  barInner: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentBlue,
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  factorName: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    width: 110,
  },
  factorWeight: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    width: 32,
    textAlign: "right",
  },
  factorValue: {
    fontSize: fontSize.caption,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    width: 32,
    textAlign: "right",
  },
  compositeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  compositeLabel: {
    fontSize: fontSize.h2,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginRight: 8,
  },
  compositeValue: {
    fontSize: fontSize.h2,
    fontFamily: "Helvetica-Bold",
    color: colors.accentBlue,
  },
});

function ConfidenceBreakdownSection({
  breakdown,
}: {
  breakdown: CompositeConfidenceBreakdown;
}) {
  return (
    <View style={baseStyles.card}>
      <View style={s.compositeRow}>
        <Text style={s.compositeLabel}>Composite Confidence:</Text>
        <Text style={s.compositeValue}>
          {Math.round(breakdown.composite * 100)}%
        </Text>
      </View>

      {breakdown.factors.map((factor, i) => (
        <View key={i} style={s.factorRow}>
          <Text style={s.factorName}>{factor.name}</Text>
          <Text style={s.factorWeight}>{Math.round(factor.weight * 100)}%</Text>
          <View style={s.barOuter}>
            <View
              style={[
                s.barInner,
                {
                  width: `${Math.round(factor.value * 100)}%`,
                  backgroundColor:
                    factor.value >= 0.6
                      ? colors.accentGreen
                      : factor.value >= 0.4
                        ? colors.accentAmber
                        : colors.accentRed,
                },
              ]}
            />
          </View>
          <Text style={s.factorValue}>{(factor.value * 100).toFixed(0)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ReportNarrativePage({ data }: { data: ReportData }) {
  const { deepDive, confidenceBreakdown } = data;

  return (
    <ReportPage ticker={data.ticker} generatedAt={data.generatedAt}>
      {/* Market Narrative */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h1}>Market Narrative</Text>
        <Text style={baseStyles.body}>{deepDive.market_narrative}</Text>
      </View>

      <View style={baseStyles.separator} />

      {/* Global Events */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h1}>Global Events Connection</Text>
        <Text style={baseStyles.body}>{deepDive.global_events_connection}</Text>
      </View>

      <View style={baseStyles.separator} />

      {/* Confidence Breakdown */}
      {confidenceBreakdown && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Confidence Breakdown</Text>
          <ConfidenceBreakdownSection breakdown={confidenceBreakdown} />
        </View>
      )}
    </ReportPage>
  );
}
