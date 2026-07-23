import { ReactNode } from "react";
import { ActionResult, CloneResult, Connection } from "../../lib/types";

export function Modal({
  title,
  onClose,
  children,
  width = 560,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          width,
          maxHeight: "90vh",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormBody({ children }: { children: ReactNode }) {
  return <div style={{ padding: 16, display: "grid", gap: 8 }}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{children}</div>
  );
}

export function Field({
  label,
  value,
  onChange,
  help,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  type?: string;
}) {
  return (
    <label style={{ fontSize: 11, color: "var(--muted)" }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
      {help ? (
        <div style={{ fontSize: 10, marginTop: 2, color: "var(--muted)" }}>{help}</div>
      ) : null}
    </label>
  );
}

export function ConnectionSelect({
  connections,
  value,
  onChange,
}: {
  connections: Connection[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} —{" "}
          {c.kind === "structured"
            ? `${c.host}:${c.port}/${c.database}`
            : `dsn $${c.dsn_env}`}
        </option>
      ))}
    </select>
  );
}

export function ResultBlock({
  result,
  error,
}: {
  result: ActionResult | null;
  error: string | null;
}) {
  if (error) {
    return (
      <pre
        className="lag-err"
        style={{
          fontSize: 11,
          background: "#1a1216",
          padding: 8,
          borderRadius: 6,
          whiteSpace: "pre-wrap",
        }}
      >
        {error}
      </pre>
    );
  }
  if (!result) return null;
  return (
    <div
      style={{
        fontSize: 11,
        background: result.ok ? "#0f1d17" : "#1a1216",
        padding: 8,
        borderRadius: 6,
        border: `1px solid ${result.ok ? "var(--ok)" : "var(--err)"}`,
        color: result.ok ? "var(--ok)" : "var(--err)",
      }}
    >
      <div style={{ marginBottom: 4 }}>{result.ok ? "OK" : result.detail ?? "Failed"}</div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text)" }}>
        {result.sql}
      </pre>
    </div>
  );
}

export function CloneResultBlock({
  result,
  error,
}: {
  result: CloneResult | null;
  error: string | null;
}) {
  if (error) {
    return (
      <pre
        className="lag-err"
        style={{
          fontSize: 11,
          background: "#1a1216",
          padding: 8,
          borderRadius: 6,
          whiteSpace: "pre-wrap",
        }}
      >
        {error}
      </pre>
    );
  }
  if (!result) return null;
  const stmtCount = result.sql.split(";").filter((s) => s.trim()).length;
  const head = result.ok
    ? result.detail === "dry-run"
      ? `Dry run — ${stmtCount} statement(s) would run`
      : `OK — ${result.statements_run} statement(s) executed`
    : `Failed after ${result.statements_run} statement(s): ${result.detail ?? ""}`;
  return (
    <div
      style={{
        fontSize: 11,
        background: result.ok ? "#0f1d17" : "#1a1216",
        padding: 8,
        borderRadius: 6,
        border: `1px solid ${result.ok ? "var(--ok)" : "var(--err)"}`,
        color: result.ok ? "var(--ok)" : "var(--err)",
        display: "grid",
        gap: 6,
      }}
    >
      <div>{head}</div>
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre",
          color: "var(--text)",
          maxHeight: 280,
          overflow: "auto",
          background: "#0f1115",
          padding: 8,
          borderRadius: 4,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {result.sql || "(empty)"}
      </pre>
    </div>
  );
}

