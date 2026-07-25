import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  t: string;
  v: number | null;
}

const AXIS_INK = "#8b94a8";
const GRID_INK = "#262c39";

// Sample timestamps are ISO-8601 UTC; ticks stay in UTC so the axis matches
// the values the backend recorded regardless of the viewer's timezone.
const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : CLOCK.format(d);
}

function defaultFormatValue(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toPrecision(3);
  return String(Math.round(v * 100) / 100);
}

export function Sparkline({
  points,
  height = 120,
  yLabel,
  color = "#7aa2ff",
  formatValue = defaultFormatValue,
}: {
  points: Point[];
  height?: number;
  yLabel?: string;
  color?: string;
  /** Formats y-axis ticks and the tooltip value (e.g. bytes → "1.2 MiB"). */
  formatValue?: (v: number) => string;
}) {
  const tick = { fill: AXIS_INK, fontSize: 10 };
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID_INK} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="t"
            tick={tick}
            tickFormatter={formatClock}
            stroke={GRID_INK}
            tickLine={false}
            minTickGap={44}
            interval="preserveStartEnd"
            height={18}
          />
          <YAxis
            tick={tick}
            tickFormatter={formatValue}
            stroke={GRID_INK}
            tickLine={false}
            tickCount={4}
            width={56}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "#161a22", border: "1px solid #262c39" }}
            labelStyle={{ color: AXIS_INK }}
            cursor={{ stroke: AXIS_INK, strokeDasharray: "2 4" }}
            labelFormatter={(t) => `${formatClock(String(t))} UTC`}
            formatter={(v) => [formatValue(Number(v)), yLabel ?? "value"]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
