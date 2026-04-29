"use client";

import type { SqueezeScoreResult } from "@/types/squeeze";

interface Props {
  result: Pick<SqueezeScoreResult, "totalScore" | "squeezeRisk">;
  size?: number; // diameter in px, default 96
}

const TIER_COLORS: Record<SqueezeScoreResult["squeezeRisk"], string> = {
  extreme: "#ef4444", // red-500
  high: "#f97316", // orange-500
  moderate: "#eab308", // yellow-500
  low: "#22c55e", // green-500
};

const TIER_LABELS: Record<SqueezeScoreResult["squeezeRisk"], string> = {
  extreme: "Critical",
  high: "Elevated",
  moderate: "Developing",
  low: "Low",
};

/**
 * S51-6: SVG radial arc gauge showing 0–100 squeeze score.
 * Accessible: role="meter" with aria-valuenow/min/max.
 * Respects prefers-reduced-motion — no animation when motion is reduced.
 */
export function SqueezeScoreGauge({ result, size = 96 }: Props) {
  const { totalScore, squeezeRisk } = result;
  const color = TIER_COLORS[squeezeRisk];
  const label = TIER_LABELS[squeezeRisk];

  // Arc geometry
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.78;
  const strokeWidth = size * 0.1;

  // Arc spans 240° (from 150° to 390° / -210°), starting bottom-left
  const startAngle = 150; // degrees
  const totalArc = 240;
  const fillArc = (totalScore / 100) * totalArc;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcX = (angle: number) => cx + r * Math.cos(toRad(angle));
  const arcY = (angle: number) => cy + r * Math.sin(toRad(angle));

  // Background track (full 240°)
  const bgEnd = startAngle + totalArc;
  const bgPath = describeArc(cx, cy, r, startAngle, bgEnd);

  // Foreground fill arc
  const fillEnd = startAngle + fillArc;
  const fillPath =
    fillArc > 0 ? describeArc(cx, cy, r, startAngle, fillEnd) : null;

  const fontSize = size * 0.22;
  const labelSize = size * 0.1;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="meter"
      aria-valuenow={totalScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Squeeze score: ${totalScore} out of 100 — ${label}`}
      className="shrink-0"
    >
      {/* Background track */}
      <path
        d={bgPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="text-muted/30"
      />

      {/* Score fill */}
      {fillPath && (
        <path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
          style={{ filter: `drop-shadow(0 0 ${size * 0.04}px ${color}80)` }}
        />
      )}

      {/* Score number */}
      <text
        x={cx}
        y={cy + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={color}
        aria-hidden="true"
      >
        {totalScore}
      </text>

      {/* Tier label */}
      <text
        x={cx}
        y={cy + fontSize * 0.35 + labelSize * 1.3}
        textAnchor="middle"
        fontSize={labelSize}
        fill="currentColor"
        className="fill-muted-foreground"
        aria-hidden="true"
      >
        {label}
      </text>
    </svg>
  );
}

/** Builds an SVG arc path from startDeg to endDeg around (cx,cy) with radius r. */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
