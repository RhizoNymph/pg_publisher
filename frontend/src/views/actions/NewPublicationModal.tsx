import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listConnections, listTables, runAction } from "../../lib/api";
import {
  ActionRequest,
  ActionResult,
  Connection,
  PublishOptions,
  TableInfo,
} from "../../lib/types";
import {
  ConnectionSelect,
  Field,
  FormBody,
  Label,
  Modal,
  ResultBlock,
} from "./Modal";

export function NewPublicationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const connections = useMemo<Connection[]>(() => conns.data ?? [], [conns.data]);

  const [targetId, setTargetId] = useState<string>("");
  const [name, setName] = useState("");
  const [schema, setSchema] = useState("public");
  const [allTables, setAllTables] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [publish, setPublish] = useState<PublishOptions>({
    insert: true,
    update: true,
    delete: true,
    truncate: true,
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lock in the first connection once they load.
  useEffect(() => {
    if (!targetId && connections.length > 0) setTargetId(connections[0].id);
  }, [connections, targetId]);

  const tablesQ = useQuery({
    queryKey: ["tables", targetId, schema],
    queryFn: () => listTables(targetId, schema),
    enabled: !!targetId && schema.trim().length > 0,
    retry: false,
  });

  // When the table set changes (target connection or schema), default to
  // every table checked.
  const tableNames = useMemo(
    () => (tablesQ.data ?? []).map((t) => t.table_name),
    [tablesQ.data],
  );
  const tablesKey = tableNames.join("|");
  useEffect(() => {
    setPicked(new Set(tableNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey]);

  const togglePick = (n: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const m = useMutation({
    mutationFn: () => {
      const tables = allTables
        ? []
        : (tablesQ.data ?? [])
            .filter((t: TableInfo) => picked.has(t.table_name))
            .map((t: TableInfo) => ({
              schema_name: t.schema_name,
              table_name: t.table_name,
            }));
      const action: ActionRequest = {
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
      if (res.ok) qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const canSubmit =
    !!targetId && !!name && (allTables || picked.size > 0) && !m.isPending;

  return (
    <Modal title="New publication" onClose={onClose}>
      <FormBody>
        <Label>Target database</Label>
        <ConnectionSelect
          connections={connections}
          value={targetId}
          onChange={setTargetId}
        />

        <Field label="Publication name" value={name} onChange={setName} />

        <Field
          label="Schema"
          value={schema}
          onChange={(v) => {
            setSchema(v);
            setPicked(new Set());
          }}
        />

        <label
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}
        >
          <input
            type="checkbox"
            checked={allTables}
            onChange={(e) => setAllTables(e.target.checked)}
          />
          FOR ALL TABLES
          <span style={{ color: "var(--muted)", fontSize: 11 }}>
            (requires superuser on the target; many managed services don't allow it)
          </span>
        </label>

        {!allTables ? (
          <TablesChecklist
            loading={tablesQ.isPending && tablesQ.fetchStatus !== "idle"}
            error={tablesQ.error}
            tables={tablesQ.data ?? []}
            picked={picked}
            onToggle={togglePick}
            onSelectAll={() => setPicked(new Set(tableNames))}
            onSelectNone={() => setPicked(new Set())}
          />
        ) : null}

        <Label>Publish operations</Label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          {(["insert", "update", "delete", "truncate"] as const).map((k) => (
            <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={publish[k]}
                onChange={(e) => setPublish({ ...publish, [k]: e.target.checked })}
              />
              {k}
            </label>
          ))}
        </div>

        <ResultBlock result={result} error={error} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              setError(null);
              setResult(null);
              m.mutate();
            }}
          >
            {m.isPending ? "Creating…" : "Create publication"}
          </button>
        </div>
      </FormBody>
    </Modal>
  );
}

function TablesChecklist({
  loading,
  error,
  tables,
  picked,
  onToggle,
  onSelectAll,
  onSelectNone,
}: {
  loading: boolean;
  error: unknown;
  tables: TableInfo[];
  picked: Set<string>;
  onToggle: (n: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Tables in schema ({tables.length}, {picked.size} picked)
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onSelectAll}
            style={{ padding: "2px 8px", fontSize: 11 }}
            disabled={tables.length === 0}
          >
            All
          </button>
          <button
            onClick={onSelectNone}
            style={{ padding: "2px 8px", fontSize: 11 }}
            disabled={tables.length === 0}
          >
            None
          </button>
        </div>
      </div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--panel-2)",
          maxHeight: 220,
          overflow: "auto",
          padding: 6,
        }}
      >
        {loading ? (
          <div style={{ fontSize: 11, color: "var(--muted)", padding: 4 }}>Loading…</div>
        ) : error ? (
          <div
            className="lag-err"
            style={{ fontSize: 11, padding: 4, whiteSpace: "pre-wrap" }}
          >
            {(error as Error).message}
          </div>
        ) : tables.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--muted)", padding: 4 }}>
            No tables found in this schema.
          </div>
        ) : (
          tables.map((t) => (
            <label
              key={t.table_name}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
                padding: "2px 4px",
              }}
            >
              <input
                type="checkbox"
                checked={picked.has(t.table_name)}
                onChange={() => onToggle(t.table_name)}
              />
              <span style={{ color: "var(--muted)" }}>{t.schema_name}.</span>
              {t.table_name}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
