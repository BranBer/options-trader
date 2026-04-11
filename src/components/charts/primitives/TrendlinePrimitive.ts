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

export interface TrendlineOptions {
  startTime: Time;
  endTime: Time;
  startPrice: number;
  endPrice: number;
  /** For channels: the secondary boundary */
  secondaryStartPrice?: number;
  secondaryEndPrice?: number;
  color: string;
  fillColor?: string;
  lineWidth?: number;
  label?: string;
  id: string;
}

class TrendlinePaneRenderer implements IPrimitivePaneRenderer {
  private _points: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    sx1?: number;
    sy1?: number;
    sx2?: number;
    sy2?: number;
  } | null = null;
  private _options: TrendlineOptions;

  constructor(options: TrendlineOptions) {
    this._options = options;
  }

  setPoints(points: typeof this._points) {
    this._points = points;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._points) return;
    const { x1, y1, x2, y2, sx1, sy1, sx2, sy2 } = this._points;
    const { color, fillColor, lineWidth = 2, label } = this._options;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // Draw primary trendline
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw channel (secondary line + fill) if secondary points exist
      if (
        sx1 !== undefined &&
        sy1 !== undefined &&
        sx2 !== undefined &&
        sy2 !== undefined
      ) {
        // Secondary line
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();

        // Fill between the two lines
        const fill =
          fillColor ?? color.replace(")", ", 0.1)").replace("rgb(", "rgba(");
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(sx2, sy2);
        ctx.lineTo(sx1, sy1);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    });
  }
}

class TrendlinePaneView implements IPrimitivePaneView {
  private _renderer: TrendlinePaneRenderer;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _options: TrendlineOptions;

  constructor(options: TrendlineOptions) {
    this._options = options;
    this._renderer = new TrendlinePaneRenderer(options);
  }

  setSeriesAndChart(
    series: ISeriesApi<SeriesType, Time>,
    chart: IChartApiBase<Time>,
  ) {
    this._series = series;
    this._chart = chart;
  }

  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || !this._chart) return null;

    const timeScale = this._chart.timeScale();
    const x1 = timeScale.timeToCoordinate(this._options.startTime);
    const x2 = timeScale.timeToCoordinate(this._options.endTime);
    const y1 = this._series.priceToCoordinate(this._options.startPrice);
    const y2 = this._series.priceToCoordinate(this._options.endPrice);

    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      this._renderer.setPoints(null);
      return this._renderer;
    }

    let sx1: number | undefined;
    let sy1: number | undefined;
    let sx2: number | undefined;
    let sy2: number | undefined;

    if (
      this._options.secondaryStartPrice !== undefined &&
      this._options.secondaryEndPrice !== undefined
    ) {
      sy1 =
        this._series.priceToCoordinate(this._options.secondaryStartPrice) ??
        undefined;
      sy2 =
        this._series.priceToCoordinate(this._options.secondaryEndPrice) ??
        undefined;
      if (sy1 !== undefined && sy2 !== undefined) {
        sx1 = x1;
        sx2 = x2;
      }
    }

    this._renderer.setPoints({ x1, y1, x2, y2, sx1, sy1, sx2, sy2 });
    return this._renderer;
  }
}

export class TrendlinePrimitive implements ISeriesPrimitive<Time> {
  private _paneView: TrendlinePaneView;
  private _options: TrendlineOptions;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _chart: IChartApiBase<Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _visible = true;

  constructor(options: TrendlineOptions) {
    this._options = options;
    this._paneView = new TrendlinePaneView(options);
  }

  get id() {
    return this._options.id;
  }

  get visible() {
    return this._visible;
  }

  setVisible(visible: boolean) {
    this._visible = visible;
    this._requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._series = param.series;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    this._paneView.setSeriesAndChart(param.series, param.chart);
  }

  detached() {
    this._series = null;
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews() {
    // Views are recalculated in renderer() via coordinate conversion
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this._visible) return [];
    return [this._paneView];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._visible || !this._series || !this._chart) return null;

    const timeScale = this._chart.timeScale();
    const x1 = timeScale.timeToCoordinate(this._options.startTime);
    const x2 = timeScale.timeToCoordinate(this._options.endTime);
    const y1 = this._series.priceToCoordinate(this._options.startPrice);
    const y2 = this._series.priceToCoordinate(this._options.endPrice);

    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;

    // Distance from point to line segment
    const dist = pointToSegmentDistance(x, y, x1, y1, x2, y2);
    if (dist < 8) {
      return {
        cursorStyle: "pointer",
        externalId: this._options.id,
        zOrder: "normal",
      };
    }

    return null;
  }
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
