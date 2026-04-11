import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { DeepDiveAnalysis } from "@/types/analysis";
import ReportPage from "./ReportPage";
import { colors, fontSize, baseStyles, getSignalStyle } from "./styles";

const s = StyleSheet.create({
  kvRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  kvLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 130,
  },
  kvValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  greekCol1: { width: "18%" },
  greekCol2: { width: "18%" },
  greekCol3: { width: "34%" },
  greekCol4: { width: "30%" },
  implicationBadge: {
    fontSize: fontSize.badge,
    fontFamily: "Helvetica-Bold",
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderWidth: 0.5,
    alignSelf: "flex-start",
  },
  wallRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
});

const implicationColors = {
  favorable: { bg: "#22c55e20", border: "#22c55e", text: "#22c55e" },
  neutral: { bg: "#71717a20", border: "#71717a", text: "#71717a" },
  unfavorable: { bg: "#ef444420", border: "#ef4444", text: "#ef4444" },
} as const;

function KVRow({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined | null;
}) {
  if (value == null || value === "") return null;
  return (
    <View style={s.kvRow}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{String(value)}</Text>
    </View>
  );
}

interface ReportOptionsPageProps {
  ticker: string;
  generatedAt: string;
  optionsContext: DeepDiveAnalysis["options_context"];
  indicators: DeepDiveAnalysis["indicators"];
}

export default function ReportOptionsPage({
  ticker,
  generatedAt,
  optionsContext: ctx,
  indicators,
}: ReportOptionsPageProps) {
  return (
    <ReportPage ticker={ticker} generatedAt={generatedAt}>
      {/* Technical Indicators */}
      {indicators.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Technical Indicators</Text>
          <View style={s.twoCol}>
            {indicators.map((ind, i) => {
              const sig = getSignalStyle(ind.signal);
              return (
                <View key={i} style={[baseStyles.card, s.halfCol]} wrap={false}>
                  <Text
                    style={{
                      fontSize: fontSize.body,
                      fontFamily: "Helvetica-Bold",
                      color: colors.textPrimary,
                      marginBottom: 3,
                    }}
                  >
                    {ind.name}
                  </Text>
                  <View
                    style={[
                      baseStyles.badge,
                      {
                        backgroundColor: sig.backgroundColor,
                        borderColor: sig.borderColor,
                        alignSelf: "flex-start",
                        marginBottom: 3,
                      },
                    ]}
                  >
                    <Text
                      style={{ color: sig.color, fontSize: fontSize.badge }}
                    >
                      {ind.value} — {ind.signal}
                    </Text>
                  </View>
                  <Text style={baseStyles.caption}>{ind.explanation}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={baseStyles.separator} />

      {/* Options Context */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h1}>Options Context</Text>
        <View style={baseStyles.card}>
          <KVRow label="IV Percentile" value={ctx.iv_percentile} />
          <Text style={[baseStyles.caption, { marginBottom: 6 }]}>
            {ctx.iv_interpretation}
          </Text>
          <KVRow label="Put/Call Ratio" value={ctx.put_call_ratio} />
          <KVRow label="Unusual Activity" value={ctx.unusual_activity_note} />
          {ctx.iv_rv_spread != null && (
            <>
              <KVRow
                label="IV-RV Spread"
                value={`${ctx.iv_rv_spread > 0 ? "+" : ""}${ctx.iv_rv_spread.toFixed(1)}`}
              />
              {ctx.iv_rv_interpretation && (
                <Text style={[baseStyles.caption, { marginBottom: 4 }]}>
                  {ctx.iv_rv_interpretation}
                </Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* Greeks Breakdown */}
      {ctx.greeks_breakdown && ctx.greeks_breakdown.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h2}>Greeks Breakdown</Text>
          <View wrap={false}>
            <View style={baseStyles.tableHeader}>
              <Text style={[baseStyles.tableCellHeader, s.greekCol1]}>
                Greek
              </Text>
              <Text style={[baseStyles.tableCellHeader, s.greekCol2]}>
                Value
              </Text>
              <Text style={[baseStyles.tableCellHeader, s.greekCol3]}>
                Plain English
              </Text>
              <Text style={[baseStyles.tableCellHeader, s.greekCol4]}>
                Impact
              </Text>
            </View>
            {ctx.greeks_breakdown.map((g, i) => {
              const ic =
                implicationColors[g.implication] ?? implicationColors.neutral;
              return (
                <View key={i} style={baseStyles.tableRow}>
                  <Text
                    style={[
                      baseStyles.tableCell,
                      s.greekCol1,
                      {
                        fontFamily: "Helvetica-Bold",
                        color: colors.textPrimary,
                      },
                    ]}
                  >
                    {g.greek.charAt(0).toUpperCase() + g.greek.slice(1)}
                  </Text>
                  <Text
                    style={[
                      baseStyles.tableCell,
                      s.greekCol2,
                      { fontFamily: "Courier" },
                    ]}
                  >
                    {g.value}
                  </Text>
                  <Text style={[baseStyles.tableCell, s.greekCol3]}>
                    {g.plain_english}
                  </Text>
                  <View style={[s.greekCol4, { paddingHorizontal: 4 }]}>
                    <View
                      style={[
                        s.implicationBadge,
                        { backgroundColor: ic.bg, borderColor: ic.border },
                      ]}
                    >
                      <Text
                        style={{ color: ic.text, fontSize: fontSize.badge }}
                      >
                        {g.implication}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          {ctx.greeks_summary && (
            <Text style={[baseStyles.caption, { marginTop: 6 }]}>
              {ctx.greeks_summary}
            </Text>
          )}
        </View>
      )}

      {/* Market Structure: Max Pain, OI Walls, GEX */}
      {(ctx.max_pain != null || ctx.gex_summary || ctx.oi_walls) && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h2}>Market Structure</Text>
          <View style={baseStyles.card}>
            <View style={s.twoCol}>
              <View style={s.halfCol}>
                {ctx.max_pain != null && (
                  <KVRow label="Max Pain" value={`$${ctx.max_pain}`} />
                )}
                {ctx.gex_summary && (
                  <>
                    <KVRow
                      label="Net GEX"
                      value={ctx.gex_summary.net_gex.toLocaleString()}
                    />
                    <KVRow
                      label="Dealer Position"
                      value={ctx.gex_summary.dealer_positioning.replace(
                        "_",
                        " ",
                      )}
                    />
                    {ctx.gex_summary.gex_flip_level != null && (
                      <KVRow
                        label="GEX Flip"
                        value={`$${ctx.gex_summary.gex_flip_level}`}
                      />
                    )}
                  </>
                )}
              </View>
              <View style={s.halfCol}>
                {ctx.oi_walls && (
                  <>
                    <Text
                      style={[
                        baseStyles.caption,
                        { fontFamily: "Helvetica-Bold", marginBottom: 3 },
                      ]}
                    >
                      OI WALLS
                    </Text>
                    {ctx.oi_walls.call_walls.map((w, i) => (
                      <View key={`c${i}`} style={s.wallRow}>
                        <Text style={baseStyles.caption}>Call ${w.strike}</Text>
                        <Text style={baseStyles.caption}>
                          {w.oi.toLocaleString()} OI
                        </Text>
                      </View>
                    ))}
                    {ctx.oi_walls.put_walls.map((w, i) => (
                      <View key={`p${i}`} style={s.wallRow}>
                        <Text style={baseStyles.caption}>Put ${w.strike}</Text>
                        <Text style={baseStyles.caption}>
                          {w.oi.toLocaleString()} OI
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            </View>
            {ctx.gex_summary?.interpretation && (
              <Text style={[baseStyles.caption, { marginTop: 6 }]}>
                {ctx.gex_summary.interpretation}
              </Text>
            )}
          </View>
        </View>
      )}
    </ReportPage>
  );
}
