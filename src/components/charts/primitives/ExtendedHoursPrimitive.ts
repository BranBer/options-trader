/**
 * ExtendedHoursPrimitive
 *
 * Draws on the chart background:
 *  - Story 3.1: Faint shading behind pre-market and after-hours candle bands
 *  - Story 3.2: Thin vertical dotted lines + "Open" / "Close" labels at
 *               9:30 AM and 4:00 PM ET session boundaries
 *
 * Works with both intraday (unix-second) candle timestamps.
 * Pass `candles` with their `session` metadata (from market-pulse-candles or
 * tagged manually) so the primitive can derive band X-ranges from the chart's
 * time scale without hard-coding pixel positions.
 */
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

// ── ET boundary detection helpers ────────────────────────────────────────────
const ET_TIMEZONE = "America/New_York";

type Session = "pre" | "regular" | "post" | "outside";

function getSession(unixSec: number): Session {
  const d = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  const totalMinutes = hour * 60 + minute;
  if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) return "pre";
  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) return "regular";
  if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) return "post";
  return "outside";
}

// ── Color palette (subtle, not distracting) ──────────────────────────────────
const PRE_COLOR = "rgba(139, 92, 246, 0.06)"; // violet tint for pre-market
const POST_COLOR = "rgba(251, 191, 36, 0.05)"; // amber tint for after-hours
const BOUNDARY_COLOR = "rgba(148, 163, 184, 0.35)"; // slate-400 at low opacity
const LABEL_COLOR = "rgba(148, 163, 184, 0.6)";

// ── Band and boundary data ────────────────────────────────────────────────────
interface Band {
  session: "pre" | "post";
  /** unix-second timestamps bounding the visible band */
  startTime: number;
  endTime: number;
}

interface Boundary {
  time: number; // unix-second timestamp of the boundary candle
  label: "Open" | "Close";
}

// ── Renderer ─────────────────────────────────────────────────────────────────
class ExtendedHoursRenderer implements IPrimitivePaneRenderer {
  private _bands: Band[] = [];
  private _boundaries: Boundary[] = [];
  private _chart: IChartApiBase<Time> | null = null;

  update(bands: Band[], boundaries: Boundary[], chart: IChartApiBase<Time>) {
    this._bands = bands;
    this._boundaries = boundaries;
    this._chart = chart;
  }

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (
      !this._chart ||
      (this._bands.length === 0 && this._boundaries.length === 0)
    )
      return;
    const timeScale = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.save();

      // ── 3.1 Shaded bands ──────────────────────────────────────────────────
      for (const band of this._bands) {
        const x1 = timeScale.timeToCoordinate(
          band.startTime as unknown as Time,
        );
        const x2 = timeScale.timeToCoordinate(band.endTime as unknown as Time);
        if (x1 === null || x2 === null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        ctx.fillStyle = band.session === "pre" ? PRE_COLOR : POST_COLOR;
        ctx.fillRect(left, 0, right - left, mediaSize.height);
      }

      // ── 3.2 Boundary lines + labels ───────────────────────────────────────
      ctx.font = "500 9px sans-serif";
      ctx.textBaseline = "top";
      for (const boundary of this._boundaries) {
        const x = timeScale.timeToCoordinate(boundary.time as unknown as Time);
        if (x === null) continue;

        // Dotted vertical line
        ctx.strokeStyle = BOUNDARY_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mediaSize.height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label pill
        const labelText = boundary.label;
        const textWidth = ctx.measureText(labelText).width;
        const padX = 4;
        const padY = 2;
        const pillW = textWidth + padX * 2;
        const pillH = 13;
        const pillY = 4;
        const pillX = x + 3;

        ctx.fillStyle = "rgba(10, 10, 14, 0.75)";
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 3);
        ctx.fill();

        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(labelText, pillX + padX, pillY + padY);
      }

      ctx.restore();
    });
  }

  draw(_target: CanvasRenderingTarget2D): void {
    // all drawing is in drawBackground so it stays behind candles
  }
}

// ── Pane view ────────────────────────────────────────────────────────────────
class ExtendedHoursPaneView implements IPrimitivePaneView {
  private _renderer = new ExtendedHoursRenderer();
  private _chart: IChartApiBase<Time> | null = null;
  private _candles: { time: number; session?: Session }[] = [];

  setChart(chart: IChartApiBase<Time>) {
    this._chart = chart;
  }

  setCandles(candles: { time: number; session?: Session }[]) {
    this._candles = candles;
  }

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): ExtendedHoursRenderer {
    if (!this._chart || this._candles.length === 0) {
      this._renderer.update([], [], this._chart!);
      return this._renderer;
    }

    // Derive session for any candle that doesn't already have it tagged
    const tagged = this._candles.map((c) => ({
      time: c.time,
      session: c.session ?? getSession(c.time),
    }));

    // Build contiguous bands of the same extended session
    const bands: Band[] = [];
    let bandStart: number | null = null;
    let bandSession: "pre" | "post" | null = null;
    let prevTime: number | null = null;

    for (const c of tagged) {
      const isExtended = c.session === "pre" || c.session === "post";
      if (isExtended) {
        if (bandSession !== c.session) {
          // Flush previous band
          if (bandStart !== null && prevTime !== null && bandSession !== null) {
            bands.push({
              session: bandSession,
              startTime: bandStart,
              endTime: prevTime,
            });
          }
          bandStart = c.time;
          bandSession = c.session as "pre" | "post";
        }
      } else {
        // Flush on transition out of extended session
        if (bandStart !== null && prevTime !== null && bandSession !== null) {
          bands.push({
            session: bandSession,
            startTime: bandStart,
            endTime: prevTime,
          });
          bandStart = null;
          bandSession = null;
        }
      }
      prevTime = c.time;
    }
    // Flush last band
    if (bandStart !== null && prevTime !== null && bandSession !== null) {
      bands.push({
        session: bandSession,
        startTime: bandStart,
        endTime: prevTime,
      });
    }

    // Derive boundary markers: first candle with session "regular" after pre → "Open"
    // first candle with session "post" after regular → "Close"
    const boundaries: Boundary[] = [];
    for (let i = 1; i < tagged.length; i++) {
      const prev = tagged[i - 1];
      const curr = tagged[i];
      if (prev.session !== "regular" && curr.session === "regular") {
        boundaries.push({ time: curr.time, label: "Open" });
      } else if (
        prev.session === "regular" &&
        curr.session !== "regular" &&
        curr.session !== "outside"
      ) {
        boundaries.push({ time: curr.time, label: "Close" });
      }
    }

    this._renderer.update(bands, boundaries, this._chart!);
    return this._renderer;
  }
}

// ── Public primitive ──────────────────────────────────────────────────────────
export class ExtendedHoursPrimitive implements ISeriesPrimitive<Time> {
  private _paneView = new ExtendedHoursPaneView();
  private _candles: { time: number; session?: Session }[];
  private _requestUpdate: (() => void) | null = null;

  constructor(candles: { time: number; session?: Session }[]) {
    this._candles = candles;
    this._paneView.setCandles(candles);
  }

  updateCandles(candles: { time: number; session?: Session }[]) {
    this._candles = candles;
    this._paneView.setCandles(candles);
    this._requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._requestUpdate = param.requestUpdate;
    this._paneView.setChart(param.chart);
    this._paneView.setCandles(this._candles);
  }

  detached() {
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}
