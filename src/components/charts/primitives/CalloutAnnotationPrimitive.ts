import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitiveHoveredItem,
  ISeriesApi,
  SeriesType,
  IChartApiBase,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CalloutEntry {
  /** Label text shown in the top legend bar */
  label: string;
  /** Concise timestamp shown beside the label for chronology */
  timestamp?: string | null;
  /** Color of the numbered marker + legend pill accent */
  color: string;
  /** Chart time coordinate the annotation points to */
  time: Time;
  /** Price coordinate the annotation points to */
  price: number;
  /** Signal direction (controls small arrow glyph next to label) */
  direction: "bullish" | "bearish" | "neutral";
  /** Stable id for hover detection */
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Layout: top-bar horizontal pill wrapping                           */
/* ------------------------------------------------------------------ */

const PILL_HEIGHT = 16; // px
const PILL_GAP_X = 5; // horizontal gap between pills
const PILL_GAP_Y = 3; // vertical gap between rows
const ROW_STEP = PILL_HEIGHT + PILL_GAP_Y;
const BAR_PAD_X = 8; // left/right inset from chart edge
const BAR_PAD_Y = 6; // top inset from chart edge
const MARKER_RADIUS = 7; // px radius of numbered circle on chart

export interface PillLayout {
  entry: CalloutEntry;
  /** 1-based ordinal number */
  order: number;
  /** Pill X position */
  pillX: number;
  /** Pill Y position (top edge) */
  pillY: number;
  /** Pill width */
  pillW: number;
  /** Chart-X for numbered marker */
  chartX: number;
  /** Chart-Y for numbered marker */
  chartY: number;
}

/**
 * Lay out pills in a horizontal wrap at the top of the chart.
 * Returns pill positions + chart marker positions.
 * @internal Exported for testing only.
 */
export function layoutTopBarPills(
  items: { entry: CalloutEntry; chartX: number; chartY: number }[],
  chartWidth: number,
  measureText: (text: string, font: string) => number,
): PillLayout[] {
  const result: PillLayout[] = [];
  let curX = BAR_PAD_X;
  let curY = BAR_PAD_Y;
  const maxX = chartWidth - BAR_PAD_X;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const order = i + 1;

    // Measure pill width: circled number + glyph + name + timestamp
    const numW = measureText(String(order), "bold 9px sans-serif") + 12; // number badge
    const nameW = measureText(item.entry.label, "bold 9px sans-serif");
    const tsW = item.entry.timestamp
      ? measureText(item.entry.timestamp, "8px sans-serif") + 6
      : 0;
    const pillW = numW + nameW + tsW + 12; // internal padding

    // Wrap to next row if needed
    if (curX + pillW > maxX && curX > BAR_PAD_X) {
      curX = BAR_PAD_X;
      curY += ROW_STEP;
    }

    result.push({
      entry: item.entry,
      order,
      pillX: curX,
      pillY: curY,
      pillW,
      chartX: item.chartX,
      chartY: item.chartY,
    });

    curX += pillW + PILL_GAP_X;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Marker collision: spine stacking for overlapping markers           */
/* ------------------------------------------------------------------ */

const COLLISION_DISTANCE = MARKER_RADIUS * 3; // cluster markers within ~3 radii
const SPINE_SPACING = MARKER_RADIUS * 2 + 4; // gap between centers on a spine
const MIN_MARKER_GAP = MARKER_RADIUS * 2 + 2; // minimum gap in final de-collision

export interface MarkerRenderInfo {
  order: number;
  color: string;
  /** Original detection point */
  anchorX: number;
  anchorY: number;
  /** Resolved position (may differ from anchor if in a cluster) */
  markerX: number;
  markerY: number;
  inCluster: boolean;
}

export interface SpineSegment {
  x: number;
  topY: number;
  bottomY: number;
}

const CHART_PAD = MARKER_RADIUS + 4; // safety margin from chart edges

/**
 * Detect overlapping chart markers and fan them out along vertical spines.
 * Isolated markers keep their original positions.
 * When a cluster would extend beyond chartHeight, spacing is compressed to fit.
 * @internal Exported for testing only.
 */
export function resolveMarkerCollisions(
  pills: PillLayout[],
  chartHeight = 9999,
): { markers: MarkerRenderInfo[]; spines: SpineSegment[] } {
  if (pills.length === 0) return { markers: [], spines: [] };

  const n = pills.length;
  const topBound = CHART_PAD;
  const bottomBound = Math.max(
    topBound + MARKER_RADIUS,
    chartHeight - CHART_PAD,
  );

  // Union-Find for clustering
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pills[i].chartX - pills[j].chartX;
      const dy = pills[i].chartY - pills[j].chartY;
      if (Math.sqrt(dx * dx + dy * dy) < COLLISION_DISTANCE) {
        union(i, j);
      }
    }
  }

  // Group indices by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  // Initialize markers at original positions
  const markers: MarkerRenderInfo[] = pills.map((p) => ({
    order: p.order,
    color: p.entry.color,
    anchorX: p.chartX,
    anchorY: p.chartY,
    markerX: p.chartX,
    markerY: p.chartY,
    inCluster: false,
  }));

  const spines: SpineSegment[] = [];

  for (const [, members] of clusters) {
    if (members.length <= 1) continue;

    // Sort by original Y for consistent stacking order
    members.sort((a, b) => pills[a].chartY - pills[b].chartY);

    // Centroid of the cluster
    let sumX = 0;
    let sumY = 0;
    for (const m of members) {
      sumX += pills[m].chartX;
      sumY += pills[m].chartY;
    }
    const cx = sumX / members.length;
    const cy = sumY / members.length;

    // Fan out vertically centered on centroid; compress if it would overflow
    const availableH = bottomBound - topBound;
    const idealTotalH = (members.length - 1) * SPINE_SPACING;
    const effectiveSpacing =
      idealTotalH > availableH
        ? availableH / Math.max(members.length - 1, 1)
        : SPINE_SPACING;
    const totalH = (members.length - 1) * effectiveSpacing;

    // Center on centroid, then clamp so the full fan stays in bounds
    let startY = cy - totalH / 2;
    if (startY < topBound) startY = topBound;
    if (startY + totalH > bottomBound) startY = bottomBound - totalH;

    for (let i = 0; i < members.length; i++) {
      const idx = members[i];
      markers[idx].markerX = cx;
      markers[idx].markerY = startY + i * effectiveSpacing;
      markers[idx].inCluster = true;
    }

    // Spine line spanning the fanned-out markers (with small padding)
    spines.push({
      x: cx,
      topY: Math.max(topBound - 2, startY - MARKER_RADIUS - 2),
      bottomY: Math.min(bottomBound + 2, startY + totalH + MARKER_RADIUS + 2),
    });
  }

  // --- Post-resolution de-collision: fix any remaining overlaps ---
  // Sort all markers by resolved Y, push apart any that are too close,
  // then clamp to bounds.
  const byY = markers
    .map((m, i) => ({ idx: i, y: m.markerY, x: m.markerX }))
    .sort((a, b) => a.y - b.y);

  // Forward pass: push down
  for (let i = 1; i < byY.length; i++) {
    const prev = byY[i - 1];
    const cur = byY[i];
    // Only de-collide markers that share a similar X (within one spine width)
    if (Math.abs(prev.x - cur.x) > MARKER_RADIUS * 4) continue;
    const gap = cur.y - prev.y;
    if (gap < MIN_MARKER_GAP) {
      cur.y = prev.y + MIN_MARKER_GAP;
    }
  }

  // Backward pass: push up if bottom overflowed
  for (let i = byY.length - 1; i >= 0; i--) {
    if (byY[i].y > bottomBound) byY[i].y = bottomBound;
    if (
      i < byY.length - 1 &&
      Math.abs(byY[i].x - byY[i + 1].x) <= MARKER_RADIUS * 4
    ) {
      const maxY = byY[i + 1].y - MIN_MARKER_GAP;
      if (byY[i].y > maxY) byY[i].y = maxY;
    }
  }

  // Clamp first marker and re-forward to fix any remaining compression
  if (byY.length > 0 && byY[0].y < topBound) byY[0].y = topBound;
  for (let i = 1; i < byY.length; i++) {
    if (Math.abs(byY[i - 1].x - byY[i].x) > MARKER_RADIUS * 4) continue;
    const minY = byY[i - 1].y + MIN_MARKER_GAP;
    if (byY[i].y < minY) byY[i].y = minY;
  }

  // Write resolved Y values back and mark any newly shifted markers as clustered
  for (const item of byY) {
    const m = markers[item.idx];
    if (m.markerY !== item.y) {
      m.markerY = item.y;
      m.inCluster = true;
    }
  }

  // Rebuild spines to cover all clustered markers that share an X position
  spines.length = 0;
  const xGroups = new Map<number, number[]>();
  for (let i = 0; i < markers.length; i++) {
    if (!markers[i].inCluster) continue;
    // Round X to group markers on the same spine
    const key = Math.round(markers[i].markerX);
    if (!xGroups.has(key)) xGroups.set(key, []);
    xGroups.get(key)!.push(i);
  }
  for (const [x, idxs] of xGroups) {
    if (idxs.length < 2) continue;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const i of idxs) {
      if (markers[i].markerY < minY) minY = markers[i].markerY;
      if (markers[i].markerY > maxY) maxY = markers[i].markerY;
    }
    spines.push({
      x,
      topY: minY - MARKER_RADIUS - 2,
      bottomY: maxY + MARKER_RADIUS + 2,
    });
  }

  return { markers, spines };
}

/* ------------------------------------------------------------------ */
/*  Renderer (markers + spines only — legend is rendered as DOM)       */
/* ------------------------------------------------------------------ */

class CalloutRenderer implements IPrimitivePaneRenderer {
  private _markers: MarkerRenderInfo[] = [];
  private _spines: SpineSegment[] = [];

  setData(markers: MarkerRenderInfo[], spines: SpineSegment[]) {
    this._markers = markers;
    this._spines = spines;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._markers.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // --- 1. Draw spine lines for collision clusters ---
      ctx.setLineDash([]);
      for (const spine of this._spines) {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(spine.x, spine.topY);
        ctx.lineTo(spine.x, spine.bottomY);
        ctx.stroke();
      }

      // --- 2. Draw numbered markers at resolved positions ---
      for (const m of this._markers) {
        // Outer circle
        ctx.fillStyle = m.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(m.markerX, m.markerY, MARKER_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Dark inner fill for contrast
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(m.markerX, m.markerY, MARKER_RADIUS - 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Number text
        ctx.fillStyle = m.color;
        ctx.globalAlpha = 1;
        ctx.font = "bold 9px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(m.order), m.markerX, m.markerY + 0.5);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }
}

/* ------------------------------------------------------------------ */
/*  PaneView: converts CalloutEntry[] → pixel coords for the renderer */
/* ------------------------------------------------------------------ */

class CalloutPaneView implements IPrimitivePaneView {
  private _renderer = new CalloutRenderer();
  private _entries: CalloutEntry[] = [];
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;

  setEntries(entries: CalloutEntry[]) {
    this._entries = entries;
  }

  setSeriesAndChart(
    series: ISeriesApi<SeriesType, Time>,
    chart: IChartApiBase<Time>,
  ) {
    this._series = series;
    this._chart = chart;
  }

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || !this._chart || this._entries.length === 0) {
      this._renderer.setData([], []);
      return this._renderer;
    }

    const timeScale = this._chart.timeScale();

    // Resolve pixel positions for every entry
    const pillsForCollision: PillLayout[] = [];
    for (let i = 0; i < this._entries.length; i++) {
      const entry = this._entries[i];
      const x = timeScale.timeToCoordinate(entry.time);
      const y = this._series.priceToCoordinate(entry.price);
      if (x === null || y === null) continue;
      pillsForCollision.push({
        entry,
        order: i + 1,
        pillX: 0,
        pillY: 0,
        pillW: 0,
        chartX: x,
        chartY: y,
      });
    }

    // Get chart height for bounding spine stacking
    const chartHeight =
      (this._chart as unknown as { height?: () => number }).height?.() ?? 400;

    const { markers, spines } = resolveMarkerCollisions(
      pillsForCollision,
      chartHeight,
    );
    this._renderer.setData(markers, spines);
    return this._renderer;
  }
}

/* ------------------------------------------------------------------ */
/*  Primitive (public API): attach to a series                         */
/* ------------------------------------------------------------------ */

export class CalloutAnnotationPrimitive implements ISeriesPrimitive<Time> {
  private _paneView = new CalloutPaneView();
  private _entries: CalloutEntry[] = [];
  private _requestUpdate: (() => void) | null = null;
  private _visible = true;

  readonly id = "callout-annotations";

  setEntries(entries: CalloutEntry[]) {
    this._entries = entries;
    this._paneView.setEntries(this._visible ? entries : []);
    this._requestUpdate?.();
  }

  setVisible(visible: boolean) {
    this._visible = visible;
    this._paneView.setEntries(visible ? this._entries : []);
    this._requestUpdate?.();
  }

  /* ISeriesPrimitive lifecycle */
  attached(param: SeriesAttachedParameter<Time>): void {
    this._requestUpdate = param.requestUpdate;
    this._paneView.setSeriesAndChart(param.series, param.chart);
  }

  detached(): void {
    this._requestUpdate = null;
  }

  paneViews(): IPrimitivePaneView[] {
    return [this._paneView];
  }

  updateAllViews(): void {
    // Rendering coordinates are recalculated in renderer() on each frame
  }

  hitTest(): PrimitiveHoveredItem | null {
    return null;
  }
}
