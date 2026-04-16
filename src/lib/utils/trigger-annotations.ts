import type {
  TriggerClassification,
  TriggerDirection,
  TriggerReport,
  TriggerResult,
} from "./trigger-engine";
import type { InteractionType, LevelInteraction } from "./level-interactions";

export interface TriggerAnnotation {
  id: string;
  time: number;
  level: number;
  label: string;
  direction: TriggerDirection;
  classification: TriggerClassification;
  primary: boolean;
  score: number;
  levelLabel: string;
  summary: string;
  anchorPrice: number;
}

function titleCaseInteraction(type: string): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function interactionDirection(type: InteractionType): TriggerDirection {
  if (type === "reclaim" || type === "bounce" || type === "acceptance_above") {
    return "bullish";
  }

  if (
    type === "breakdown" ||
    type === "rejection" ||
    type === "acceptance_below"
  ) {
    return "bearish";
  }

  return "neutral";
}

function interactionKey(interaction: LevelInteraction): string {
  return [
    interaction.type,
    interaction.level.toFixed(4),
    interaction.candle.time,
    interaction.levelLabel,
  ].join("|");
}

function resultForInteraction(
  interaction: LevelInteraction,
  report: TriggerReport,
): { trigger: TriggerResult | null; primary: boolean } {
  const candidates = [
    report.primaryTrigger,
    ...report.secondaryTriggers,
  ].filter((trigger): trigger is TriggerResult => trigger?.interaction != null);
  const key = interactionKey(interaction);
  const matched = candidates.find(
    (trigger) => interactionKey(trigger.interaction!) === key,
  );

  return {
    trigger: matched ?? null,
    primary: matched != null && report.primaryTrigger === matched,
  };
}

function toAnnotation(
  interaction: LevelInteraction,
  index: number,
  report: TriggerReport,
): TriggerAnnotation | null {
  if (interaction.type === "test") return null;

  const { trigger, primary } = resultForInteraction(interaction, report);
  return {
    id: `trigger-annotation-${primary ? "primary" : "secondary"}-${interaction.candle.time}-${interaction.type}-${index}`,
    time: Math.floor(interaction.candle.time / 1000),
    level: interaction.level,
    label: titleCaseInteraction(interaction.type),
    direction: trigger?.direction ?? interactionDirection(interaction.type),
    classification: trigger?.classification ?? "setup",
    primary,
    score: trigger?.score ?? 0,
    levelLabel: interaction.levelLabel,
    summary:
      trigger?.summary ??
      `${titleCaseInteraction(interaction.type)} at ${interaction.levelLabel}`,
    anchorPrice: interaction.candle.close,
  };
}

export function buildTriggerAnnotations(
  report: TriggerReport | null | undefined,
): TriggerAnnotation[] {
  if (!report) return [];

  return report.activeLevels
    .map((interaction, index) => toAnnotation(interaction, index, report))
    .filter(
      (annotation): annotation is TriggerAnnotation => annotation != null,
    );
}
