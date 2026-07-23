import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { copyIndexes, diffIndexes, listConnections } from "../../lib/api";
import { ConnectionSelect, Field, FormBody, Label, Modal } from "./Modal";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
function DefPre({ children }) {
    return (_jsx("pre", { style: {
            margin: 0,
            whiteSpace: "pre-wrap",
            color: "var(--text)",
            background: "#0f1115",
            padding: 6,
            borderRadius: 4,
            fontFamily: MONO,
            fontSize: 10,
        }, children: children }));
}
function OutcomeSection({ title, tone, outcomes, }) {
    const [open, setOpen] = useState(tone === "warn" || tone === "err");
    if (outcomes.length === 0)
        return null;
    const color = tone === "ok"
        ? "var(--ok)"
        : tone === "err"
            ? "var(--err)"
            : tone === "warn"
                ? "#d9a441"
                : "var(--muted)";
    return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("button", { onClick: () => setOpen(!open), style: {
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    color,
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                }, children: [open ? "▾" : "▸", " ", title, " (", outcomes.length, ")"] }), open &&
                outcomes.map((o) => (_jsxs("div", { style: { display: "grid", gap: 2 }, children: [_jsxs("div", { style: { fontSize: 10, color: "var(--muted)", fontFamily: MONO }, children: [o.table_name, ".", o.index_name] }), _jsx(DefPre, { children: o.indexdef }), o.status === "conflict" && o.target_indexdef ? (_jsxs("div", { style: { fontSize: 10, color }, children: ["target has: ", _jsx(DefPre, { children: o.target_indexdef })] })) : null, o.status === "failed" && o.error ? (_jsx("div", { style: { fontSize: 10, color: "var(--err)" }, children: o.error })) : null] }, `${o.table_name}.${o.index_name}`)))] }));
}
function CopyReportBlock({ result }) {
    const dry = result.detail === "dry-run";
    const missing = result.outcomes.filter((o) => o.status === "missing");
    const created = result.outcomes.filter((o) => o.status === "created");
    const exists = result.outcomes.filter((o) => o.status === "exists");
    const conflicts = result.outcomes.filter((o) => o.status === "conflict");
    const failed = result.outcomes.filter((o) => o.status === "failed");
    const head = dry
        ? `Dry run — would create ${missing.length}, already present ${exists.length}, ` +
            `conflicts ${conflicts.length}`
        : `Created ${result.created}, already present ${result.exists}, ` +
            `conflicts ${result.conflicts}, failed ${result.failed}`;
    const ok = result.ok && result.failed === 0;
    return (_jsxs("div", { style: {
            fontSize: 11,
            background: ok ? "#0f1d17" : "#1a1216",
            padding: 8,
            borderRadius: 6,
            border: `1px solid ${ok ? "var(--ok)" : "var(--err)"}`,
            color: ok ? "var(--ok)" : "var(--err)",
            display: "grid",
            gap: 6,
            maxHeight: 320,
            overflow: "auto",
        }, children: [_jsx("div", { children: head }), !dry && result.created === 0 && result.failed === 0 ? (_jsx("div", { style: { color: "#d9a441" }, children: "Nothing was created \u2014 the target already had an equivalent of every source index. If you expected new indexes, check that the source connection/schema actually holds them." })) : null, _jsx(OutcomeSection, { title: "Failed", tone: "err", outcomes: failed }), _jsx(OutcomeSection, { title: "Conflicts (same name, different definition \u2014 not touched)", tone: "warn", outcomes: conflicts }), _jsx(OutcomeSection, { title: dry ? "Would create" : "Created", tone: "ok", outcomes: dry ? missing : created }), _jsx(OutcomeSection, { title: "Already present", tone: "muted", outcomes: exists })] }));
}
function DiffBlock({ diff }) {
    const targetOnly = diff.target_only.map((t) => ({
        table_name: t.table_name,
        index_name: t.index_name,
        status: "exists",
        indexdef: t.indexdef,
    }));
    const clean = diff.missing.length === 0 && diff.conflicts.length === 0;
    return (_jsxs("div", { style: {
            fontSize: 11,
            background: clean ? "#0f1d17" : "#16141a",
            padding: 8,
            borderRadius: 6,
            border: `1px solid ${clean ? "var(--ok)" : "var(--border)"}`,
            display: "grid",
            gap: 6,
            maxHeight: 320,
            overflow: "auto",
            color: "var(--text)",
        }, children: [_jsx("div", { style: { color: clean ? "var(--ok)" : "var(--text)" }, children: clean
                    ? `Target covers every source index (${diff.identical.length} identical)`
                    : `Missing on target: ${diff.missing.length} · conflicts: ` +
                        `${diff.conflicts.length} · identical: ${diff.identical.length} · ` +
                        `target-only: ${diff.target_only.length}` }), _jsx(OutcomeSection, { title: "Missing on target", tone: "err", outcomes: diff.missing }), _jsx(OutcomeSection, { title: "Conflicts (same name, different definition)", tone: "warn", outcomes: diff.conflicts }), _jsx(OutcomeSection, { title: "Identical", tone: "muted", outcomes: diff.identical }), _jsx(OutcomeSection, { title: "Target only", tone: "muted", outcomes: targetOnly })] }));
}
export function CopyIndexesModal({ onClose }) {
    const qc = useQueryClient();
    const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const connections = useMemo(() => conns.data ?? [], [conns.data]);
    const [sourceId, setSourceId] = useState("");
    const [targetId, setTargetId] = useState("");
    const [sourceSchema, setSourceSchema] = useState("public");
    const [sourceTable, setSourceTable] = useState("");
    const [targetSchema, setTargetSchema] = useState("public");
    const [targetTable, setTargetTable] = useState("");
    const [ifNotExists, setIfNotExists] = useState(true);
    const [result, setResult] = useState(null);
    const [diffResult, setDiffResult] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!sourceId && connections.length > 0)
            setSourceId(connections[0].id);
        if (!targetId && connections.length > 0) {
            setTargetId(connections[1]?.id ?? connections[0].id);
        }
    }, [connections, sourceId, targetId]);
    const reqBase = () => ({
        source_connection_id: sourceId,
        source_schema: sourceSchema,
        source_table: sourceTable.trim() ? sourceTable.trim() : null,
        target_connection_id: targetId,
        target_schema: targetSchema,
        target_table: targetTable.trim() ? targetTable.trim() : null,
    });
    const clear = () => {
        setError(null);
        setResult(null);
        setDiffResult(null);
    };
    const diff = useMutation({
        mutationFn: () => diffIndexes(reqBase()),
        onSuccess: setDiffResult,
        onError: (e) => setError(e.message),
    });
    const dry = useMutation({
        mutationFn: () => copyIndexes({ ...reqBase(), if_not_exists: ifNotExists, dry_run: true }),
        onSuccess: setResult,
        onError: (e) => setError(e.message),
    });
    const apply = useMutation({
        mutationFn: () => copyIndexes({ ...reqBase(), if_not_exists: ifNotExists, dry_run: false }),
        onSuccess: (res) => {
            setResult(res);
            if (res.ok)
                qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
        },
        onError: (e) => setError(e.message),
    });
    const ready = sourceId && targetId && sourceSchema && targetSchema;
    return (_jsx(Modal, { title: "Copy indexes", onClose: onClose, width: 640, children: _jsxs(FormBody, { children: [_jsxs("div", { style: { fontSize: 11, color: "var(--muted)" }, children: ["Reads index definitions from ", _jsx("code", { children: "pg_indexes" }), " on the source and creates the ones the target lacks. Indexes whose definition already exists on the target (under any name) are skipped and reported; a same-named index with a different definition is reported as a conflict and never touched. Use ", _jsx("b", { children: "Diff" }), " to compare without changing anything."] }), _jsx(Label, { children: "Source connection" }), _jsx(ConnectionSelect, { connections: connections, value: sourceId, onChange: setSourceId }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }, children: [_jsx(Field, { label: "Source schema", value: sourceSchema, onChange: setSourceSchema }), _jsx(Field, { label: "Source table (optional)", value: sourceTable, onChange: setSourceTable })] }), _jsx(Label, { children: "Target connection" }), _jsx(ConnectionSelect, { connections: connections, value: targetId, onChange: setTargetId }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }, children: [_jsx(Field, { label: "Target schema", value: targetSchema, onChange: setTargetSchema }), _jsxs("div", { children: [_jsx(Label, { children: "Target table (only when source table is set)" }), _jsx("input", { value: targetTable, onChange: (e) => setTargetTable(e.target.value), style: { width: "100%" }, disabled: !sourceTable })] })] }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: ifNotExists, onChange: (e) => setIfNotExists(e.target.checked) }), "Add ", _jsx("code", { children: "IF NOT EXISTS" }), " to each ", _jsx("code", { children: "CREATE INDEX" })] }), error ? (_jsx("pre", { className: "lag-err", style: {
                        fontSize: 11,
                        background: "#1a1216",
                        padding: 8,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                    }, children: error })) : null, diffResult ? _jsx(DiffBlock, { diff: diffResult }) : null, result ? _jsx(CopyReportBlock, { result: result }) : null, _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }, children: [_jsx("button", { onClick: onClose, children: "Cancel" }), _jsx("button", { disabled: !ready || diff.isPending, onClick: () => {
                                clear();
                                diff.mutate();
                            }, children: diff.isPending ? "Comparing…" : "Diff" }), _jsx("button", { disabled: !ready || dry.isPending, onClick: () => {
                                clear();
                                dry.mutate();
                            }, children: dry.isPending ? "Reading…" : "Dry run" }), _jsx("button", { disabled: !ready || apply.isPending, onClick: () => {
                                clear();
                                apply.mutate();
                            }, children: apply.isPending ? "Applying…" : "Apply" })] })] }) }));
}
