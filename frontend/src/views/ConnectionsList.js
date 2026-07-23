import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createConnection, deleteConnection, listConnections, testConnection, } from "../lib/api";
function describe(c) {
    if (c.kind === "structured") {
        return `${c.host}:${c.port}/${c.database} (${c.role})`;
    }
    return `dsn → $${c.dsn_env} (${c.role})`;
}
export function ConnectionsList({ selectedId, onSelect }) {
    const qc = useQueryClient();
    const q = useQuery({ queryKey: ["connections"], queryFn: listConnections });
    const [showForm, setShowForm] = useState(false);
    const del = useMutation({
        mutationFn: (id) => deleteConnection(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
    });
    const test = useMutation({ mutationFn: (id) => testConnection(id) });
    return (_jsxs("div", { className: "sidebar", children: [_jsx("div", { className: "btn-row", children: _jsx("button", { onClick: () => setShowForm((v) => !v), children: showForm ? "Cancel" : "+ Add connection" }) }), showForm ? (_jsx(ConnectionForm, { onCreated: () => {
                    setShowForm(false);
                    qc.invalidateQueries({ queryKey: ["connections"] });
                } })) : null, _jsx("div", { className: "section-title", children: "Connections" }), q.data?.length === 0 ? (_jsxs("div", { style: { padding: 12, color: "var(--muted)", fontSize: 12 }, children: ["None yet \u2014 click ", _jsx("i", { children: "+ Add connection" }), "."] })) : null, q.data?.map((c) => (_jsxs("div", { className: `conn-item${selectedId === c.id ? " selected" : ""}`, onClick: () => onSelect(c.id), children: [_jsx("div", { className: "name", children: c.name }), _jsx("div", { className: "meta", children: describe(c) }), _jsxs("div", { className: "btn-row", style: { padding: 0, border: 0, marginTop: 4 }, children: [_jsx("button", { onClick: (e) => { e.stopPropagation(); test.mutate(c.id); }, children: "Test" }), _jsx("button", { onClick: (e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete connection ${c.name}?`))
                                        del.mutate(c.id);
                                }, children: "Delete" })] })] }, c.id)))] }));
}
function ConnectionForm({ onCreated }) {
    const [mode, setMode] = useState("structured");
    const [role, setRole] = useState("auto");
    const [name, setName] = useState("");
    // structured-only fields
    const [host, setHost] = useState("127.0.0.1");
    const [port, setPort] = useState(5432);
    const [database, setDatabase] = useState("postgres");
    const [username, setUsername] = useState("postgres");
    const [passwordEnv, setPasswordEnv] = useState("");
    // dsn-only field
    const [dsnEnv, setDsnEnv] = useState("");
    const [err, setErr] = useState(null);
    const buildPayload = () => {
        if (mode === "structured") {
            return {
                kind: "structured",
                name,
                role,
                host,
                port,
                database,
                username,
                password_env: passwordEnv,
            };
        }
        return { kind: "dsn", name, role, dsn_env: dsnEnv };
    };
    const m = useMutation({
        mutationFn: () => createConnection(buildPayload()),
        onSuccess: () => onCreated(),
        onError: (e) => setErr(e.message),
    });
    return (_jsxs("div", { style: { padding: 12, display: "grid", gap: 6, borderBottom: "1px solid var(--border)" }, children: [_jsxs("div", { style: { display: "flex", gap: 6 }, children: [_jsx("button", { onClick: () => setMode("structured"), style: {
                            flex: 1,
                            background: mode === "structured" ? "var(--accent)" : undefined,
                            color: mode === "structured" ? "#0f1115" : undefined,
                        }, children: "Structured" }), _jsx("button", { onClick: () => setMode("dsn"), style: {
                            flex: 1,
                            background: mode === "dsn" ? "var(--accent)" : undefined,
                            color: mode === "dsn" ? "#0f1115" : undefined,
                        }, children: "DSN env var" })] }), _jsx(Field, { label: "Name", value: name, onChange: setName }), mode === "structured" ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Host", value: host, onChange: setHost }), _jsx(Field, { label: "Port", value: String(port), onChange: (v) => setPort(parseInt(v) || 5432) }), _jsx(Field, { label: "Database", value: database, onChange: setDatabase }), _jsx(Field, { label: "Username", value: username, onChange: setUsername }), _jsx(Field, { label: "Password env var", value: passwordEnv, onChange: setPasswordEnv })] })) : (_jsx(_Fragment, { children: _jsx(Field, { label: "DSN env var", value: dsnEnv, onChange: setDsnEnv, help: "Name of an env var holding a libpq DSN, e.g. PGP_CONN_PRIMARY_DSN. Accepts postgres://\u2026 URI or keyword=value form." }) })), _jsxs("label", { style: { fontSize: 11, color: "var(--muted)" }, children: ["Role", _jsxs("select", { value: role, onChange: (e) => setRole(e.target.value), style: { width: "100%" }, children: [_jsx("option", { value: "auto", children: "auto" }), _jsx("option", { value: "publisher", children: "publisher" }), _jsx("option", { value: "subscriber", children: "subscriber" })] })] }), err ? _jsx("div", { className: "lag-err", style: { fontSize: 11 }, children: err }) : null, _jsx("button", { onClick: () => { setErr(null); m.mutate(); }, disabled: m.isPending, children: m.isPending ? "Creating…" : "Create" })] }));
}
function Field({ label, value, onChange, help, }) {
    return (_jsxs("label", { style: { fontSize: 11, color: "var(--muted)" }, children: [label, _jsx("input", { value: value, onChange: (e) => onChange(e.target.value), style: { width: "100%" } }), help ? (_jsx("div", { style: { fontSize: 10, marginTop: 2, color: "var(--muted)" }, children: help })) : null] }));
}
