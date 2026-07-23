import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cloneSchema, listConnections } from "../../lib/api";
import { CloneResultBlock, ConnectionSelect, Field, FormBody, Label, Modal } from "./Modal";
export function CloneSchemaModal({ onClose }) {
    const qc = useQueryClient();
    const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const connections = useMemo(() => conns.data ?? [], [conns.data]);
    const [sourceId, setSourceId] = useState("");
    const [targetId, setTargetId] = useState("");
    const [sourceSchema, setSourceSchema] = useState("public");
    const [targetSchema, setTargetSchema] = useState("public");
    const [createIfMissing, setCreateIfMissing] = useState(true);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!sourceId && connections.length > 0)
            setSourceId(connections[0].id);
        if (!targetId && connections.length > 0) {
            setTargetId(connections[1]?.id ?? connections[0].id);
        }
    }, [connections, sourceId, targetId]);
    const run = (dry) => cloneSchema({
        source_connection_id: sourceId,
        source_schema: sourceSchema,
        target_connection_id: targetId,
        target_schema: targetSchema,
        create_schema_if_missing: createIfMissing,
        dry_run: dry,
    });
    const dry = useMutation({
        mutationFn: () => run(true),
        onSuccess: setResult,
        onError: (e) => setError(e.message),
    });
    const apply = useMutation({
        mutationFn: () => run(false),
        onSuccess: (res) => {
            setResult(res);
            if (res.ok)
                qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
        },
        onError: (e) => setError(e.message),
    });
    const sameInPlace = sourceId === targetId && sourceSchema === targetSchema;
    return (_jsx(Modal, { title: "Clone schema", onClose: onClose, children: _jsxs(FormBody, { children: [_jsxs("div", { style: { fontSize: 11, color: "var(--muted)" }, children: ["Runs ", _jsx("code", { children: "pg_dump --schema-only --no-owner --no-privileges" }), " ", "against the source, optionally renames the schema, and applies the resulting DDL on the target. Source and target may be the same connection."] }), _jsx(Label, { children: "Source connection" }), _jsx(ConnectionSelect, { connections: connections, value: sourceId, onChange: setSourceId }), _jsx(Field, { label: "Source schema", value: sourceSchema, onChange: setSourceSchema }), _jsx(Label, { children: "Target connection" }), _jsx(ConnectionSelect, { connections: connections, value: targetId, onChange: setTargetId }), _jsx(Field, { label: "Target schema (use a different name to rename)", value: targetSchema, onChange: setTargetSchema }), _jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: createIfMissing, onChange: (e) => setCreateIfMissing(e.target.checked) }), "Create target schema if it doesn't exist"] }), sameInPlace ? (_jsx("div", { className: "lag-warn", style: { fontSize: 11 }, children: "Source and target are identical \u2014 this will try to recreate the schema's objects in place and will almost certainly fail. Rename the target." })) : null, _jsx(CloneResultBlock, { result: result, error: error }), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }, children: [_jsx("button", { onClick: onClose, children: "Cancel" }), _jsx("button", { disabled: !sourceId || !targetId || !sourceSchema || !targetSchema || dry.isPending, onClick: () => {
                                setError(null);
                                setResult(null);
                                dry.mutate();
                            }, children: dry.isPending ? "Dumping…" : "Dry run" }), _jsx("button", { disabled: !sourceId || !targetId || !sourceSchema || !targetSchema || apply.isPending, onClick: () => {
                                setError(null);
                                setResult(null);
                                apply.mutate();
                            }, children: apply.isPending ? "Applying…" : "Apply" })] })] }) }));
}
