import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Modal({ title, onClose, children, width = 560, }) {
    return (_jsx("div", { onClick: onClose, style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
        }, children: _jsxs("div", { onClick: (e) => e.stopPropagation(), style: {
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                width,
                maxHeight: "90vh",
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
            }, children: [_jsxs("div", { style: {
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border)",
                    }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: title }), _jsx("div", { style: { marginLeft: "auto" }, children: _jsx("button", { onClick: onClose, children: "Close" }) })] }), children] }) }));
}
export function FormBody({ children }) {
    return _jsx("div", { style: { padding: 16, display: "grid", gap: 8 }, children: children });
}
export function Label({ children }) {
    return (_jsx("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 6 }, children: children }));
}
export function Field({ label, value, onChange, help, type = "text", }) {
    return (_jsxs("label", { style: { fontSize: 11, color: "var(--muted)" }, children: [label, _jsx("input", { type: type, value: value, onChange: (e) => onChange(e.target.value), style: { width: "100%" } }), help ? (_jsx("div", { style: { fontSize: 10, marginTop: 2, color: "var(--muted)" }, children: help })) : null] }));
}
export function ConnectionSelect({ connections, value, onChange, }) {
    return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), style: { width: "100%" }, children: connections.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " \u2014", " ", c.kind === "structured"
                    ? `${c.host}:${c.port}/${c.database}`
                    : `dsn $${c.dsn_env}`] }, c.id))) }));
}
export function ResultBlock({ result, error, }) {
    if (error) {
        return (_jsx("pre", { className: "lag-err", style: {
                fontSize: 11,
                background: "#1a1216",
                padding: 8,
                borderRadius: 6,
                whiteSpace: "pre-wrap",
            }, children: error }));
    }
    if (!result)
        return null;
    return (_jsxs("div", { style: {
            fontSize: 11,
            background: result.ok ? "#0f1d17" : "#1a1216",
            padding: 8,
            borderRadius: 6,
            border: `1px solid ${result.ok ? "var(--ok)" : "var(--err)"}`,
            color: result.ok ? "var(--ok)" : "var(--err)",
        }, children: [_jsx("div", { style: { marginBottom: 4 }, children: result.ok ? "OK" : result.detail ?? "Failed" }), _jsx("pre", { style: { margin: 0, whiteSpace: "pre-wrap", color: "var(--text)" }, children: result.sql })] }));
}
export function CloneResultBlock({ result, error, }) {
    if (error) {
        return (_jsx("pre", { className: "lag-err", style: {
                fontSize: 11,
                background: "#1a1216",
                padding: 8,
                borderRadius: 6,
                whiteSpace: "pre-wrap",
            }, children: error }));
    }
    if (!result)
        return null;
    const stmtCount = result.sql.split(";").filter((s) => s.trim()).length;
    const head = result.ok
        ? result.detail === "dry-run"
            ? `Dry run — ${stmtCount} statement(s) would run`
            : `OK — ${result.statements_run} statement(s) executed`
        : `Failed after ${result.statements_run} statement(s): ${result.detail ?? ""}`;
    return (_jsxs("div", { style: {
            fontSize: 11,
            background: result.ok ? "#0f1d17" : "#1a1216",
            padding: 8,
            borderRadius: 6,
            border: `1px solid ${result.ok ? "var(--ok)" : "var(--err)"}`,
            color: result.ok ? "var(--ok)" : "var(--err)",
            display: "grid",
            gap: 6,
        }, children: [_jsx("div", { children: head }), _jsx("pre", { style: {
                    margin: 0,
                    whiteSpace: "pre",
                    color: "var(--text)",
                    maxHeight: 280,
                    overflow: "auto",
                    background: "#0f1115",
                    padding: 8,
                    borderRadius: 4,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }, children: result.sql || "(empty)" })] }));
}
