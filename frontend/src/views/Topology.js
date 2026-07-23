import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import ReactFlow, { Background, Controls, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, } from "reactflow";
import { listConnections, getSnapshot } from "../lib/api";
import { buildTopology } from "../lib/topology";
import { liveSocket } from "../lib/ws";
function TopologyCanvas({ desiredNodes, desiredEdges, onSelectStream }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();
    // Sync desired → state. Preserve any user-dragged positions for nodes
    // whose IDs are still present; new nodes get the computed position; removed
    // nodes are dropped.
    useEffect(() => {
        setNodes((current) => {
            const prevById = new Map(current.map((n) => [n.id, n]));
            return desiredNodes.map((d) => {
                const existing = prevById.get(d.id);
                if (existing) {
                    // Keep the user's position but pick up the latest label/style.
                    return { ...d, position: existing.position };
                }
                return d;
            });
        });
    }, [desiredNodes, setNodes]);
    useEffect(() => {
        setEdges(desiredEdges);
    }, [desiredEdges, setEdges]);
    // Re-fit when the node set actually changes (adds/removes), not when only
    // labels or positions update — otherwise dragging fights the camera.
    const idKey = desiredNodes.map((n) => n.id).sort().join("|");
    useEffect(() => {
        if (desiredNodes.length === 0)
            return;
        const raf = window.requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 200 });
        });
        return () => window.cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idKey, fitView]);
    return (_jsxs(ReactFlow, { nodes: nodes, edges: edges, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, nodesDraggable: true, nodesConnectable: false, onNodeClick: (_, node) => {
            const [kind, connId, ...rest] = node.id.split(":");
            if (kind === "pub")
                onSelectStream({ connectionId: connId, kind: "publication_slot", name: rest.join(":") });
            else if (kind === "sub")
                onSelectStream({ connectionId: connId, kind: "subscription", name: rest.join(":") });
            else
                onSelectStream(null);
        }, children: [_jsx(Background, {}), _jsx(Controls, {})] }));
}
export function Topology({ onSelectStream }) {
    const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const connections = useMemo(() => conns.data ?? [], [conns.data]);
    const snapQueries = useQueries({
        queries: connections.map((c) => ({
            queryKey: ["snapshot", c.id],
            queryFn: () => getSnapshot(c.id),
            refetchInterval: 5000,
            retry: false,
        })),
    });
    const snapshotKey = snapQueries.map((q) => q.dataUpdatedAt).join(",");
    const snapshots = useMemo(() => {
        const m = {};
        connections.forEach((c, i) => {
            m[c.id] = snapQueries[i]?.data;
        });
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connections, snapshotKey]);
    const [liveSamples, setLiveSamples] = useState({});
    const idsKey = connections.map((c) => c.id).join(",");
    useEffect(() => {
        if (idsKey === "")
            return;
        const ids = idsKey.split(",");
        liveSocket.connect();
        liveSocket.subscribe(ids);
        const off = liveSocket.onSample((p) => {
            setLiveSamples((prev) => {
                const next = { ...prev };
                for (const s of p.samples) {
                    next[`${s.connection_id}|${s.stream_kind}|${s.stream_name}`] = s;
                }
                return next;
            });
        });
        return () => {
            liveSocket.unsubscribe(ids);
            off();
        };
    }, [idsKey]);
    const latestByStream = useMemo(() => {
        const m = {};
        for (const snap of Object.values(snapshots)) {
            if (!snap)
                continue;
            for (const s of snap.latest_samples) {
                m[`${s.connection_id}|${s.stream_kind}|${s.stream_name}`] = s;
            }
        }
        for (const [k, v] of Object.entries(liveSamples)) {
            const cur = m[k];
            if (!cur || v.sampled_at > cur.sampled_at)
                m[k] = v;
        }
        return m;
    }, [snapshots, liveSamples]);
    const { nodes: desiredNodes, edges: desiredEdges } = useMemo(() => buildTopology({ connections, snapshots, latestByStream }), [connections, snapshots, latestByStream]);
    if (connections.length === 0) {
        return _jsx("div", { className: "empty", children: "Add a connection to see topology." });
    }
    return (_jsx("div", { style: { width: "100%", height: "100%" }, children: _jsx(ReactFlowProvider, { children: _jsx(TopologyCanvas, { desiredNodes: desiredNodes, desiredEdges: desiredEdges, onSelectStream: onSelectStream }) }) }));
}
