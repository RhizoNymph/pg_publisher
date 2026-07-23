import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHistory, getSnapshot } from "../lib/api";
import { liveSocket } from "../lib/ws";
import { Sparkline } from "../components/Sparkline";
import { formatBytes } from "../lib/topology";
// srsubstate codes from pg_subscription_rel.
const REL_STATES = {
    i: { label: "initializing", className: "lag-warn" },
    d: { label: "copying data", className: "lag-warn" },
    f: { label: "finished copy", className: "lag-warn" },
    s: { label: "synchronized", className: "lag-ok" },
    r: { label: "ready", className: "lag-ok" },
};
function SubscriptionTables({ rels }) {
    const ready = rels.filter((r) => r.state === "r").length;
    return (_jsxs("div", { style: { padding: 8 }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 4 }, children: ["Tables (", ready, "/", rels.length, " ready)"] }), rels.length === 0 ? (_jsx("div", { style: { fontSize: 12, color: "var(--muted)" }, children: "No tables tracked by this subscription." })) : (_jsx("div", { className: "kv", children: rels.map((r) => {
                    const st = REL_STATES[r.state] ?? { label: r.state, className: "" };
                    return (_jsxs(Fragment, { children: [_jsxs("span", { className: "k", style: { overflowWrap: "anywhere" }, children: [r.schema_name, ".", r.table_name] }), _jsx("span", { className: st.className, children: st.label })] }, `${r.schema_name}.${r.table_name}`));
                }) }))] }));
}
export function MetricsPanel({ selected }) {
    const [live, setLive] = useState([]);
    const history = useQuery({
        queryKey: ["history", selected?.connectionId, selected?.kind, selected?.name],
        queryFn: () => selected
            ? getHistory(selected.connectionId, 15, selected.kind, selected.name)
            : Promise.resolve([]),
        enabled: !!selected,
    });
    // Same key/interval as Topology's snapshot queries so the cache is shared.
    const snapshot = useQuery({
        queryKey: ["snapshot", selected?.connectionId],
        queryFn: () => getSnapshot(selected.connectionId),
        enabled: !!selected && selected.kind === "subscription",
        refetchInterval: 5000,
        retry: false,
    });
    useEffect(() => {
        setLive([]);
        if (!selected)
            return;
        const off = liveSocket.onSample((p) => {
            if (p.connection_id !== selected.connectionId)
                return;
            const ours = p.samples.filter((s) => s.stream_kind === selected.kind && s.stream_name === selected.name);
            if (ours.length === 0)
                return;
            setLive((prev) => [...prev, ...ours].slice(-600));
        });
        return off;
    }, [selected]);
    if (!selected) {
        return (_jsx("div", { className: "detail", children: _jsx("div", { className: "empty", children: "Click a publication or subscription to inspect." }) }));
    }
    const series = [...(history.data ?? []), ...live];
    const bytesPoints = series.map((s) => ({
        t: s.sampled_at,
        v: s.lag_bytes ?? null,
    }));
    const secondsPoints = series.map((s) => ({
        t: s.sampled_at,
        v: s.lag_seconds ?? null,
    }));
    const last = series[series.length - 1];
    const rels = selected.kind === "subscription"
        ? (snapshot.data?.subscription_rels ?? []).filter((r) => r.subscription === selected.name)
        : null;
    return (_jsxs("div", { className: "detail", children: [_jsxs("div", { className: "section-title", children: [selected.kind, " \u00B7 ", selected.name] }), _jsxs("div", { className: "kv", style: { padding: 8 }, children: [_jsx("span", { className: "k", children: "Lag (bytes)" }), _jsx("span", { children: last?.lag_bytes != null ? formatBytes(last.lag_bytes) : "—" }), _jsx("span", { className: "k", children: "Lag (seconds)" }), _jsx("span", { children: last?.lag_seconds != null ? last.lag_seconds.toFixed(3) : "—" }), _jsx("span", { className: "k", children: "State" }), _jsx("span", { children: last?.state ?? "—" }), _jsx("span", { className: "k", children: "Samples" }), _jsx("span", { children: series.length })] }), rels !== null ? _jsx(SubscriptionTables, { rels: rels }) : null, _jsxs("div", { style: { padding: 8 }, children: [_jsx("div", { style: { fontSize: 11, color: "var(--muted)", marginBottom: 4 }, children: "Lag bytes" }), _jsx(Sparkline, { points: bytesPoints, yLabel: "bytes", color: "#7aa2ff" }), _jsx("div", { style: { fontSize: 11, color: "var(--muted)", margin: "12px 0 4px" }, children: "Lag seconds" }), _jsx(Sparkline, { points: secondsPoints, yLabel: "seconds", color: "#ffcc66" })] })] }));
}
