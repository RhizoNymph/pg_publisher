import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listConnections, listTables, runAction } from "../../lib/api";
import { ConnectionSelect, Field, FormBody, Label, Modal, ResultBlock, } from "./Modal";
export function NewPublicationModal({ onClose }) {
    const qc = useQueryClient();
    const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const connections = useMemo(() => conns.data ?? [], [conns.data]);
    const [targetId, setTargetId] = useState("");
    const [name, setName] = useState("");
    const [schema, setSchema] = useState("public");
    const [allTables, setAllTables] = useState(false);
    const [picked, setPicked] = useState(new Set());
    const [publish, setPublish] = useState({
        insert: true,
        update: true,
        delete: true,
        truncate: true,
    });
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    // Lock in the first connection once they load.
    useEffect(() => {
        if (!targetId && connections.length > 0)
            setTargetId(connections[0].id);
    }, [connections, targetId]);
    const tablesQ = useQuery({
        queryKey: ["tables", targetId, schema],
        queryFn: () => listTables(targetId, schema),
        enabled: !!targetId && schema.trim().length > 0,
        retry: false,
    });
    // When the table set changes (target connection or schema), default to
    // every table checked.
    const tableNames = useMemo(() => (tablesQ.data ?? []).map((t) => t.table_name), [tablesQ.data]);
    const tablesKey = tableNames.join("|");
    useEffect(() => {
        setPicked(new Set(tableNames));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tablesKey]);
    const togglePick = (n) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(n))
                next.delete(n);
            else
                next.add(n);
            return next;
        });
    };
    const m = useMutation({
        mutationFn: () => {
            const tables = allTables
                ? []
                : (tablesQ.data ?? [])
                    .filter((t) => picked.has(t.table_name))
                    .map((t) => ({
                    schema_name: t.schema_name,
                    table_name: t.table_name,
                }));
            const action = {
                kind: "create_publication",
                name,
                all_tables: allTables,
                tables,
                publish,
            };
            return runAction(targetId, action);
        },
        onSuccess: (res) => {
            setResult(res);
            if (res.ok)
                qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
        },
        onError: (e) => setError(e.message),
    });
    const canSubmit = !!targetId && !!name && (allTables || picked.size > 0) && !m.isPending;
    return (_jsx(Modal, { title: "New publication", onClose: onClose, children: _jsxs(FormBody, { children: [_jsx(Label, { children: "Target database" }), _jsx(ConnectionSelect, { connections: connections, value: targetId, onChange: setTargetId }), _jsx(Field, { label: "Publication name", value: name, onChange: setName }), _jsx(Field, { label: "Schema", value: schema, onChange: (v) => {
                        setSchema(v);
                        setPicked(new Set());
                    } }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: allTables, onChange: (e) => setAllTables(e.target.checked) }), "FOR ALL TABLES", _jsx("span", { style: { color: "var(--muted)", fontSize: 11 }, children: "(requires superuser on the target; many managed services don't allow it)" })] }), !allTables ? (_jsx(TablesChecklist, { loading: tablesQ.isPending && tablesQ.fetchStatus !== "idle", error: tablesQ.error, tables: tablesQ.data ?? [], picked: picked, onToggle: togglePick, onSelectAll: () => setPicked(new Set(tableNames)), onSelectNone: () => setPicked(new Set()) })) : null, _jsx(Label, { children: "Publish operations" }), _jsx("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }, children: ["insert", "update", "delete", "truncate"].map((k) => (_jsxs("label", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsx("input", { type: "checkbox", checked: publish[k], onChange: (e) => setPublish({ ...publish, [k]: e.target.checked }) }), k] }, k))) }), _jsx(ResultBlock, { result: result, error: error }), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }, children: [_jsx("button", { onClick: onClose, children: "Cancel" }), _jsx("button", { disabled: !canSubmit, onClick: () => {
                                setError(null);
                                setResult(null);
                                m.mutate();
                            }, children: m.isPending ? "Creating…" : "Create publication" })] })] }) }));
}
function TablesChecklist({ loading, error, tables, picked, onToggle, onSelectAll, onSelectNone, }) {
    return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }, children: [_jsxs("div", { style: { fontSize: 11, color: "var(--muted)" }, children: ["Tables in schema (", tables.length, ", ", picked.size, " picked)"] }), _jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { onClick: onSelectAll, style: { padding: "2px 8px", fontSize: 11 }, disabled: tables.length === 0, children: "All" }), _jsx("button", { onClick: onSelectNone, style: { padding: "2px 8px", fontSize: 11 }, disabled: tables.length === 0, children: "None" })] })] }), _jsx("div", { style: {
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    background: "var(--panel-2)",
                    maxHeight: 220,
                    overflow: "auto",
                    padding: 6,
                }, children: loading ? (_jsx("div", { style: { fontSize: 11, color: "var(--muted)", padding: 4 }, children: "Loading\u2026" })) : error ? (_jsx("div", { className: "lag-err", style: { fontSize: 11, padding: 4, whiteSpace: "pre-wrap" }, children: error.message })) : tables.length === 0 ? (_jsx("div", { style: { fontSize: 11, color: "var(--muted)", padding: 4 }, children: "No tables found in this schema." })) : (tables.map((t) => (_jsxs("label", { style: {
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 12,
                        padding: "2px 4px",
                    }, children: [_jsx("input", { type: "checkbox", checked: picked.has(t.table_name), onChange: () => onToggle(t.table_name) }), _jsxs("span", { style: { color: "var(--muted)" }, children: [t.schema_name, "."] }), t.table_name] }, t.table_name)))) })] }));
}
