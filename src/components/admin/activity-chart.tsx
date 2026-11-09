"use client";

import { useMemo, useRef, useState } from "react";

export type ActivityPoint = { day: string; total: number; edits: number; verifications: number };

const METRICS = [
  { key: "total", label: "Total actions", color: "#2a5ff9" },
  { key: "edits", label: "Edits", color: "#7c3aed" },
  { key: "verifications", label: "Verifications", color: "#0f9d58" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const WIDTH = 800;
const HEIGHT = 220;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate * 4 >= value) ?? value;
  return step * 4;
}

function formatDay(day: string, withYear = false) {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

/**
 * Search Console–style chart: metric cards that toggle series on and off,
 * and a line chart with a hover crosshair and tooltip.
 */
export function ActivityChart({ data, title }: { data: ActivityPoint[]; title?: string }) {
  const [enabled, setEnabled] = useState<Record<MetricKey, boolean>>({ total: true, edits: true, verifications: true });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const totals = useMemo(
    () => ({
      total: data.reduce((sum, point) => sum + point.total, 0),
      edits: data.reduce((sum, point) => sum + point.edits, 0),
      verifications: data.reduce((sum, point) => sum + point.verifications, 0),
    }),
    [data],
  );

  const activeMetrics = METRICS.filter((metric) => enabled[metric.key]);
  const maxValue = niceMax(Math.max(1, ...data.flatMap((point) => activeMetrics.map((metric) => point[metric.key]))));
  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (index: number) => PAD_LEFT + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (value: number) => PAD_TOP + innerHeight - (value / maxValue) * innerHeight;

  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || data.length === 0) return;
    const relative = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relative - PAD_LEFT) / innerWidth;
    const index = Math.round(Math.min(1, Math.max(0, ratio)) * (data.length - 1));
    setHoverIndex(index);
  }

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="rounded-xl border border-border bg-white">
      {title ? <h2 className="px-5 pt-5 text-base font-bold text-black">{title}</h2> : null}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-t-xl" role="group" aria-label="Metrics">
        {METRICS.map((metric) => {
          const on = enabled[metric.key];
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={on}
              onClick={() => setEnabled((current) => ({ ...current, [metric.key]: !current[metric.key] }))}
              className="px-5 py-4 text-left transition-colors"
              style={{ backgroundColor: on ? metric.color : "transparent", color: on ? "white" : undefined }}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[10px] leading-none"
                  style={{ borderColor: on ? "white" : metric.color, color: on ? metric.color : "transparent", backgroundColor: on ? "white" : "transparent" }}
                  aria-hidden="true"
                >
                  ✓
                </span>
                {metric.label}
              </span>
              <span className={`mt-1 block text-2xl font-semibold ${on ? "" : "text-black"}`}>
                {totals[metric.key].toLocaleString("en-IN")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative px-2 pb-3 pt-4 sm:px-4">
        {data.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No activity in this period.</p>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-56 w-full touch-none select-none"
            role="img"
            aria-label={`Activity chart: ${totals.total} actions, ${totals.edits} edits, ${totals.verifications} verifications`}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverIndex(null)}
            preserveAspectRatio="none"
          >
            {[0, 1, 2, 3, 4].map((step) => {
              const value = (maxValue / 4) * step;
              return (
                <g key={step}>
                  <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(value)} y2={y(value)} stroke="#e5e7eb" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <text x={PAD_LEFT - 6} y={y(value) + 4} textAnchor="end" fontSize={11} fill="#6b7280">
                    {Math.round(value)}
                  </text>
                </g>
              );
            })}
            {data.map((point, index) =>
              index % labelEvery === 0 || index === data.length - 1 ? (
                <text key={point.day} x={x(index)} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill="#6b7280">
                  {formatDay(point.day)}
                </text>
              ) : null,
            )}
            {activeMetrics.map((metric) => (
              <polyline
                key={metric.key}
                fill="none"
                stroke={metric.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                points={data.map((point, index) => `${x(index)},${y(point[metric.key])}`).join(" ")}
              />
            ))}
            {hoverIndex !== null ? (
              <g>
                <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD_TOP} y2={PAD_TOP + innerHeight} stroke="#9ca3af" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                {activeMetrics.map((metric) => (
                  <circle key={metric.key} cx={x(hoverIndex)} cy={y(data[hoverIndex][metric.key])} r={4} fill="white" stroke={metric.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            ) : null}
          </svg>
        )}

        {hovered && hoverIndex !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(x(hoverIndex) / WIDTH) * 100}%`,
              transform: hoverIndex > data.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <p className="mb-1 font-semibold text-black">{formatDay(hovered.day, true)}</p>
            {activeMetrics.map((metric) => (
              <p key={metric.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
                  {metric.label}
                </span>
                <span className="font-semibold text-black">{hovered[metric.key]}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Tiny inline trend line for table rows. */
export function Sparkline({ values, color = "#2a5ff9" }: { values: number[]; color?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${28 - (value / max) * 26}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-6 w-24" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" points={points} />
    </svg>
  );
}
