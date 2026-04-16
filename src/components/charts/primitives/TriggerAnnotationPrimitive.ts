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

interface RenderTriggerAnnotation {
  annotation: TriggerAnnotation;
  x: number;
  levelY: number;
  anchorY: number;
  labelY: number;
}

function annotationColor(annotation: TriggerAnnotation): string {
  if (annotation.direction === "bullish") return "rgb(34, 197, 94)";
  if (annotation.direction === "bearish") return "rgb(239, 68, 68)";
  return "rgb(245, 158, 11)";
}

class TriggerAnnotationRenderer implements IPrimitivePaneRenderer {
  private _annotations: RenderTriggerAnnotation[] = [];

  setAnnotations(annotations: RenderTriggerAnnotation[]) {
    this._annotations = annotations;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._annotations.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();
      ctx.font = "600 10px sans-serif";
      ctx.textBaseline = "middle";

      for (const item of this._annotations) {
        const { annotation, x, levelY, anchorY, labelY } = item;
        const color = annotationColor(annotation);
        const segmentHalfWidth = annotation.primary ? 26 : 20;
        const lineDash = annotation.primary ? [] : [4, 3];
        const pillText = annotation.label;
        const pillWidth = Math.max(44, ctx.measureText(pillText).width + 12);
        const pillHeight = 16;
        const pillX = x - pillWidth / 2;
        const pillTop = labelY - pillHeight / 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = annotation.primary ? 2 : 1.5;
        ctx.setLineDash(lineDash);

        ctx.beginPath();
        ctx.moveTo(x - segmentHalfWidth, levelY);
        ctx.lineTo(x + segmentHalfWidth, levelY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, levelY);
        ctx.lineTo(x, anchorY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, levelY, annotation.primary ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(10, 10, 12, 0.9)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(pillX, pillTop, pillWidth, pillHeight, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.fillText(pillText, pillX + 6, labelY);
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

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || !this._chart || this._annotations.length === 0) {
      this._renderer.setAnnotations([]);
      return this._renderer;
    }

    const timeScale = this._chart.timeScale();
    const sorted = [...this._annotations].sort((a, b) =>
      a.time === b.time ? a.level - b.level : a.time - b.time,
    );
    const renderable: RenderTriggerAnnotation[] = [];
    let prevX: number | null = null;
    let stackedCount = 0;

    for (const annotation of sorted) {
      const x = timeScale.timeToCoordinate(annotation.time as unknown as Time);
      const levelY = this._series.priceToCoordinate(annotation.level);
      const anchorY = this._series.priceToCoordinate(annotation.anchorPrice);

      if (x === null || levelY === null || anchorY === null) continue;

      if (prevX !== null && Math.abs(x - prevX) < 28) {
        stackedCount += 1;
      } else {
        stackedCount = 0;
      }
      prevX = x;

      const labelOffset = annotation.direction === "bearish" ? -24 : 24;
      const stackOffset =
        stackedCount * 18 * (annotation.direction === "bearish" ? -1 : 1);

      renderable.push({
        annotation,
        x,
        levelY,
        anchorY,
        labelY: levelY + labelOffset + stackOffset,
      });
    }

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
