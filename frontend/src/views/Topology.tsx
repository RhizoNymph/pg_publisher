import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";
import { listConnections, getSnapshot } from "../lib/api";
import { Connection, MetricSample, SnapshotPayload, WSSamplePayload } from "../lib/types";
import { buildTopology } from "../lib/topology";
import { liveSocket } from "../lib/ws";

interface Props {
  onSelectStream: (key: { connectionId: string; kind: string; name: string } | null) => void;
}

interface CanvasProps {
  desiredNodes: Node[];
  desiredEdges: Edge[];
  onSelectStream: Props["onSelectStream"];
}

function TopologyCanvas({ desiredNodes, desiredEdges, onSelectStream }: CanvasProps) {
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
    if (desiredNodes.length === 0) return;
    const raf = window.requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 });
    });
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable
      nodesConnectable={false}
      onNodeClick={(_, node) => {
        const [kind, connId, ...rest] = node.id.split(":");
        if (kind === "pub")
          onSelectStream({ connectionId: connId, kind: "publication_slot", name: rest.join(":") });
        else if (kind === "sub")
          onSelectStream({ connectionId: connId, kind: "subscription", name: rest.join(":") });
        else onSelectStream(null);
      }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export function Topology({ onSelectStream }: Props) {
  const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const connections = useMemo<Connection[]>(() => conns.data ?? [], [conns.data]);

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
    const m: Record<string, SnapshotPayload | undefined> = {};
    connections.forEach((c, i) => {
      m[c.id] = snapQueries[i]?.data;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, snapshotKey]);

  const [liveSamples, setLiveSamples] = useState<Record<string, MetricSample>>({});

  const idsKey = connections.map((c) => c.id).join(",");
  useEffect(() => {
    if (idsKey === "") return;
    const ids = idsKey.split(",");
    liveSocket.connect();
    liveSocket.subscribe(ids);
    const off = liveSocket.onSample((p: WSSamplePayload) => {
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
    const m: Record<string, MetricSample> = {};
    for (const snap of Object.values(snapshots)) {
      if (!snap) continue;
      for (const s of snap.latest_samples) {
        m[`${s.connection_id}|${s.stream_kind}|${s.stream_name}`] = s;
      }
    }
    for (const [k, v] of Object.entries(liveSamples)) {
      const cur = m[k];
      if (!cur || v.sampled_at > cur.sampled_at) m[k] = v;
    }
    return m;
  }, [snapshots, liveSamples]);

  const { nodes: desiredNodes, edges: desiredEdges } = useMemo(
    () => buildTopology({ connections, snapshots, latestByStream }),
    [connections, snapshots, latestByStream],
  );

  if (connections.length === 0) {
    return <div className="empty">Add a connection to see topology.</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <TopologyCanvas
          desiredNodes={desiredNodes}
          desiredEdges={desiredEdges}
          onSelectStream={onSelectStream}
        />
      </ReactFlowProvider>
    </div>
  );
}
