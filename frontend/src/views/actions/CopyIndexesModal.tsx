import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { copyIndexes, diffIndexes, listConnections } from "../../lib/api";
import {
  Connection,
  CopyIndexesResult,
  IndexCopyOutcome,
  IndexDefEntry,
  IndexDiffResult,
} from "../../lib/types";
import { ConnectionSelect, Field, FormBody, Label, Modal } from "./Modal";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function DefPre({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        color: "var(--text)",
        background: "#0f1115",
        padding: 6,
        borderRadius: 4,
        fontFamily: MONO,
        fontSize: 10,
      }}
    >
      {children}
    </pre>
  );
}

function OutcomeSection({
  title,
  tone,
  outcomes,
}: {
  title: string;
  tone: "ok" | "muted" | "warn" | "err";
  outcomes: IndexCopyOutcome[];
}) {
  const [open, setOpen] = useState(tone === "warn" || tone === "err");
  if (outcomes.length === 0) return null;
  const color =
    tone === "ok"
      ? "var(--ok)"
      : tone === "err"
        ? "var(--err)"
        : tone === "warn"
          ? "#d9a441"
          : "var(--muted)";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          textAlign: "left",
          background: "none",
          border: "none",
          color,
          fontSize: 11,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? "▾" : "▸"} {title} ({outcomes.length})
      </button>
      {open &&
        outcomes.map((o) => (
          <div key={`${o.table_name}.${o.index_name}`} style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: MONO }}>
              {o.table_name}.{o.index_name}
            </div>
            <DefPre>{o.indexdef}</DefPre>
            {o.status === "conflict" && o.target_indexdef ? (
              <div style={{ fontSize: 10, color }}>
                target has: <DefPre>{o.target_indexdef}</DefPre>
              </div>
            ) : null}
            {o.status === "failed" && o.error ? (
              <div style={{ fontSize: 10, color: "var(--err)" }}>{o.error}</div>
            ) : null}
          </div>
        ))}
    </div>
  );
}

function CopyReportBlock({ result }: { result: CopyIndexesResult }) {
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
  return (
    <div
      style={{
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
      }}
    >
      <div>{head}</div>
      {!dry && result.created === 0 && result.failed === 0 ? (
        <div style={{ color: "#d9a441" }}>
          Nothing was created — the target already had an equivalent of every
          source index. If you expected new indexes, check that the source
          connection/schema actually holds them.
        </div>
      ) : null}
      <OutcomeSection title="Failed" tone="err" outcomes={failed} />
      <OutcomeSection
        title="Conflicts (same name, different definition — not touched)"
        tone="warn"
        outcomes={conflicts}
      />
      <OutcomeSection
        title={dry ? "Would create" : "Created"}
        tone="ok"
        outcomes={dry ? missing : created}
      />
      <OutcomeSection title="Already present" tone="muted" outcomes={exists} />
    </div>
  );
}

function DiffBlock({ diff }: { diff: IndexDiffResult }) {
  const targetOnly: IndexCopyOutcome[] = diff.target_only.map((t: IndexDefEntry) => ({
    table_name: t.table_name,
    index_name: t.index_name,
    status: "exists" as const,
    indexdef: t.indexdef,
  }));
  const clean =
    diff.missing.length === 0 && diff.conflicts.length === 0;
  return (
    <div
      style={{
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
      }}
    >
      <div style={{ color: clean ? "var(--ok)" : "var(--text)" }}>
        {clean
          ? `Target covers every source index (${diff.identical.length} identical)`
          : `Missing on target: ${diff.missing.length} · conflicts: ` +
            `${diff.conflicts.length} · identical: ${diff.identical.length} · ` +
            `target-only: ${diff.target_only.length}`}
      </div>
      <OutcomeSection title="Missing on target" tone="err" outcomes={diff.missing} />
      <OutcomeSection
        title="Conflicts (same name, different definition)"
        tone="warn"
        outcomes={diff.conflicts}
      />
      <OutcomeSection title="Identical" tone="muted" outcomes={diff.identical} />
      <OutcomeSection title="Target only" tone="muted" outcomes={targetOnly} />
    </div>
  );
}

export function CopyIndexesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const connections = useMemo<Connection[]>(() => conns.data ?? [], [conns.data]);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sourceSchema, setSourceSchema] = useState("public");
  const [sourceTable, setSourceTable] = useState("");
  const [targetSchema, setTargetSchema] = useState("public");
  const [targetTable, setTargetTable] = useState("");
  const [ifNotExists, setIfNotExists] = useState(true);
  const [result, setResult] = useState<CopyIndexesResult | null>(null);
  const [diffResult, setDiffResult] = useState<IndexDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId && connections.length > 0) setSourceId(connections[0].id);
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
    onError: (e: Error) => setError(e.message),
  });
  const dry = useMutation({
    mutationFn: () => copyIndexes({ ...reqBase(), if_not_exists: ifNotExists, dry_run: true }),
    onSuccess: setResult,
    onError: (e: Error) => setError(e.message),
  });
  const apply = useMutation({
    mutationFn: () => copyIndexes({ ...reqBase(), if_not_exists: ifNotExists, dry_run: false }),
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const ready = sourceId && targetId && sourceSchema && targetSchema;

  return (
    <Modal title="Copy indexes" onClose={onClose} width={640}>
      <FormBody>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Reads index definitions from <code>pg_indexes</code> on the source and
          creates the ones the target lacks. Indexes whose definition already
          exists on the target (under any name) are skipped and reported; a
          same-named index with a different definition is reported as a
          conflict and never touched. Use <b>Diff</b> to compare without
          changing anything.
        </div>

        <Label>Source connection</Label>
        <ConnectionSelect
          connections={connections}
          value={sourceId}
          onChange={setSourceId}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <Field
            label="Source schema"
            value={sourceSchema}
            onChange={setSourceSchema}
          />
          <Field
            label="Source table (optional)"
            value={sourceTable}
            onChange={setSourceTable}
          />
        </div>

        <Label>Target connection</Label>
        <ConnectionSelect
          connections={connections}
          value={targetId}
          onChange={setTargetId}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <Field
            label="Target schema"
            value={targetSchema}
            onChange={setTargetSchema}
          />
          <div>
            <Label>Target table (only when source table is set)</Label>
            <input
              value={targetTable}
              onChange={(e) => setTargetTable(e.target.value)}
              style={{ width: "100%" }}
              disabled={!sourceTable}
            />
          </div>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={ifNotExists}
            onChange={(e) => setIfNotExists(e.target.checked)}
          />
          Add <code>IF NOT EXISTS</code> to each <code>CREATE INDEX</code>
        </label>

        {error ? (
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
        ) : null}
        {diffResult ? <DiffBlock diff={diffResult} /> : null}
        {result ? <CopyReportBlock result={result} /> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={!ready || diff.isPending}
            onClick={() => {
              clear();
              diff.mutate();
            }}
          >
            {diff.isPending ? "Comparing…" : "Diff"}
          </button>
          <button
            disabled={!ready || dry.isPending}
            onClick={() => {
              clear();
              dry.mutate();
            }}
          >
            {dry.isPending ? "Reading…" : "Dry run"}
          </button>
          <button
            disabled={!ready || apply.isPending}
            onClick={() => {
              clear();
              apply.mutate();
            }}
          >
            {apply.isPending ? "Applying…" : "Apply"}
          </button>
        </div>
      </FormBody>
    </Modal>
  );
}
