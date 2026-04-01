"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { LinePath, AreaClosed } from "@visx/shape";
import { scaleTime, scaleLinear } from "@visx/scale";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { curveNatural } from "@visx/curve";
import { Tooltip, useTooltip, defaultStyles } from "@visx/tooltip";
import { localPoint } from "@visx/event";

interface DataPoint {
  date: Date;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  formatValue?: (value: number) => string;
  lineColor?: string;
  fillColor?: string;
  minRangeDays?: number;
}

type TimeRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y";

type RangeOption = {
  key: TimeRange;
  label: string;
  days: number;
  disabled: boolean;
};

const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
  { key: "1D", label: "1D", days: 1 },
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "5Y", label: "5Y", days: 365 * 5 },
];

function filterByRange(data: DataPoint[], range: TimeRange): DataPoint[] {
  if (data.length === 0) return data;

  const rangeConfig = TIME_RANGES.find((r) => r.key === range);
  if (!rangeConfig) return data;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeConfig.days);

  return data.filter((d) => d.date >= cutoff);
}

function getRangeWindow(range: TimeRange, data: DataPoint[]): [Date, Date] {
  if (data.length === 0) {
    const now = new Date();
    return [new Date(now.getTime() - 24 * 60 * 60 * 1000), now];
  }

  const latest = data[data.length - 1].date;
  const rangeConfig = TIME_RANGES.find((r) => r.key === range);
  const days = rangeConfig?.days ?? 1;
  const earliest = new Date(latest.getTime() - days * 24 * 60 * 60 * 1000);

  return [earliest, latest];
}

function getAvailableRangeDays(data: DataPoint[]): number {
  if (data.length < 2) return 0;
  const first = data[0].date.getTime();
  const last = data[data.length - 1].date.getTime();
  return Math.max(0, (last - first) / (1000 * 60 * 60 * 24));
}

function getDefaultRange(data: DataPoint[]): TimeRange {
  if (data.length === 0) return "1D";

  const availableDays = getAvailableRangeDays(data);
  if (availableDays >= 365 * 5) return "5Y";
  if (availableDays >= 365) return "1Y";
  if (availableDays >= 180) return "6M";
  if (availableDays >= 30) return "1M";
  if (availableDays >= 7) return "1W";
  return "1D";
}

function normalizeDataForRange(
  data: DataPoint[],
  range: TimeRange,
): DataPoint[] {
  if (data.length === 0) return data;

  if (range !== "1D" || data.length === 1) return data;

  const first = data[0].date;
  const last = data[data.length - 1].date;
  const firstHasTime =
    first.getHours() !== 0 ||
    first.getMinutes() !== 0 ||
    first.getSeconds() !== 0;
  const lastHasTime =
    last.getHours() !== 0 || last.getMinutes() !== 0 || last.getSeconds() !== 0;

  if (firstHasTime || lastHasTime) return data;

  const allSameDay = data.every(
    (point) =>
      point.date.getFullYear() === first.getFullYear() &&
      point.date.getMonth() === first.getMonth() &&
      point.date.getDate() === first.getDate(),
  );

  if (!allSameDay) return data;

  const start = new Date(first);
  start.setHours(9, 30, 0, 0);
  const end = new Date(first);
  end.setHours(16, 0, 0, 0);

  const span = Math.max(1, data.length - 1);

  return data.map((point, index) => {
    const timestamp =
      span === 1
        ? start.getTime()
        : start.getTime() + (index / span) * (end.getTime() - start.getTime());

    return {
      ...point,
      date: new Date(timestamp),
    };
  });
}

function ChartInner({
  data,
  width,
  height,
  formatValue,
  lineColor,
  fillColor,
  timeRange,
  useRecordIndexAxis,
}: {
  data: DataPoint[];
  width: number;
  height: number;
  formatValue: (v: number) => string;
  lineColor: string;
  fillColor: string;
  timeRange: TimeRange;
  useRecordIndexAxis: boolean;
}) {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } =
    useTooltip<DataPoint>();

  const margin = { top: 16, right: 16, bottom: 40, left: 64 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(() => {
    if (useRecordIndexAxis) {
      return scaleLinear({
        domain: [0, Math.max(1, data.length - 1)],
        range: [0, innerWidth],
      });
    }

    const [domainStart, domainEnd] = getRangeWindow(timeRange, data);
    return scaleTime({
      domain: [domainStart, domainEnd],
      range: [0, innerWidth],
    });
  }, [data, innerWidth, timeRange, useRecordIndexAxis]);

  const yScale = useMemo(() => {
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || max * 0.1 || 1;
    return scaleLinear({
      domain: [min - padding, max + padding],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [data, innerHeight]);

  const handleTooltip = useCallback(
    (
      event:
        | React.TouchEvent<SVGRectElement>
        | React.MouseEvent<SVGRectElement>,
    ) => {
      const point = localPoint(event);
      if (!point) return;

      const x = point.x - margin.left;
      const y = point.y - margin.top;
      const clampedX = Math.max(0, Math.min(x, innerWidth));
      const x0 = useRecordIndexAxis ? clampedX : xScale.invert(clampedX);
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      data.forEach((d, i) => {
        const xPosition = useRecordIndexAxis ? xScale(i) : xScale(d.date);
        const dx = Math.abs(xPosition - x);
        const dy = Math.abs(yScale(d.value) - y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      });

      const withinHoverRadius = nearestDistance <= 24;
      const exactIndex = useRecordIndexAxis
        ? Math.round(x0)
        : data.findIndex((d) => d.date >= x0);
      const d = withinHoverRadius
        ? data[nearestIndex]
        : data[Math.max(0, exactIndex >= 0 ? exactIndex : data.length - 1)];
      if (d) {
        showTooltip({
          tooltipData: d,
          tooltipLeft:
            (useRecordIndexAxis ? xScale(nearestIndex) : xScale(d.date)) +
            margin.left,
          tooltipTop: yScale(d.value) + margin.top,
        });
      }
    },
    [
      data,
      xScale,
      yScale,
      margin.left,
      margin.top,
      innerWidth,
      showTooltip,
      useRecordIndexAxis,
    ],
  );

  const hoverRadius = Math.max(
    12,
    Math.min(innerWidth / Math.max(data.length, 1), 24),
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm h-full">
        No data available
      </div>
    );
  }

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* Grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            strokeDasharray="3,3"
            stroke="#27272a"
            strokeOpacity={0.5}
          />

          {/* Y-axis */}
          <AxisLeft
            scale={yScale}
            tickFormat={(v) => formatValue(v as number)}
            stroke="#3f3f46"
            tickStroke="#3f3f46"
            tickLabelProps={() => ({
              fill: "#a1a1aa",
              fontSize: 11,
              fontFamily: "monospace",
              textAnchor: "end",
              dy: "0.33em",
            })}
          />

          {/* X-axis */}
          {useRecordIndexAxis ? (
            <AxisBottom
              scale={xScale}
              top={innerHeight}
              stroke="#3f3f46"
              tickStroke="#3f3f46"
              tickFormat={(v) => `#${Number(v) + 1}`}
              tickValues={
                data.length <= 6
                  ? data.map((_, index) => index)
                  : [0, Math.floor(data.length / 2), data.length - 1]
              }
              tickLabelProps={() => ({
                fill: "#a1a1aa",
                fontSize: 11,
                fontFamily: "monospace",
                textAnchor: "middle",
              })}
            />
          ) : (
            <AxisBottom
              scale={xScale}
              top={innerHeight}
              stroke="#3f3f46"
              tickStroke="#3f3f46"
              tickFormat={(v) => {
                const d = v as Date;
                return d.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              tickLabelProps={() => ({
                fill: "#a1a1aa",
                fontSize: 11,
                fontFamily: "monospace",
                textAnchor: "middle",
              })}
            />
          )}

          {/* Filled area */}
          <AreaClosed
            data={data}
            x={(d, index) =>
              (useRecordIndexAxis ? xScale(index) : xScale(d.date)) ?? 0
            }
            y={(d) => yScale(d.value) ?? 0}
            yScale={yScale}
            curve={curveNatural}
            fill={fillColor}
          />

          {/* Line */}
          <LinePath
            data={data}
            x={(d, index) =>
              (useRecordIndexAxis ? xScale(index) : xScale(d.date)) ?? 0
            }
            y={(d) => yScale(d.value) ?? 0}
            curve={curveNatural}
            stroke={lineColor}
            strokeWidth={2}
          />

          {data.map((d, i) => (
            <circle
              key={i}
              cx={useRecordIndexAxis ? xScale(i) : xScale(d.date)}
              cy={yScale(d.value)}
              r={hoverRadius}
              fill="transparent"
              stroke="transparent"
            />
          ))}

          {/* Tooltip trigger area */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={() => hideTooltip()}
          />

          {/* Tooltip crosshair */}
          {tooltipData && (
            <>
              <line
                x1={
                  useRecordIndexAxis
                    ? xScale(
                        data.findIndex((d) => d.value === tooltipData.value),
                      )
                    : xScale(tooltipData.date)
                }
                x2={
                  useRecordIndexAxis
                    ? xScale(
                        data.findIndex((d) => d.value === tooltipData.value),
                      )
                    : xScale(tooltipData.date)
                }
                y1={0}
                y2={innerHeight}
                stroke="#a1a1aa"
                strokeDasharray="4,4"
                strokeWidth={1}
              />
              <circle
                cx={
                  useRecordIndexAxis
                    ? xScale(
                        data.findIndex((d) => d.value === tooltipData.value),
                      )
                    : xScale(tooltipData.date)
                }
                cy={yScale(tooltipData.value)}
                r={4}
                fill={lineColor}
                stroke="#18181b"
                strokeWidth={2}
              />
            </>
          )}
        </Group>
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <Tooltip
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            background: "#27272a",
            border: "1px solid #3f3f46",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#fafafa",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {tooltipData.date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="font-bold">{formatValue(tooltipData.value)}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export default function LineChart({
  data,
  formatValue = (v) => `$${v.toLocaleString()}`,
  lineColor = "#22c55e",
  fillColor = "rgba(34, 197, 94, 0.1)",
  minRangeDays = 1,
}: LineChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("1D");
  const availableDays = useMemo(() => getAvailableRangeDays(data), [data]);

  const enabledRanges = useMemo<RangeOption[]>(() => {
    return TIME_RANGES.map((range) => ({
      ...range,
      disabled: availableDays < Math.max(range.days, minRangeDays),
    }));
  }, [availableDays, minRangeDays]);

  const defaultRange = useMemo(() => getDefaultRange(data), [data]);

  useEffect(() => {
    const selectedIsDisabled = enabledRanges.some(
      (r) => r.key === selectedRange && r.disabled,
    );
    if (selectedIsDisabled && selectedRange !== defaultRange) {
      setSelectedRange(defaultRange);
    }
  }, [defaultRange, enabledRanges, selectedRange]);

  const effectiveRange = enabledRanges.some(
    (r) => r.key === selectedRange && !r.disabled,
  )
    ? selectedRange
    : defaultRange;

  const filteredData = useMemo(
    () =>
      normalizeDataForRange(
        filterByRange(data, effectiveRange),
        effectiveRange,
      ),
    [data, effectiveRange],
  );

  return (
    <div className="space-y-3">
      {/* Time range selectors */}
      <div
        className="flex flex-wrap items-center gap-1"
        role="tablist"
        aria-label="Equity curve time ranges"
      >
        {enabledRanges.map((range) => (
          <button
            key={range.key}
            onClick={() => !range.disabled && setSelectedRange(range.key)}
            disabled={range.disabled}
            aria-pressed={effectiveRange === range.key}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              effectiveRange === range.key
                ? "bg-primary text-primary-foreground"
                : range.disabled
                  ? "text-muted-foreground/40 cursor-not-allowed bg-muted/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="w-full h-[220px]">
        <ParentSize>
          {({ width, height }) => (
            <ChartInner
              data={filteredData}
              width={width}
              height={height}
              formatValue={formatValue}
              lineColor={lineColor}
              fillColor={fillColor}
              timeRange={effectiveRange}
              useRecordIndexAxis={effectiveRange === "1D"}
            />
          )}
        </ParentSize>
      </div>
    </div>
  );
}
