import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Point {
  t: string;
  v: number | null;
}

export function Sparkline({
  points,
  height = 80,
  yLabel,
  color = "#7aa2ff",
}: {
  points: Point[];
  height?: number;
  yLabel?: string;
  color?: string;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#161a22", border: "1px solid #262c39" }}
            labelStyle={{ color: "#8b94a8" }}
            formatter={(v) => [String(v), yLabel ?? "value"]}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
