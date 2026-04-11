import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { EnrichedMarketData } from "@/types/report";
import type { DeepDiveAnalysis } from "@/types/analysis";
import ReportPage from "./ReportPage";
import { colors, fontSize, baseStyles } from "./styles";

const s = StyleSheet.create({
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  levelPrice: {
    fontSize: fontSize.body,
    fontFamily: "Courier",
    color: colors.textPrimary,
    width: 60,
  },
  levelStars: {
    fontSize: fontSize.body,
    color: colors.accentAmber,
    width: 65,
  },
  levelSources: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    flex: 1,
  },
  levelDistance: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    width: 55,
    textAlign: "right",
  },
  vpRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  vpLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 100,
  },
  vpValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  catalystRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 8,
  },
  catalystImpact: {
    fontSize: fontSize.body,
    width: 12,
  },
  catalystName: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    width: 110,
    fontFamily: "Helvetica-Bold",
  },
  catalystDate: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    width: 75,
  },
  catalystDays: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    width: 40,
    textAlign: "right",
  },
  catalystDesc: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    flex: 1,
  },
  skewRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  skewLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 110,
  },
  skewValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  oiStrikeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  warningBanner: {
    backgroundColor: "#f59e0b15",
    borderWidth: 0.5,
    borderColor: colors.accentAmber,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  warningText: {
    fontSize: fontSize.body,
    color: colors.accentAmber,
    fontFamily: "Helvetica-Bold",
  },
});

interface ReportMarketStructurePageProps {
  ticker: string;
  generatedAt: string;
  enrichedData: EnrichedMarketData;
  optionsContext: DeepDiveAnalysis["options_context"];
}

export default function ReportMarketStructurePage({
  ticker,
  generatedAt,
  enrichedData,
  optionsContext,
}: ReportMarketStructurePageProps) {
  const { volumeProfile, algoSR, ivSkew, oiSummary, catalysts, currentPrice } =
    enrichedData;

  const supports = algoSR.filter((l) => l.type === "support").slice(0, 5);
  const resistances = algoSR.filter((l) => l.type === "resistance").slice(0, 5);

  // Show max pain / GEX from deep dive options_context as fallback
  const maxPain = optionsContext.max_pain;
  const gexSummary = optionsContext.gex_summary;
  const hasKeyLevels = maxPain != null || gexSummary != null;

  // Check earnings proximity for warning banner
  const earningsDaysAway = enrichedData.earningsDate
    ? Math.ceil(
        (new Date(enrichedData.earningsDate).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const earningsImminent =
    earningsDaysAway != null && earningsDaysAway > 0 && earningsDaysAway <= 7;

  return (
    <ReportPage ticker={ticker} generatedAt={generatedAt}>
      {/* Catalyst warning banner */}
      {(catalysts.immediateRisk || earningsImminent) && (
        <View style={s.warningBanner}>
          <Text style={s.warningText}>
            {earningsImminent
              ? `EARNINGS IN ${earningsDaysAway} DAY${earningsDaysAway !== 1 ? "S" : ""} — Expect IV expansion and potential gap risk. Consider position sizing carefully.`
              : "HIGH-IMPACT ECONOMIC RELEASE WITHIN 3 DAYS — Consider delaying entry or adjusting position size."}
          </Text>
        </View>
      )}

      {/* Key Levels: Max Pain + GEX (always available from LLM deep dive) */}
      {hasKeyLevels && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Key Levels</Text>
          <View style={baseStyles.card}>
            {maxPain != null && (
              <View style={s.vpRow}>
                <Text style={s.vpLabel}>Max Pain</Text>
                <Text style={s.vpValue}>
                  ${maxPain.toFixed(2)}
                  {currentPrice > 0 &&
                    (currentPrice > maxPain
                      ? ` — price is $${(currentPrice - maxPain).toFixed(2)} above (gravity pull down)`
                      : currentPrice < maxPain
                        ? ` — price is $${(maxPain - currentPrice).toFixed(2)} below (gravity pull up)`
                        : " — price is at max pain")}
                </Text>
              </View>
            )}
            {gexSummary && (
              <>
                <View style={s.vpRow}>
                  <Text style={s.vpLabel}>Net GEX</Text>
                  <Text style={s.vpValue}>
                    {gexSummary.net_gex.toLocaleString()} —{" "}
                    {gexSummary.dealer_positioning.replace("_", " ")}
                  </Text>
                </View>
                {gexSummary.gex_flip_level != null && (
                  <View style={s.vpRow}>
                    <Text style={s.vpLabel}>GEX Flip</Text>
                    <Text style={s.vpValue}>
                      ${gexSummary.gex_flip_level} — regime change level
                    </Text>
                  </View>
                )}
                {gexSummary.interpretation && (
                  <Text style={[baseStyles.caption, { marginTop: 4 }]}>
                    {gexSummary.interpretation}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      )}

      {/* Volume Profile */}
      {volumeProfile && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Volume Profile</Text>
          <View style={baseStyles.card}>
            <View style={s.vpRow}>
              <Text style={s.vpLabel}>VPOC</Text>
              <Text style={s.vpValue}>
                ${volumeProfile.vpoc.toFixed(2)} — highest-volume price level
                {currentPrice > volumeProfile.vpoc
                  ? ` (price is $${(currentPrice - volumeProfile.vpoc).toFixed(2)} above)`
                  : currentPrice < volumeProfile.vpoc
                    ? ` (price is $${(volumeProfile.vpoc - currentPrice).toFixed(2)} below)`
                    : " (price is at VPOC)"}
              </Text>
            </View>
            <View style={s.vpRow}>
              <Text style={s.vpLabel}>Value Area</Text>
              <Text style={s.vpValue}>
                ${volumeProfile.valueAreaLow.toFixed(2)} – $
                {volumeProfile.valueAreaHigh.toFixed(2)} — 70% of volume
                {currentPrice >= volumeProfile.valueAreaLow &&
                currentPrice <= volumeProfile.valueAreaHigh
                  ? " (price is INSIDE)"
                  : currentPrice > volumeProfile.valueAreaHigh
                    ? " (price is ABOVE — breakout or overextension)"
                    : " (price is BELOW — breakdown or undervaluation)"}
              </Text>
            </View>
            {volumeProfile.hvn.length > 0 && (
              <View style={s.vpRow}>
                <Text style={s.vpLabel}>High Volume</Text>
                <Text style={s.vpValue}>
                  {volumeProfile.hvn
                    .slice(0, 4)
                    .map((n) => `$${n.price.toFixed(2)}`)
                    .join(", ")}{" "}
                  — act as price magnets
                </Text>
              </View>
            )}
            {volumeProfile.lvn.length > 0 && (
              <View style={s.vpRow}>
                <Text style={s.vpLabel}>Low Volume</Text>
                <Text style={s.vpValue}>
                  {volumeProfile.lvn
                    .slice(0, 4)
                    .map((n) => `$${n.price.toFixed(2)}`)
                    .join(", ")}{" "}
                  — price moves fast through these
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Algorithmic S/R */}
      {algoSR.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Algorithmic Support / Resistance</Text>
          <Text style={[baseStyles.caption, { marginBottom: 8 }]}>
            Confluence-scored from swing pivots, volume nodes, OI walls, max
            pain, GEX flip, and VWAP. More stars = more data sources agree.
          </Text>
          <View style={s.twoCol}>
            {/* Support */}
            <View style={s.halfCol}>
              <View style={baseStyles.card}>
                <Text
                  style={[
                    baseStyles.h2,
                    { color: colors.accentGreen, marginBottom: 6 },
                  ]}
                >
                  Support
                </Text>
                {supports.length > 0 ? (
                  supports.map((level, i) => (
                    <View key={i} style={s.levelRow}>
                      <Text style={s.levelPrice}>
                        ${level.price.toFixed(2)}
                      </Text>
                      <Text style={s.levelStars}>
                        {"★".repeat(level.confluence)}
                        {"☆".repeat(5 - level.confluence)}
                      </Text>
                      <Text style={s.levelSources}>
                        {level.sources.join(", ")}
                      </Text>
                      <Text style={s.levelDistance}>
                        -${(currentPrice - level.price).toFixed(2)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={baseStyles.caption}>
                    No support levels detected
                  </Text>
                )}
              </View>
            </View>
            {/* Resistance */}
            <View style={s.halfCol}>
              <View style={baseStyles.card}>
                <Text
                  style={[
                    baseStyles.h2,
                    { color: colors.accentRed, marginBottom: 6 },
                  ]}
                >
                  Resistance
                </Text>
                {resistances.length > 0 ? (
                  resistances.map((level, i) => (
                    <View key={i} style={s.levelRow}>
                      <Text style={s.levelPrice}>
                        ${level.price.toFixed(2)}
                      </Text>
                      <Text style={s.levelStars}>
                        {"★".repeat(level.confluence)}
                        {"☆".repeat(5 - level.confluence)}
                      </Text>
                      <Text style={s.levelSources}>
                        {level.sources.join(", ")}
                      </Text>
                      <Text style={s.levelDistance}>
                        +${(level.price - currentPrice).toFixed(2)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={baseStyles.caption}>
                    No resistance levels detected
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      <View style={baseStyles.separator} />

      {/* IV Skew + OI Summary — side by side */}
      {(ivSkew || oiSummary) && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>Options Positioning</Text>
          <View style={s.twoCol}>
            {/* IV Skew */}
            {ivSkew && (
              <View style={s.halfCol}>
                <View style={baseStyles.card}>
                  <Text style={[baseStyles.h2, { marginBottom: 6 }]}>
                    IV Skew
                  </Text>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>Put IV (avg)</Text>
                    <Text style={s.skewValue}>
                      {(ivSkew.avgPutIV * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>Call IV (avg)</Text>
                    <Text style={s.skewValue}>
                      {(ivSkew.avgCallIV * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>Skew (P−C)</Text>
                    <Text
                      style={[
                        s.skewValue,
                        {
                          color:
                            ivSkew.putCallSkew > 0.02
                              ? colors.accentRed
                              : ivSkew.putCallSkew < -0.02
                                ? colors.accentGreen
                                : colors.textSecondary,
                        },
                      ]}
                    >
                      {ivSkew.putCallSkew > 0 ? "+" : ""}
                      {(ivSkew.putCallSkew * 100).toFixed(1)} vol pts
                    </Text>
                  </View>
                  <Text style={[baseStyles.caption, { marginTop: 4 }]}>
                    {ivSkew.interpretation}
                  </Text>
                </View>
              </View>
            )}
            {/* OI Summary */}
            {oiSummary && (
              <View style={s.halfCol}>
                <View style={baseStyles.card}>
                  <Text style={[baseStyles.h2, { marginBottom: 6 }]}>
                    OI Distribution
                  </Text>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>Call OI</Text>
                    <Text style={s.skewValue}>
                      {oiSummary.totalCallOI.toLocaleString()}
                    </Text>
                  </View>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>Put OI</Text>
                    <Text style={s.skewValue}>
                      {oiSummary.totalPutOI.toLocaleString()}
                    </Text>
                  </View>
                  <View style={s.skewRow}>
                    <Text style={s.skewLabel}>P/C OI Ratio</Text>
                    <Text
                      style={[
                        s.skewValue,
                        {
                          color:
                            oiSummary.pcOIRatio > 1.2
                              ? colors.accentRed
                              : oiSummary.pcOIRatio < 0.8
                                ? colors.accentGreen
                                : colors.textSecondary,
                        },
                      ]}
                    >
                      {oiSummary.pcOIRatio.toFixed(2)}
                    </Text>
                  </View>
                  {oiSummary.topStrikes.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      <Text
                        style={[
                          baseStyles.caption,
                          { fontFamily: "Helvetica-Bold", marginBottom: 3 },
                        ]}
                      >
                        TOP STRIKES BY OI
                      </Text>
                      {oiSummary.topStrikes.map((ts, i) => (
                        <View key={i} style={s.oiStrikeRow}>
                          <Text
                            style={{
                              fontSize: fontSize.caption,
                              color: colors.textPrimary,
                              fontFamily: "Courier",
                            }}
                          >
                            ${ts.strike}
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.caption,
                              color: colors.accentGreen,
                            }}
                          >
                            C:{ts.callOI.toLocaleString()}
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.caption,
                              color: colors.accentRed,
                            }}
                          >
                            P:{ts.putOI.toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Catalyst Calendar */}
      {(catalysts.events.length > 0 || enrichedData.earningsDate) && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h1}>
            Catalyst Calendar ({catalysts.highImpactCount} high-impact)
          </Text>
          <View style={baseStyles.card}>
            {enrichedData.earningsDate &&
              (() => {
                const daysTo = Math.ceil(
                  (new Date(enrichedData.earningsDate!).getTime() -
                    Date.now()) /
                    (1000 * 60 * 60 * 24),
                );
                return daysTo > 0 && daysTo <= 30 ? (
                  <View
                    style={[
                      s.catalystRow,
                      {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.accentAmber,
                      },
                    ]}
                  >
                    <Text
                      style={[s.catalystImpact, { color: colors.accentAmber }]}
                    >
                      E
                    </Text>
                    <Text
                      style={[s.catalystName, { color: colors.accentAmber }]}
                    >
                      EARNINGS
                    </Text>
                    <Text style={s.catalystDate}>
                      {enrichedData.earningsDate!.slice(0, 10)}
                    </Text>
                    <Text style={s.catalystDays}>{daysTo}d</Text>
                    <Text style={s.catalystDesc}>
                      Expect IV expansion into earnings, potential IV crush
                      after
                    </Text>
                  </View>
                ) : null;
              })()}
            {catalysts.events.slice(0, 8).map((event, i) => (
              <View key={i} style={s.catalystRow}>
                <Text style={s.catalystImpact}>
                  {event.impact === "high"
                    ? "H"
                    : event.impact === "medium"
                      ? "M"
                      : "L"}
                </Text>
                <Text style={s.catalystName}>{event.name}</Text>
                <Text style={s.catalystDate}>{event.date}</Text>
                <Text style={s.catalystDays}>{event.daysUntil}d</Text>
                <Text style={s.catalystDesc}>{event.description}</Text>
              </View>
            ))}
          </View>
          <Text style={[baseStyles.caption, { marginTop: 4 }]}>
            E = earnings, H = high impact (market-moving), M = medium, L = low.
            Dates are approximate and may shift by 1-2 days.
          </Text>
        </View>
      )}
    </ReportPage>
  );
}
