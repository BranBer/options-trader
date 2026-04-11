import { StyleSheet } from "@react-pdf/renderer";

// ── Color palette ──────────────────────────────────────────────────────

export const colors = {
  background: "#18181b", // zinc-900
  surface: "#27272a", // zinc-800
  border: "#3f3f46", // zinc-700
  textPrimary: "#fafafa", // zinc-50
  textSecondary: "#a1a1aa", // zinc-400
  textMuted: "#71717a", // zinc-500
  accentGreen: "#22c55e",
  accentRed: "#ef4444",
  accentBlue: "#3b82f6",
  accentAmber: "#f59e0b",
  accentCyan: "#06b6d4",
  accentOrange: "#f97316",
} as const;

// ── Badge color maps ───────────────────────────────────────────────────

export const signalColors = {
  bullish: { bg: "#22c55e20", border: "#22c55e", text: "#22c55e" },
  bearish: { bg: "#ef444420", border: "#ef4444", text: "#ef4444" },
  neutral: { bg: "#71717a20", border: "#71717a", text: "#71717a" },
} as const;

export const riskColors = {
  low: signalColors.bullish,
  moderate: { bg: "#f59e0b20", border: "#f59e0b", text: "#f59e0b" },
  high: signalColors.bearish,
  very_high: signalColors.bearish,
} as const;

// ── Font sizes (pt) ───────────────────────────────────────────────────

export const fontSize = {
  title: 28,
  h1: 18,
  h2: 14,
  body: 10,
  caption: 8,
  badge: 8,
  mono: 9,
} as const;

// ── Base styles ────────────────────────────────────────────────────────

export const baseStyles = StyleSheet.create({
  // Page template
  page: {
    backgroundColor: colors.background,
    paddingTop: 54 + 12, // header height + gap
    paddingBottom: 36 + 12, // footer height + gap
    paddingHorizontal: 54, // 0.75"
    fontFamily: "Helvetica",
    color: colors.textSecondary,
    fontSize: fontSize.body,
  },

  // Fixed header on every page (except cover)
  header: {
    position: "absolute",
    top: 18,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontFamily: "Helvetica",
  },
  headerRight: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontFamily: "Helvetica-Bold",
  },

  // Fixed footer on every page
  footer: {
    position: "absolute",
    bottom: 14,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  footerLeft: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  footerRight: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },

  // Typography
  title: {
    fontSize: fontSize.title,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
  },
  h1: {
    fontSize: fontSize.h1,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  h2: {
    fontSize: fontSize.h2,
    fontFamily: "Helvetica-Bold",
    color: colors.textPrimary,
    marginBottom: 6,
  },
  body: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  caption: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  mono: {
    fontSize: fontSize.mono,
    fontFamily: "Courier",
    color: colors.textPrimary,
  },

  // Layout
  section: {
    marginBottom: 16,
  },
  separator: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    marginVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  spaceBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  // Card / surface
  card: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },

  // Badge
  badge: {
    fontSize: fontSize.badge,
    fontFamily: "Helvetica-Bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 0.5,
  },

  // Table
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableCell: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    paddingHorizontal: 4,
  },
  tableCellHeader: {
    fontSize: fontSize.caption,
    fontFamily: "Helvetica-Bold",
    color: colors.textMuted,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
});

// ── Helper: get signal badge style ─────────────────────────────────────

export function getSignalStyle(signal: "bullish" | "bearish" | "neutral") {
  const c = signalColors[signal] ?? signalColors.neutral;
  return {
    backgroundColor: c.bg,
    borderColor: c.border,
    color: c.text,
  };
}

export function getRiskStyle(risk: "low" | "moderate" | "high" | "very_high") {
  const c = riskColors[risk] ?? riskColors.moderate;
  return {
    backgroundColor: c.bg,
    borderColor: c.border,
    color: c.text,
  };
}

// ── Helper: format date for display ────────────────────────────────────

export function formatReportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
