import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  SeriesType,
  IChartApiBase,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { TriggerAnnotation } from "@/lib/utils/trigger-annotations";

// ── Layout constants ─────────────────────────────────────────────────────────
const PILL_HEIGHT = 16;
const PILL_RADIUS = 6;
const PILL_PAD_X = 10;
const PILL_MIN_WIDTH = 48;
const SPINE_MARGIN = 6; // px from right edge of canvas
const MIN_LABEL_SPACING = PILL_HEIGHT + 4;

interface RenderTriggerAnnotation {
  annotation: TriggerAnnotation;
  /** X of the candle where the event occurred */
  x: number;
  /** Y of the price level */
  levelY: number;
  /** Y of the anchor price (candle close) */
  anchorY: number;
  /** De-collided Y for the spine pill */
  labelY: number;
}

function annotationColor(annotation: TriggerAnnotation): string {
  // Distinct from candle green/red so they don't blend
  if (annotation.direction === "bullish") return "rgb(56, 189, 248)"; // sky-400
  if (annotation.direction === "bearish") return "rgb(251, 113, 133)"; // rose-400
  return "rgb(251, 191, 36)"; // amber-400
}

/**
 * Spring de-collision: pushes label Ys apart until no two are closer than
 * MIN_LABEL_SPACING. Mutates in-place.
 */
function resolveCollisions(items: RenderTriggerAnnotation[]): void {
  if (items.length < 2) return;
  items.sort((a, b) => a.levelY - b.levelY);
  for (let iter = 0; iter < 80; iter++) {
    let settled = true;
    for (let i = 1; i < items.length; i++) {
      const gap = items[i].labelY - items[i - 1].labelY;
      if (gap < MIN_LABEL_SPACING) {
        const push = (MIN_LABEL_SPACING - gap) / 2;
        items[i - 1].labelY -= push;
        items[i].labelY += push;
        settled = false;
      }
    }
    if (settled) break;
  }
}

class TriggerAnnotationRenderer implements IPrimitivePaneRenderer {
  private _annotations: RenderTriggerAnnotation[] = [];

  setAnnotations(annotations: RenderTriggerAnnotation[]) {
    this._annotations = annotations;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._annotations.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();
      ctx.font = "600 10px sans-serif";
      ctx.textBaseline = "middle";

      const spineX = mediaSize.width - SPINE_MARGIN;

      for (const item of this._annotations) {
        const { annotation, x, levelY, anchorY, labelY } = item;
        const color = annotationColor(annotation);
        const isPrimary = annotation.primary;
        const segHalf = isPrimary ? 26 : 20;
        const lineDash = isPrimary ? [] : [4, 3];

        const pillText = annotation.label;
        const pillWidth = Math.max(
          PILL_MIN_WIDTH,
          ctx.measureText(pillText).width + PILL_PAD_X * 2,
        );
        const pillX = spineX - pillWidth;
        const pillTop = labelY - PILL_HEIGHT / 2;

        // ── Candle-site tick mark ─────────────────────────────────────────
        ctx.strokeStyle = color;
        ctx.lineWidth = isPrimary ? 2 : 1.5;
        ctx.setLineDash(lineDash);
        ctx.beginPath();
        ctx.moveTo(x - segHalf, levelY);
        ctx.lineTo(x + segHalf, levelY);
        ctx.stroke();

        // ── Vertical stem from tick to anchor ────────────────────────────
        ctx.beginPath();
        ctx.moveTo(x, levelY);
        ctx.lineTo(x, anchorY);
        ctx.stroke();

        ctx.setLineDash([]);

        // ── Dot at the level ──────────────────────────────────────────────
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, levelY, isPrimary ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();

        // ── Right-spine connector ─────────────────────────────────────────
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(spineX + SPINE_MARGIN, levelY);
        ctx.lineTo(spineX, levelY);
        if (Math.abs(labelY - levelY) > 1) {
          ctx.lineTo(spineX, labelY);
        }
        ctx.lineTo(pillX + pillWidth, labelY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // ── Pill ──────────────────────────────────────────────────────────
        ctx.fillStyle = "rgba(10, 10, 12, 0.92)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillTop, pillWidth, PILL_HEIGHT, PILL_RADIUS);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.fillText(pillText, pillX + PILL_PAD_X, labelY);
      }

      ctx.restore();
    });
  }
}

class TriggerAnnotationPaneView implements IPrimitivePaneView {
  private _renderer = new TriggerAnnotationRenderer();
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _annotations: TriggerAnnotation[] = [];

  setSeriesAndChart(
    series: ISeriesApi<SeriesType, Time>,
    chart: IChartApiBase<Time>,
  ) {
    this._series = series;
    this._chart = chart;
  }

  setAnnotations(annotations: TriggerAnnotation[]) {
    this._annotations = annotations;
  }

  // "normal" renders behind "top"-zOrder primitives (CalloutAnnotationPrimitive)
  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || !this._chart || this._annotations.length === 0) {
      this._renderer.setAnnotations([]);
      return this._renderer;
    }

    const timeScale = this._chart.timeScale();
    const renderable: RenderTriggerAnnotation[] = [];

    for (const annotation of this._annotations) {
      const x = timeScale.timeToCoordinate(annotation.time as unknown as Time);
      const levelY = this._series.priceToCoordinate(annotation.level);
      const anchorY = this._series.priceToCoordinate(annotation.anchorPrice);
      if (x === null || levelY === null || anchorY === null) continue;
      renderable.push({ annotation, x, levelY, anchorY, labelY: levelY });
    }

    resolveCollisions(renderable);

    this._renderer.setAnnotations(renderable);
    return this._renderer;
  }
}

export class TriggerAnnotationPrimitive implements ISeriesPrimitive<Time> {
  private _paneView = new TriggerAnnotationPaneView();
  private _annotations: TriggerAnnotation[];
  private _requestUpdate: (() => void) | null = null;
  private _visible = true;

  constructor(annotations: TriggerAnnotation[]) {
    this._annotations = annotations;
    this._paneView.setAnnotations(annotations);
  }

  setVisible(visible: boolean) {
    this._visible = visible;
    this._requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._requestUpdate = param.requestUpdate;
    this._paneView.setSeriesAndChart(param.series, param.chart);
    this._paneView.setAnnotations(this._annotations);
  }

  detached() {
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this._visible || this._annotations.length === 0) return [];
    return [this._paneView];
  }
}
