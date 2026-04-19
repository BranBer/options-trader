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
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface EventMarkerEntry {
  /** Stable id for linking back to external UI (e.g. "classification-42") */
  id: string;
  /** Chart time coordinate (unix seconds) */
  time: Time;
  /** Price level for the marker anchor point */
  price: number;
  /** Accent colour for the marker dot */
  color: string;
  /** Signal direction — controls default placement (above/below bar) */
  direction: "bullish" | "bearish" | "neutral";
  /** Whether this marker is the active selection (renders larger + glow) */
  selected?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MARKER_RADIUS = 6;
const SELECTED_RADIUS = 8;
const COLLISION_DISTANCE = MARKER_RADIUS * 3.5;
const MIN_MARKER_GAP = MARKER_RADIUS * 2 + 3;
const CHART_PAD = MARKER_RADIUS + 4;

/* ------------------------------------------------------------------ */
/*  Collision resolution (Union-Find clustering + vertical fanning)    */
/* ------------------------------------------------------------------ */

interface ResolvedMarker {
  entry: EventMarkerEntry;
  order: number;
  anchorX: number;
  anchorY: number;
  markerX: number;
  markerY: number;
  inCluster: boolean;
}

interface SpineSegment {
  x: number;
  topY: number;
  bottomY: number;
}

function resolveCollisions(
  items: { entry: EventMarkerEntry; x: number; y: number }[],
  chartHeight: number,
): { markers: ResolvedMarker[]; spines: SpineSegment[] } {
  if (items.length === 0) return { markers: [], spines: [] };

  const n = items.length;
  const topBound = CHART_PAD;
  const bottomBound = Math.max(
    topBound + MARKER_RADIUS,
    chartHeight - CHART_PAD,
  );

  // Union-Find
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
      const dx = items[i].x - items[j].x;
      const dy = items[i].y - items[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < COLLISION_DISTANCE) {
        union(i, j);
      }
    }
  }

  // Group by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  // Initialize markers at original positions
  const markers: ResolvedMarker[] = items.map((item, i) => ({
    entry: item.entry,
    order: i + 1,
    anchorX: item.x,
    anchorY: item.y,
    markerX: item.x,
    markerY: item.y,
    inCluster: false,
  }));

  const spines: SpineSegment[] = [];
  const spacing = MARKER_RADIUS * 2 + 4;

  for (const [, members] of clusters) {
    if (members.length <= 1) continue;

    // Sort by original Y
    members.sort((a, b) => items[a].y - items[b].y);

    // Centroid
    let sumX = 0;
    let sumY = 0;
    for (const m of members) {
      sumX += items[m].x;
      sumY += items[m].y;
    }
    const cx = sumX / members.length;
    const cy = sumY / members.length;

    // Fan out vertically, compress if needed
    const availableH = bottomBound - topBound;
    const idealTotalH = (members.length - 1) * spacing;
    const effectiveSpacing =
      idealTotalH > availableH
        ? availableH / Math.max(members.length - 1, 1)
        : spacing;
    const totalH = (members.length - 1) * effectiveSpacing;

    let startY = cy - totalH / 2;
    if (startY < topBound) startY = topBound;
    if (startY + totalH > bottomBound) startY = bottomBound - totalH;

    for (let i = 0; i < members.length; i++) {
      const idx = members[i];
      markers[idx].markerX = cx;
      markers[idx].markerY = startY + i * effectiveSpacing;
      markers[idx].inCluster = true;
    }

    spines.push({
      x: cx,
      topY: Math.max(topBound - 2, startY - MARKER_RADIUS - 2),
      bottomY: Math.min(bottomBound + 2, startY + totalH + MARKER_RADIUS + 2),
    });
  }

  // Post-resolution de-collision passes
  const byY = markers
    .map((m, i) => ({ idx: i, y: m.markerY, x: m.markerX }))
    .sort((a, b) => a.y - b.y);

  // Forward pass
  for (let i = 1; i < byY.length; i++) {
    const prev = byY[i - 1];
    const cur = byY[i];
    if (Math.abs(prev.x - cur.x) > MARKER_RADIUS * 4) continue;
    if (cur.y - prev.y < MIN_MARKER_GAP) {
      cur.y = prev.y + MIN_MARKER_GAP;
    }
  }

  // Backward pass
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

  // Clamp + final forward
  if (byY.length > 0 && byY[0].y < topBound) byY[0].y = topBound;
  for (let i = 1; i < byY.length; i++) {
    if (Math.abs(byY[i - 1].x - byY[i].x) > MARKER_RADIUS * 4) continue;
    const minY = byY[i - 1].y + MIN_MARKER_GAP;
    if (byY[i].y < minY) byY[i].y = minY;
  }

  // Write back
  for (const item of byY) {
    const m = markers[item.idx];
    if (m.markerY !== item.y) {
      m.markerY = item.y;
      m.inCluster = true;
    }
  }

  // Rebuild spines
  spines.length = 0;
  const xGroups = new Map<number, number[]>();
  for (let i = 0; i < markers.length; i++) {
    if (!markers[i].inCluster) continue;
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
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */

class EventMarkerRenderer implements IPrimitivePaneRenderer {
  private _markers: ResolvedMarker[] = [];
  private _spines: SpineSegment[] = [];

  setData(markers: ResolvedMarker[], spines: SpineSegment[]) {
    this._markers = markers;
    this._spines = spines;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._markers.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // 1. Draw spine lines for clusters
      for (const spine of this._spines) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(spine.x, spine.topY);
        ctx.lineTo(spine.x, spine.bottomY);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // 2. Draw leader lines from anchor to resolved marker position
      for (const m of this._markers) {
        if (!m.inCluster) continue;
        const dx = m.markerX - m.anchorX;
        const dy = m.markerY - m.anchorY;
        if (Math.sqrt(dx * dx + dy * dy) < 4) continue;

        ctx.strokeStyle = m.entry.color;
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.anchorX, m.anchorY);
        ctx.lineTo(m.markerX, m.markerY);
        ctx.stroke();
      }

      // 3. Draw markers
      for (const m of this._markers) {
        const isSelected = m.entry.selected === true;
        const r = isSelected ? SELECTED_RADIUS : MARKER_RADIUS;

        // Glow for selected
        if (isSelected) {
          ctx.shadowColor = m.entry.color;
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }

        // Outer ring
        ctx.fillStyle = m.entry.color;
        ctx.globalAlpha = isSelected ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(m.markerX, m.markerY, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner dark fill for contrast
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.fillStyle = isSelected ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.55)";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(m.markerX, m.markerY, r - 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Number
        ctx.fillStyle = m.entry.color;
        ctx.globalAlpha = 1;
        ctx.font = `bold ${isSelected ? 10 : 9}px Inter, system-ui, sans-serif`;
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
/*  Pane view                                                          */
/* ------------------------------------------------------------------ */

class EventMarkerPaneView implements IPrimitivePaneView {
  private _renderer = new EventMarkerRenderer();
  private _entries: EventMarkerEntry[] = [];
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _resolvedMarkers: ResolvedMarker[] = [];

  setEntries(entries: EventMarkerEntry[]) {
    this._entries = entries;
  }

  setSeriesAndChart(
    series: ISeriesApi<SeriesType, Time>,
    chart: IChartApiBase<Time>,
  ) {
    this._series = series;
    this._chart = chart;
  }

  getResolvedMarkers(): ResolvedMarker[] {
    return this._resolvedMarkers;
  }

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || !this._chart || this._entries.length === 0) {
      this._resolvedMarkers = [];
      this._renderer.setData([], []);
      return this._renderer;
    }

    const timeScale = this._chart.timeScale();
    const items: { entry: EventMarkerEntry; x: number; y: number }[] = [];

    for (const entry of this._entries) {
      const x = timeScale.timeToCoordinate(entry.time);
      const y = this._series.priceToCoordinate(entry.price);
      if (x === null || y === null) continue;

      // Offset: bearish above, bullish below, neutral centered
      const offset =
        entry.direction === "bearish"
          ? -(MARKER_RADIUS + 6)
          : entry.direction === "bullish"
            ? MARKER_RADIUS + 6
            : 0;

      items.push({ entry, x, y: y + offset });
    }

    const chartHeight =
      (this._chart as unknown as { height?: () => number }).height?.() ?? 400;

    const { markers, spines } = resolveCollisions(items, chartHeight);
    this._resolvedMarkers = markers;
    this._renderer.setData(markers, spines);
    return this._renderer;
  }
}

/* ------------------------------------------------------------------ */
/*  Primitive (public API)                                             */
/* ------------------------------------------------------------------ */

export class EventMarkerPrimitive implements ISeriesPrimitive<Time> {
  private _paneView = new EventMarkerPaneView();
  private _entries: EventMarkerEntry[] = [];
  private _requestUpdate: (() => void) | null = null;

  readonly id = "event-markers";

  setEntries(entries: EventMarkerEntry[]) {
    this._entries = entries;
    this._paneView.setEntries(entries);
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
    // Coordinates recalculated each frame in renderer()
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const markers = this._paneView.getResolvedMarkers();
    for (const m of markers) {
      const dx = x - m.markerX;
      const dy = y - m.markerY;
      const r = m.entry.selected ? SELECTED_RADIUS : MARKER_RADIUS;
      if (dx * dx + dy * dy <= (r + 2) * (r + 2)) {
        return {
          cursorStyle: "pointer",
          externalId: m.entry.id,
          zOrder: "top",
        };
      }
    }
    return null;
  }
}
