import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConnection,
  deleteConnection,
  listConnections,
  testConnection,
} from "../lib/api";
import { Connection, ConnectionCreate, Role } from "../lib/types";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function describe(c: Connection): string {
  if (c.kind === "structured") {
    return `${c.host}:${c.port}/${c.database} (${c.role})`;
  }
  return `dsn → $${c.dsn_env} (${c.role})`;
}

export function ConnectionsList({ selectedId, onSelect }: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const [showForm, setShowForm] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
  const test = useMutation({ mutationFn: (id: string) => testConnection(id) });

  return (
    <div className="sidebar">
      <div className="btn-row">
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add connection"}
        </button>
      </div>
      {showForm ? (
        <ConnectionForm
          onCreated={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["connections"] });
          }}
        />
      ) : null}

      <div className="section-title">Connections</div>
      {q.data?.length === 0 ? (
        <div style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>
          None yet — click <i>+ Add connection</i>.
        </div>
      ) : null}
      {q.data?.map((c: Connection) => (
        <div
          key={c.id}
          className={`conn-item${selectedId === c.id ? " selected" : ""}`}
          onClick={() => onSelect(c.id)}
        >
          <div className="name">{c.name}</div>
          <div className="meta">{describe(c)}</div>
          <div className="btn-row" style={{ padding: 0, border: 0, marginTop: 4 }}>
            <button onClick={(e) => { e.stopPropagation(); test.mutate(c.id); }}>
              Test
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete connection ${c.name}?`)) del.mutate(c.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type Mode = "structured" | "dsn";

function ConnectionForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<Mode>("structured");
  const [role, setRole] = useState<Role>("auto");
  const [name, setName] = useState("");

  // structured-only fields
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("postgres");
  const [username, setUsername] = useState("postgres");
  const [passwordEnv, setPasswordEnv] = useState("");

  // dsn-only field
  const [dsnEnv, setDsnEnv] = useState("");

  const [err, setErr] = useState<string | null>(null);

  const buildPayload = (): ConnectionCreate => {
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
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div style={{ padding: 12, display: "grid", gap: 6, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => setMode("structured")}
          style={{
            flex: 1,
            background: mode === "structured" ? "var(--accent)" : undefined,
            color: mode === "structured" ? "#0f1115" : undefined,
          }}
        >
          Structured
        </button>
        <button
          onClick={() => setMode("dsn")}
          style={{
            flex: 1,
            background: mode === "dsn" ? "var(--accent)" : undefined,
            color: mode === "dsn" ? "#0f1115" : undefined,
          }}
        >
          DSN env var
        </button>
      </div>

      <Field label="Name" value={name} onChange={setName} />

      {mode === "structured" ? (
        <>
          <Field label="Host" value={host} onChange={setHost} />
          <Field
            label="Port"
            value={String(port)}
            onChange={(v) => setPort(parseInt(v) || 5432)}
          />
          <Field label="Database" value={database} onChange={setDatabase} />
          <Field label="Username" value={username} onChange={setUsername} />
          <Field
            label="Password env var"
            value={passwordEnv}
            onChange={setPasswordEnv}
          />
        </>
      ) : (
        <>
          <Field
            label="DSN env var"
            value={dsnEnv}
            onChange={setDsnEnv}
            help="Name of an env var holding a libpq DSN, e.g. PGP_CONN_PRIMARY_DSN. Accepts postgres://… URI or keyword=value form."
          />
        </>
      )}

      <label style={{ fontSize: 11, color: "var(--muted)" }}>
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={{ width: "100%" }}
        >
          <option value="auto">auto</option>
          <option value="publisher">publisher</option>
          <option value="subscriber">subscriber</option>
        </select>
      </label>

      {err ? <div className="lag-err" style={{ fontSize: 11 }}>{err}</div> : null}
      <button onClick={() => { setErr(null); m.mutate(); }} disabled={m.isPending}>
        {m.isPending ? "Creating…" : "Create"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <label style={{ fontSize: 11, color: "var(--muted)" }}>
      {label}
      <input
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
