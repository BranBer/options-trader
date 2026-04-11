import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "@/types/report";
import ReportPage from "./ReportPage";
import {
  colors,
  fontSize,
  baseStyles,
  getSignalStyle,
  getRiskStyle,
} from "./styles";

const s = StyleSheet.create({
  stratGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 0,
  },
  stratCell: {
    width: "50%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
  },
  stratLabel: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  stratValue: {
    fontSize: fontSize.body,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  riskBadge: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  riskBullet: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginBottom: 3,
    paddingLeft: 8,
  },
  legRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  legAction: {
    fontSize: fontSize.body,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    width: 35,
  },
  legDetail: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    flex: 1,
  },
  kvRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  kvLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 110,
  },
  kvValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  // Confidence bar in strategy context
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  factorName: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    width: 140,
  },
  factorValue: {
    fontSize: fontSize.caption,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    width: 28,
    textAlign: "right",
  },
});

function StrategyCell({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={s.stratCell}>
      <Text style={s.stratLabel}>{label}</Text>
      <Text style={s.stratValue}>{String(value)}</Text>
    </View>
  );
}

export default function ReportStrategyPage({ data }: { data: ReportData }) {
  const { deepDive, recommendation } = data;
  const ee = deepDive.entry_exit;
  const risk = deepDive.risk_assessment;
  const riskStyle = getRiskStyle(risk.overall_risk);

  return (
    <ReportPage ticker={data.ticker} generatedAt={data.generatedAt}>
      {/* Entry / Exit Strategy */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h1}>Entry / Exit Strategy</Text>
        <View
          style={[baseStyles.card, { padding: 0, overflow: "hidden" }]}
          wrap={false}
        >
          <View style={s.stratGrid}>
            <StrategyCell
              label="Option Type"
              value={ee.recommended_option_type}
            />
            <StrategyCell label="Strike" value={ee.strike_selection} />
            <StrategyCell
              label="Entry Range"
              value={`$${ee.entry_price_range.low.toFixed(2)} – $${ee.entry_price_range.high.toFixed(2)}`}
            />
            <StrategyCell label="Expiry" value={ee.expiry_guidance} />
            <StrategyCell label="Profit Target" value={ee.profit_target} />
            <StrategyCell label="Stop Loss" value={ee.stop_loss} />
          </View>
        </View>
        <View style={{ marginTop: 6 }}>
          <View style={s.kvRow}>
            <Text style={s.kvLabel}>Position Sizing</Text>
            <Text style={s.kvValue}>{ee.position_sizing}</Text>
          </View>
          <Text style={[baseStyles.body, { marginTop: 4 }]}>
            {ee.rationale}
          </Text>
        </View>
      </View>

      {/* Trade Recommendation (if available) */}
      {recommendation && (
        <>
          <View style={baseStyles.separator} />
          <View style={baseStyles.section}>
            <Text style={baseStyles.h1}>Trade Recommendation</Text>
            <View style={baseStyles.card} wrap={false}>
              <Text
                style={{
                  fontSize: fontSize.body,
                  fontFamily: "Helvetica-Bold",
                  color: colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                {recommendation.primary_strategy.name}
              </Text>
              {/* Legs */}
              {recommendation.primary_strategy.legs.map((leg, i) => (
                <View key={i} style={s.legRow}>
                  <Text style={s.legAction}>{leg.action.toUpperCase()}</Text>
                  <Text style={s.legDetail}>
                    {leg.strike} {leg.type.toUpperCase()} {leg.expiry} @ $
                    {leg.estimated_premium.toFixed(2)}
                  </Text>
                </View>
              ))}
              <View style={[baseStyles.separator, { marginVertical: 6 }]} />
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Max Profit</Text>
                <Text style={s.kvValue}>
                  {recommendation.primary_strategy.max_profit}
                </Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Max Loss</Text>
                <Text style={s.kvValue}>
                  {recommendation.primary_strategy.max_loss}
                </Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Breakeven</Text>
                <Text style={s.kvValue}>
                  {recommendation.primary_strategy.breakeven}
                </Text>
              </View>
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>Risk/Reward</Text>
                <Text style={s.kvValue}>
                  {recommendation.primary_strategy.risk_reward_ratio}
                </Text>
              </View>
            </View>

            {/* Whale Alignment */}
            <View style={[baseStyles.card, { marginTop: 6 }]}>
              <Text style={baseStyles.h2}>Whale Alignment</Text>
              {(() => {
                const wa = recommendation.whale_alignment;
                const matchStyle = getSignalStyle(
                  wa.matches_whale ? "bullish" : "bearish",
                );
                return (
                  <>
                    <View
                      style={[
                        baseStyles.badge,
                        {
                          backgroundColor: matchStyle.backgroundColor,
                          borderColor: matchStyle.borderColor,
                          alignSelf: "flex-start",
                          marginBottom: 4,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: matchStyle.color,
                          fontSize: fontSize.badge,
                        }}
                      >
                        {wa.matches_whale
                          ? "Matches Whale Position"
                          : "Diverges from Whale"}
                      </Text>
                    </View>
                    <Text style={baseStyles.caption}>
                      {wa.whale_position_size}
                    </Text>
                    <Text style={[baseStyles.body, { marginTop: 2 }]}>
                      {wa.similarity_note}
                    </Text>
                  </>
                );
              })()}
            </View>
          </View>
        </>
      )}

      <View style={baseStyles.separator} />

      {/* Risk Assessment */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h1}>Risk Assessment</Text>
        <View
          style={[
            s.riskBadge,
            {
              backgroundColor: riskStyle.backgroundColor,
              borderColor: riskStyle.borderColor,
            },
          ]}
        >
          <Text style={{ color: riskStyle.color, fontSize: 11 }}>
            {risk.overall_risk.replace("_", " ").toUpperCase()}
          </Text>
        </View>
        <View style={s.kvRow}>
          <Text style={s.kvLabel}>Max Allocation</Text>
          <Text style={s.kvValue}>{risk.max_recommended_allocation}</Text>
        </View>
        <View style={{ marginTop: 6 }}>
          <Text
            style={[
              baseStyles.caption,
              { fontFamily: "Helvetica-Bold", marginBottom: 4 },
            ]}
          >
            KEY RISKS
          </Text>
          {risk.key_risks.map((r, i) => (
            <Text key={i} style={s.riskBullet}>
              • {r}
            </Text>
          ))}
        </View>
      </View>
    </ReportPage>
  );
}
