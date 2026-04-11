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

export interface HighlightRegionOptions {
  startTime: Time;
  endTime: Time;
  color: string;
  label?: string;
  id: string;
}

class HighlightRegionRenderer implements IPrimitivePaneRenderer {
  private _points: { x1: number; x2: number; height: number } | null = null;
  private _options: HighlightRegionOptions;

  constructor(options: HighlightRegionOptions) {
    this._options = options;
  }

  setPoints(points: typeof this._points) {
    this._points = points;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (!this._points) return;
    const { x1, x2, height } = this._points;
    const { color, label } = this._options;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // Draw highlighted region
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x1, 0, x2 - x1, height);
      ctx.globalAlpha = 1;

      // Vertical border lines
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, height);
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, height);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();
    });
  }

  draw(): void {
    // Main drawing is in drawBackground so it renders behind candles
  }
}

class HighlightRegionPaneView implements IPrimitivePaneView {
  private _renderer: HighlightRegionRenderer;
  private _chart: IChartApiBase<Time> | null = null;
  private _options: HighlightRegionOptions;

  constructor(options: HighlightRegionOptions) {
    this._options = options;
    this._renderer = new HighlightRegionRenderer(options);
  }

  setChart(chart: IChartApiBase<Time>) {
    this._chart = chart;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._chart) return null;

    const timeScale = this._chart.timeScale();
    const x1 = timeScale.timeToCoordinate(this._options.startTime);
    const x2 = timeScale.timeToCoordinate(this._options.endTime);

    if (x1 === null || x2 === null) {
      this._renderer.setPoints(null);
      return this._renderer;
    }

    // Use a large height — the canvas clip will handle bounds
    this._renderer.setPoints({ x1, x2, height: 2000 });
    return this._renderer;
  }
}

export class HighlightRegionPrimitive implements ISeriesPrimitive<Time> {
  private _paneView: HighlightRegionPaneView;
  private _options: HighlightRegionOptions;
  private _chart: IChartApiBase<Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _visible = true;

  constructor(options: HighlightRegionOptions) {
    this._options = options;
    this._paneView = new HighlightRegionPaneView(options);
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
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    this._paneView.setChart(param.chart);
  }

  detached() {
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this._visible) return [];
    return [this._paneView];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._visible || !this._chart) return null;

    const timeScale = this._chart.timeScale();
    const x1 = timeScale.timeToCoordinate(this._options.startTime);
    const x2 = timeScale.timeToCoordinate(this._options.endTime);

    if (x1 === null || x2 === null) return null;

    if (x >= Math.min(x1, x2) && x <= Math.max(x1, x2)) {
      return {
        cursorStyle: "pointer",
        externalId: this._options.id,
        zOrder: "bottom",
      };
    }

    return null;
  }
}
