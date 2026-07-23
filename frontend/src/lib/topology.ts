import { Edge, Node } from "reactflow";
import {
  Connection,
  MetricSample,
  PublicationRow,
  SnapshotPayload,
  SubscriptionRow,
} from "./types";

export type LagInfo = { bytes: number | null; seconds: number | null };

export function lagSeverity(lag: LagInfo): "ok" | "warn" | "err" {
  const bytes = lag.bytes ?? 0;
  const secs = lag.seconds ?? 0;
  if (bytes > 100 * 1024 * 1024 || secs > 30) return "err";
  if (bytes > 1 * 1024 * 1024 || secs > 5) return "warn";
  return "ok";
}

export function colorForLag(lag: LagInfo): string {
  switch (lagSeverity(lag)) {
    case "ok":
      return "#5cd29a";
    case "warn":
      return "#ffcc66";
    case "err":
      return "#ff7b7b";
  }
}

interface BuildArgs {
  connections: Connection[];
  snapshots: Record<string, SnapshotPayload | undefined>;
  latestByStream: Record<string, MetricSample>;
}

// Rows are top-down: publisher DB → publications → subscriptions → subscriber DB.
const ROW_PUB_DB_Y = 0;
const ROW_PUB_Y = 220;
const ROW_SUB_Y = 460;
const ROW_SUB_DB_Y = 680;

const DB_WIDTH = 240;
const NODE_WIDTH = 220;
const HORIZ_GAP = 24;
const CLUSTER_GAP = 60;

const OWNERSHIP_STROKE = "#3a4459";

interface SubRef {
  nodeId: string;
  publications: string[];
  lag: LagInfo;
}

function clusterWidth(itemCount: number): number {
  if (itemCount <= 0) return DB_WIDTH;
  if (itemCount === 1) return Math.max(DB_WIDTH, NODE_WIDTH);
  return itemCount * NODE_WIDTH + (itemCount - 1) * HORIZ_GAP;
}

function dbLabel(c: Connection): string {
  const subtitle =
    c.kind === "structured"
      ? `${c.host}:${c.port}/${c.database}`
      : `dsn $${c.dsn_env}`;
  return `${c.name}\n${subtitle}`;
}

const DB_STYLE = {
  background: "#1d222d",
  color: "#e7eaf2",
  border: "1px solid #3a4459",
  borderRadius: 8,
  padding: 8,
  width: DB_WIDTH,
  whiteSpace: "pre-line" as const,
  fontSize: 12,
  textAlign: "center" as const,
};

function pubNodeStyle(color: string) {
  return {
    background: "#161a22",
    color: "#e7eaf2",
    border: `2px solid ${color}`,
    borderRadius: 6,
    padding: 6,
    width: NODE_WIDTH,
    whiteSpace: "pre-line" as const,
    fontSize: 11,
  };
}

export function buildTopology({
  connections,
  snapshots,
  latestByStream,
}: BuildArgs): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const pubNodesByName: Record<string, string[]> = {};
  const subRefs: SubRef[] = [];

  // A connection appears once unless it's both publisher and subscriber:
  //   * has pubs only       → top row only
  //   * has subs only       → bottom row only
  //   * has both            → both rows (the cascading case)
  //   * has neither         → top row (so we still see the DB somewhere)
  const topRow = connections
    .filter((c) => {
      const snap = snapshots[c.id];
      const pubs = snap?.publications ?? [];
      const subs = snap?.subscriptions ?? [];
      return pubs.length > 0 || subs.length === 0;
    })
    .map((c) => ({
      c,
      pubs: snapshots[c.id]?.publications ?? [],
      pubTables: snapshots[c.id]?.publication_tables ?? [],
    }));

  const bottomRow = connections
    .filter((c) => (snapshots[c.id]?.subscriptions ?? []).length > 0)
    .map((c) => ({
      c,
      subs: snapshots[c.id]!.subscriptions as SubscriptionRow[],
    }));

  let xCursor = 0;
  for (const { c, pubs, pubTables } of topRow) {
    const colWidth = Math.max(DB_WIDTH, clusterWidth(pubs.length));
    const dbX = xCursor + (colWidth - DB_WIDTH) / 2;
    const pdbId = `pdb:${c.id}`;
    nodes.push({
      id: pdbId,
      position: { x: dbX, y: ROW_PUB_DB_Y },
      data: { label: dbLabel(c) },
      style: DB_STYLE,
    });

    const pubsWidth = clusterWidth(pubs.length);
    const pubsStart = xCursor + (colWidth - pubsWidth) / 2;
    pubs.forEach((p: PublicationRow, j) => {
      const pid = `pub:${c.id}:${p.name}`;
      const slotKey = `${c.id}|publication_slot|${p.name}`;
      const sample = latestByStream[slotKey];
      const lag: LagInfo = {
        bytes: sample?.lag_bytes ?? null,
        seconds: sample?.lag_seconds ?? null,
      };
      const color = colorForLag(lag);
      const tables = p.all_tables
        ? "ALL TABLES"
        : `${pubTables.filter((t) => t.publication === p.name).length} tables`;
      nodes.push({
        id: pid,
        position: {
          x: pubsStart + j * (NODE_WIDTH + HORIZ_GAP),
          y: ROW_PUB_Y,
        },
        data: { label: `PUB ${p.name}\n${tables}\nlag: ${formatLag(lag)}` },
        style: pubNodeStyle(color),
      });
      edges.push({
        id: `e:${pdbId}->${pid}`,
        source: pdbId,
        target: pid,
        style: { stroke: OWNERSHIP_STROKE },
      });
      (pubNodesByName[p.name] ??= []).push(pid);
    });

    xCursor += colWidth + CLUSTER_GAP;
  }

  xCursor = 0;
  for (const { c, subs } of bottomRow) {
    const colWidth = Math.max(DB_WIDTH, clusterWidth(subs.length));
    const sdbId = `sdb:${c.id}`;
    const dbX = xCursor + (colWidth - DB_WIDTH) / 2;
    const subsWidth = clusterWidth(subs.length);
    const subsStart = xCursor + (colWidth - subsWidth) / 2;

    subs.forEach((s, j) => {
      const sid = `sub:${c.id}:${s.name}`;
      const subKey = `${c.id}|subscription|${s.name}`;
      const sample = latestByStream[subKey];
      const lag: LagInfo = {
        bytes: sample?.lag_bytes ?? null,
        seconds: sample?.lag_seconds ?? null,
      };
      const color = colorForLag(lag);
      nodes.push({
        id: sid,
        position: {
          x: subsStart + j * (NODE_WIDTH + HORIZ_GAP),
          y: ROW_SUB_Y,
        },
        data: {
          label: `SUB ${s.name}\npubs: ${s.publications.join(", ")}\nlag: ${formatLag(lag)}`,
        },
        style: pubNodeStyle(color),
      });
      edges.push({
        id: `e:${sid}->${sdbId}`,
        source: sid,
        target: sdbId,
        style: { stroke: OWNERSHIP_STROKE },
      });
      subRefs.push({ nodeId: sid, publications: s.publications, lag });
    });

    nodes.push({
      id: sdbId,
      position: { x: dbX, y: ROW_SUB_DB_Y },
      data: { label: dbLabel(c) },
      style: DB_STYLE,
    });

    xCursor += colWidth + CLUSTER_GAP;
  }

  // Cross-DB replication edges (publication → subscription).
  for (const sub of subRefs) {
    const color = colorForLag(sub.lag);
    const animated = lagSeverity(sub.lag) !== "ok";
    for (const pubName of sub.publications) {
      const pubIds = pubNodesByName[pubName] ?? [];
      for (const pubId of pubIds) {
        edges.push({
          id: `e:${pubId}->${sub.nodeId}`,
          source: pubId,
          target: sub.nodeId,
          style: { stroke: color, strokeWidth: 2 },
          animated,
          label: formatLag(sub.lag),
          labelStyle: { fill: color, fontSize: 10 },
          labelBgStyle: { fill: "#0f1115" },
        });
      }
    }
  }

  return { nodes, edges };
}

export function formatLag(lag: LagInfo): string {
  const parts: string[] = [];
  if (lag.bytes != null) parts.push(formatBytes(lag.bytes));
  if (lag.seconds != null) parts.push(`${lag.seconds.toFixed(2)}s`);
  return parts.length ? parts.join(" / ") : "—";
}

export function formatBytes(n: number): string {
  if (Math.abs(n) < 1024) return `${n} B`;
  if (Math.abs(n) < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (Math.abs(n) < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
