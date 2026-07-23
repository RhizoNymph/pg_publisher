import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
export function Sparkline({ points, height = 80, yLabel, color = "#7aa2ff", }) {
    return (_jsx("div", { style: { width: "100%", height }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { data: points, margin: { top: 4, right: 8, left: 8, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "t", hide: true }), _jsx(YAxis, { hide: true, domain: ["auto", "auto"] }), _jsx(Tooltip, { contentStyle: { background: "#161a22", border: "1px solid #262c39" }, labelStyle: { color: "#8b94a8" }, formatter: (v) => [String(v), yLabel ?? "value"] }), _jsx(Line, { type: "monotone", dataKey: "v", stroke: color, strokeWidth: 1.5, dot: false, isAnimationActive: false, connectNulls: true })] }) }) }));
}
