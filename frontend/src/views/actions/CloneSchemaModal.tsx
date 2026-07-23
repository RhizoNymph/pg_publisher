import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cloneSchema, listConnections } from "../../lib/api";
import { CloneResult, Connection } from "../../lib/types";
import { CloneResultBlock, ConnectionSelect, Field, FormBody, Label, Modal } from "./Modal";

export function CloneSchemaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const connections = useMemo<Connection[]>(() => conns.data ?? [], [conns.data]);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sourceSchema, setSourceSchema] = useState("public");
  const [targetSchema, setTargetSchema] = useState("public");
  const [createIfMissing, setCreateIfMissing] = useState(true);
  const [result, setResult] = useState<CloneResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId && connections.length > 0) setSourceId(connections[0].id);
    if (!targetId && connections.length > 0) {
      setTargetId(connections[1]?.id ?? connections[0].id);
    }
  }, [connections, sourceId, targetId]);

  const run = (dry: boolean) =>
    cloneSchema({
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
    onError: (e: Error) => setError(e.message),
  });
  const apply = useMutation({
    mutationFn: () => run(false),
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) qc.invalidateQueries({ queryKey: ["snapshot", targetId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const sameInPlace = sourceId === targetId && sourceSchema === targetSchema;

  return (
    <Modal title="Clone schema" onClose={onClose}>
      <FormBody>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          Runs <code>pg_dump --schema-only --no-owner --no-privileges</code>{" "}
          against the source, optionally renames the schema, and applies the
          resulting DDL on the target. Source and target may be the same
          connection.
        </div>

        <Label>Source connection</Label>
        <ConnectionSelect
          connections={connections}
          value={sourceId}
          onChange={setSourceId}
        />
        <Field label="Source schema" value={sourceSchema} onChange={setSourceSchema} />

        <Label>Target connection</Label>
        <ConnectionSelect
          connections={connections}
          value={targetId}
          onChange={setTargetId}
        />
        <Field
          label="Target schema (use a different name to rename)"
          value={targetSchema}
          onChange={setTargetSchema}
        />

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input
            type="checkbox"
            checked={createIfMissing}
            onChange={(e) => setCreateIfMissing(e.target.checked)}
          />
          Create target schema if it doesn't exist
        </label>

        {sameInPlace ? (
          <div className="lag-warn" style={{ fontSize: 11 }}>
            Source and target are identical — this will try to recreate the
            schema's objects in place and will almost certainly fail. Rename the
            target.
          </div>
        ) : null}

        <CloneResultBlock result={result} error={error} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={
              !sourceId || !targetId || !sourceSchema || !targetSchema || dry.isPending
            }
            onClick={() => {
              setError(null);
              setResult(null);
              dry.mutate();
            }}
          >
            {dry.isPending ? "Dumping…" : "Dry run"}
          </button>
          <button
            disabled={
              !sourceId || !targetId || !sourceSchema || !targetSchema || apply.isPending
            }
            onClick={() => {
              setError(null);
              setResult(null);
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
