import { ActionResult, CloneResult, Connection, CopyIndexesResult, IndexDiffResult, MetricSample, SnapshotPayload, TableInfo, } from "./types";
async function jget(url, parse) {
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return parse(await r.json());
}
export async function listConnections() {
    return jget("/connections", (v) => v.map((x) => Connection.parse(x)));
}
export async function getSnapshot(id) {
    return jget(`/connections/${id}/snapshot`, (v) => SnapshotPayload.parse(v));
}
export async function getHistory(id, minutes, streamKind, streamName) {
    const params = new URLSearchParams({ minutes: String(minutes) });
    if (streamKind)
        params.set("stream_kind", streamKind);
    if (streamName)
        params.set("stream_name", streamName);
    return jget(`/connections/${id}/history?${params}`, (v) => v.map((x) => MetricSample.parse(x)));
}
export async function createConnection(payload) {
    const r = await fetch("/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return Connection.parse(await r.json());
}
export async function deleteConnection(id) {
    const r = await fetch(`/connections/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204)
        throw new Error(`${r.status} ${await r.text()}`);
}
export async function testConnection(id) {
    const r = await fetch(`/connections/${id}/test`, { method: "POST" });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
}
export async function listTables(id, schema) {
    const r = await fetch(`/connections/${id}/tables?schema=${encodeURIComponent(schema)}`);
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return (await r.json()).map((x) => TableInfo.parse(x));
}
export async function runAction(connectionId, action) {
    const r = await fetch(`/actions/${connectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
    });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return ActionResult.parse(await r.json());
}
export async function cloneSchema(payload) {
    const r = await fetch("/clone/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return CloneResult.parse(await r.json());
}
export async function copyIndexes(payload) {
    const r = await fetch("/clone/indexes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return CopyIndexesResult.parse(await r.json());
}
export async function diffIndexes(payload) {
    const r = await fetch("/clone/indexes/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!r.ok)
        throw new Error(`${r.status} ${await r.text()}`);
    return IndexDiffResult.parse(await r.json());
}
