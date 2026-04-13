import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import ReportPage from "./ReportPage";
import { colors, fontSize, baseStyles, signalColors } from "./styles";

const s = StyleSheet.create({
  assessmentBadge: {
    fontSize: fontSize.badge,
    fontFamily: "Helvetica-Bold",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  scoreBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: 4,
    marginBottom: 2,
  },
  scoreFill: {
    height: 8,
    borderRadius: 4,
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  scoreLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 80,
  },
  scoreValue: {
    fontSize: fontSize.body,
    fontFamily: "Courier",
    color: colors.textPrimary,
    width: 45,
    textAlign: "right",
  },
  scoreBarOuter: {
    flex: 1,
    marginHorizontal: 8,
  },
  triggerRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  triggerLabel: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    width: 100,
  },
  triggerValue: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    flex: 1,
  },
  swingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  levelType: {
    fontSize: fontSize.badge,
    fontFamily: "Helvetica-Bold",
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderWidth: 0.5,
  },
  levelLabel: {
    fontSize: fontSize.body,
    color: colors.textPrimary,
    width: 130,
  },
  levelPrice: {
    fontSize: fontSize.body,
    fontFamily: "Courier",
    color: colors.textPrimary,
    width: 60,
  },
  levelDistance: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    width: 50,
    textAlign: "right",
  },
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
});

function scoreColor(score: number): string {
  if (score >= 70) return colors.accentGreen;
  if (score >= 55) return colors.accentAmber;
  return colors.textMuted;
}

function assessmentStyle(assessment: TriggerReport["overallAssessment"]) {
  switch (assessment) {
    case "actionable_bullish":
      return signalColors.bullish;
    case "actionable_bearish":
      return signalColors.bearish;
    case "setup_only":
    case "conflicted":
      return signalColors.caution;
    default:
      return signalColors.neutral;
  }
}

function assessmentLabel(assessment: TriggerReport["overallAssessment"]) {
  switch (assessment) {
    case "actionable_bullish":
      return "ACTIONABLE BULLISH";
    case "actionable_bearish":
      return "ACTIONABLE BEARISH";
    case "setup_only":
      return "SETUP ONLY";
    case "conflicted":
      return "CONFLICTED";
    case "no_trigger":
      return "NO TRIGGER";
  }
}

function interactionLabel(type: string): {
  text: string;
  color: typeof signalColors.bullish;
} {
  switch (type) {
    case "reclaim":
    case "bounce":
    case "acceptance_above":
      return { text: type.toUpperCase(), color: signalColors.bullish };
    case "breakdown":
    case "rejection":
    case "acceptance_below":
      return { text: type.toUpperCase(), color: signalColors.bearish };
    default:
      return { text: type.toUpperCase(), color: signalColors.neutral };
  }
}

interface ScoreBarProps {
  label: string;
  value: number;
  max: number;
}

function ScoreBarRow({ label, value, max }: ScoreBarProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <View style={s.scoreRow}>
      <Text style={s.scoreLabel}>{label}</Text>
      <View style={s.scoreBarOuter}>
        <View style={s.scoreBar}>
          <View
            style={[
              s.scoreFill,
              {
                width: `${pct * 100}%`,
                backgroundColor: scoreColor((value / max) * 100),
              },
            ]}
          />
        </View>
      </View>
      <Text style={s.scoreValue}>
        {value}/{max}
      </Text>
    </View>
  );
}

interface ReportTriggerPageProps {
  ticker: string;
  generatedAt: string;
  triggerReport: TriggerReport | null;
}

export default function ReportTriggerPage({
  ticker,
  generatedAt,
  triggerReport,
}: ReportTriggerPageProps) {
  if (!triggerReport) return null;

  const { primaryTrigger, swingStructure, activeLevels, overallAssessment } =
    triggerReport;
  const badge = assessmentStyle(overallAssessment);

  return (
    <ReportPage ticker={ticker} generatedAt={generatedAt}>
      <Text style={baseStyles.h1}>Trigger Assessment</Text>

      {/* Overall assessment badge */}
      <Text
        style={[
          s.assessmentBadge,
          {
            color: badge.text,
            backgroundColor: badge.bg,
            borderColor: badge.border,
          },
        ]}
      >
        {assessmentLabel(overallAssessment)}
      </Text>

      <View style={s.twoCol}>
        {/* Left column: Primary trigger details */}
        <View style={s.halfCol}>
          <View style={baseStyles.card}>
            <Text style={baseStyles.h2}>Primary Trigger</Text>
            {primaryTrigger ? (
              <>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>Direction</Text>
                  <Text
                    style={[
                      s.triggerValue,
                      {
                        color:
                          primaryTrigger.direction === "bullish"
                            ? colors.accentGreen
                            : primaryTrigger.direction === "bearish"
                              ? colors.accentRed
                              : colors.textSecondary,
                      },
                    ]}
                  >
                    {primaryTrigger.direction.toUpperCase()} —{" "}
                    {primaryTrigger.classification.replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>Score</Text>
                  <Text
                    style={[
                      s.triggerValue,
                      {
                        color: scoreColor(primaryTrigger.score),
                        fontFamily: "Helvetica-Bold",
                      },
                    ]}
                  >
                    {primaryTrigger.score}/100
                  </Text>
                </View>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>Key Level</Text>
                  <Text style={s.triggerValue}>
                    {primaryTrigger.interaction
                      ? `$${primaryTrigger.interaction.level.toFixed(2)} (${primaryTrigger.interaction.levelLabel})`
                      : "—"}
                  </Text>
                </View>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>Confirmation</Text>
                  <Text style={s.triggerValue}>
                    {primaryTrigger.confirmationType.replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>HTF Context</Text>
                  <Text
                    style={[
                      s.triggerValue,
                      {
                        color:
                          primaryTrigger.htfAlignment === "aligned"
                            ? colors.accentGreen
                            : primaryTrigger.htfAlignment === "countertrend"
                              ? colors.accentRed
                              : colors.accentAmber,
                      },
                    ]}
                  >
                    {primaryTrigger.htfAlignment.toUpperCase()}
                  </Text>
                </View>
                <View style={s.triggerRow}>
                  <Text style={s.triggerLabel}>Confidence</Text>
                  <Text style={s.triggerValue}>
                    {primaryTrigger.confidence}
                  </Text>
                </View>
                {primaryTrigger.summary && (
                  <View
                    style={{
                      marginTop: 6,
                      borderLeftWidth: 2,
                      borderLeftColor: colors.border,
                      paddingLeft: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.caption,
                        color: colors.textSecondary,
                        lineHeight: 1.4,
                      }}
                    >
                      {primaryTrigger.summary}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={baseStyles.body}>
                No actionable trigger detected on the daily chart.
              </Text>
            )}
          </View>
        </View>

        {/* Right column: Score breakdown */}
        <View style={s.halfCol}>
          <View style={baseStyles.card}>
            <Text style={baseStyles.h2}>Score Breakdown</Text>
            {primaryTrigger ? (
              <>
                <ScoreBarRow
                  label="Level"
                  value={primaryTrigger.scoreBreakdown?.levelInteraction ?? 0}
                  max={40}
                />
                <ScoreBarRow
                  label="Structure"
                  value={primaryTrigger.scoreBreakdown?.structureAlignment ?? 0}
                  max={25}
                />
                <ScoreBarRow
                  label="Context"
                  value={primaryTrigger.scoreBreakdown?.contextAlignment ?? 0}
                  max={20}
                />
                <ScoreBarRow
                  label="Patterns"
                  value={primaryTrigger.scoreBreakdown?.patternSupport ?? 0}
                  max={15}
                />
                <View style={baseStyles.separator} />
                <View style={s.scoreRow}>
                  <Text
                    style={[s.scoreLabel, { fontFamily: "Helvetica-Bold" }]}
                  >
                    Total
                  </Text>
                  <View style={s.scoreBarOuter} />
                  <Text
                    style={[
                      s.scoreValue,
                      {
                        fontFamily: "Helvetica-Bold",
                        color: scoreColor(primaryTrigger.score),
                      },
                    ]}
                  >
                    {primaryTrigger.score}/100
                  </Text>
                </View>
              </>
            ) : (
              <Text style={baseStyles.body}>—</Text>
            )}
          </View>
        </View>
      </View>

      {/* Swing structure summary */}
      <View style={baseStyles.section}>
        <Text style={baseStyles.h2}>Market Structure</Text>
        <View style={baseStyles.card}>
          <View style={s.triggerRow}>
            <Text style={s.triggerLabel}>Structure</Text>
            <Text
              style={[
                s.triggerValue,
                {
                  color:
                    swingStructure.structure === "bullish"
                      ? colors.accentGreen
                      : swingStructure.structure === "bearish"
                        ? colors.accentRed
                        : colors.accentAmber,
                  fontFamily: "Helvetica-Bold",
                },
              ]}
            >
              {swingStructure.structure.toUpperCase()}
              {swingStructure.structureShift
                ? ` (shift from ${swingStructure.structureShift.from})`
                : ""}
            </Text>
          </View>
          {swingStructure.lastHigherLow && (
            <View style={s.triggerRow}>
              <Text style={s.triggerLabel}>Last Higher Low</Text>
              <Text style={s.triggerValue}>
                ${swingStructure.lastHigherLow.price.toFixed(2)}
              </Text>
            </View>
          )}
          {swingStructure.lastLowerHigh && (
            <View style={s.triggerRow}>
              <Text style={s.triggerLabel}>Last Lower High</Text>
              <Text style={s.triggerValue}>
                ${swingStructure.lastLowerHigh.price.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Recent swings list */}
          {(swingStructure.swings?.length ?? 0) > 0 && (
            <View style={{ marginTop: 8 }}>
              <Text style={[baseStyles.caption, { marginBottom: 4 }]}>
                Recent Swing Points
              </Text>
              {(swingStructure.swings ?? []).slice(-6).map((swing, i) => (
                <View key={i} style={s.swingRow}>
                  <Text
                    style={{
                      fontSize: fontSize.body,
                      color:
                        swing.type === "high"
                          ? colors.accentGreen
                          : colors.accentRed,
                      width: 40,
                      fontFamily: "Helvetica-Bold",
                    }}
                  >
                    {swing.type === "high" ? "^ HI" : "v LO"}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.body,
                      fontFamily: "Courier",
                      color: colors.textPrimary,
                    }}
                  >
                    ${swing.price.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Active level interactions */}
      {activeLevels.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h2}>Active Level Interactions</Text>
          <View style={baseStyles.card}>
            {activeLevels.slice(0, 8).map((lvl, i) => {
              const badge = interactionLabel(lvl.type);
              return (
                <View key={i} style={s.levelRow}>
                  <Text
                    style={[
                      s.levelType,
                      {
                        color: badge.color.text,
                        backgroundColor: badge.color.bg,
                        borderColor: badge.color.border,
                      },
                    ]}
                  >
                    {badge.text}
                  </Text>
                  <Text style={s.levelLabel}>
                    {lvl.levelLabel}
                    {lvl.wickOnly ? " (wick)" : ""}
                  </Text>
                  <Text style={s.levelPrice}>${lvl.level.toFixed(2)}</Text>
                  <Text style={s.levelDistance}>
                    {lvl.distance.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Secondary triggers */}
      {triggerReport.secondaryTriggers.length > 0 && (
        <View style={baseStyles.section}>
          <Text style={baseStyles.h2}>Secondary Triggers</Text>
          <View style={baseStyles.card}>
            {triggerReport.secondaryTriggers.slice(0, 3).map((t, i) => {
              const dirColor =
                t.direction === "bullish"
                  ? signalColors.bullish
                  : t.direction === "bearish"
                    ? signalColors.bearish
                    : signalColors.neutral;
              return (
                <View key={i} style={s.levelRow}>
                  <Text
                    style={[
                      s.levelType,
                      {
                        color: dirColor.text,
                        backgroundColor: dirColor.bg,
                        borderColor: dirColor.border,
                      },
                    ]}
                  >
                    {t.direction.toUpperCase()}
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.body,
                      fontFamily: "Courier",
                      color: scoreColor(t.score),
                      width: 35,
                      textAlign: "right",
                    }}
                  >
                    {t.score}
                  </Text>
                  <Text
                    style={[
                      s.triggerValue,
                      { fontSize: fontSize.caption, marginLeft: 8 },
                    ]}
                  >
                    {t.summary}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ReportPage>
  );
}
