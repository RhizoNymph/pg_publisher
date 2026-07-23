import {
  ActionRequest,
  ActionResult,
  CloneResult,
  CloneSchemaRequest,
  Connection,
  ConnectionCreate,
  CopyIndexesRequest,
  CopyIndexesResult,
  DiffIndexesRequest,
  IndexDiffResult,
  MetricSample,
  SnapshotPayload,
  TableInfo,
} from "./types";

async function jget<T>(url: string, parse: (v: unknown) => T): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return parse(await r.json());
}

export async function listConnections(): Promise<Connection[]> {
  return jget("/connections", (v) =>
    (v as unknown[]).map((x) => Connection.parse(x)),
  );
}

export async function getSnapshot(id: string): Promise<SnapshotPayload> {
  return jget(`/connections/${id}/snapshot`, (v) => SnapshotPayload.parse(v));
}

export async function getHistory(
  id: string,
  minutes: number,
  streamKind?: string,
  streamName?: string,
): Promise<MetricSample[]> {
  const params = new URLSearchParams({ minutes: String(minutes) });
  if (streamKind) params.set("stream_kind", streamKind);
  if (streamName) params.set("stream_name", streamName);
  return jget(`/connections/${id}/history?${params}`, (v) =>
    (v as unknown[]).map((x) => MetricSample.parse(x)),
  );
}

export async function createConnection(payload: ConnectionCreate): Promise<Connection> {
  const r = await fetch("/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return Connection.parse(await r.json());
}

export async function deleteConnection(id: string): Promise<void> {
  const r = await fetch(`/connections/${id}`, { method: "DELETE" });
  if (!r.ok && r.status !== 204) throw new Error(`${r.status} ${await r.text()}`);
}

export async function testConnection(id: string): Promise<void> {
  const r = await fetch(`/connections/${id}/test`, { method: "POST" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

export async function listTables(id: string, schema: string): Promise<TableInfo[]> {
  const r = await fetch(`/connections/${id}/tables?schema=${encodeURIComponent(schema)}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json() as unknown[]).map((x) => TableInfo.parse(x));
}

export async function runAction(
  connectionId: string,
  action: ActionRequest,
): Promise<ActionResult> {
  const r = await fetch(`/actions/${connectionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return ActionResult.parse(await r.json());
}

export async function cloneSchema(payload: CloneSchemaRequest): Promise<CloneResult> {
  const r = await fetch("/clone/schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return CloneResult.parse(await r.json());
}

export async function copyIndexes(
  payload: CopyIndexesRequest,
): Promise<CopyIndexesResult> {
  const r = await fetch("/clone/indexes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return CopyIndexesResult.parse(await r.json());
}

export async function diffIndexes(
  payload: DiffIndexesRequest,
): Promise<IndexDiffResult> {
  const r = await fetch("/clone/indexes/diff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return IndexDiffResult.parse(await r.json());
}
