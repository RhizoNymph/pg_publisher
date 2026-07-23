import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSnapshot, listConnections, runAction } from "../../lib/api";
import {
  ActionRequest,
  ActionResult,
  Connection,
  SnapshotPayload,
} from "../../lib/types";
import {
  ConnectionSelect,
  Field,
  FormBody,
  Label,
  Modal,
  ResultBlock,
} from "./Modal";

export function NewSubscriptionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const conns = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const connections = useMemo<Connection[]>(() => conns.data ?? [], [conns.data]);

  const snapQueries = useQueries({
    queries: connections.map((c) => ({
      queryKey: ["snapshot", c.id],
      queryFn: () => getSnapshot(c.id),
      refetchInterval: 10_000,
      retry: false,
    })),
  });
  const snapshots = useMemo(() => {
    const m: Record<string, SnapshotPayload | undefined> = {};
    connections.forEach((c, i) => {
      m[c.id] = snapQueries[i]?.data;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, snapQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const [subscriberId, setSubscriberId] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState(true);
  const [createSlot, setCreateSlot] = useState(true);
  const [copyData, setCopyData] = useState(true);
  const [slotName, setSlotName] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subscriberId && connections.length > 0) setSubscriberId(connections[0].id);
    if (!publisherId && connections.length > 0) {
      setPublisherId(connections[1]?.id ?? connections[0].id);
    }
  }, [connections, subscriberId, publisherId]);

  const pubOptions = useMemo(
    () => snapshots[publisherId]?.publications.map((p) => p.name) ?? [],
    [snapshots, publisherId],
  );

  const togglePub = (n: string) => {
    const next = new Set(picked);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setPicked(next);
  };

  const m = useMutation({
    mutationFn: () => {
      const action: ActionRequest = {
        kind: "create_subscription",
        name,
        publisher_connection_id: publisherId,
        publications: [...picked],
        enabled,
        create_slot: createSlot,
        copy_data: copyData,
        slot_name: slotName.trim() ? slotName.trim() : null,
      };
      return runAction(subscriberId, action);
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["snapshot", subscriberId] });
        qc.invalidateQueries({ queryKey: ["snapshot", publisherId] });
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const sameSrcDst = publisherId === subscriberId;
  const canSubmit =
    !!subscriberId && !!publisherId && !!name && picked.size > 0 && !m.isPending;

  return (
    <Modal title="New subscription" onClose={onClose}>
      <FormBody>
        <Label>Subscriber database (where the SUBSCRIPTION is created)</Label>
        <ConnectionSelect
          connections={connections}
          value={subscriberId}
          onChange={setSubscriberId}
        />

        <Label>Publisher database (CONNECTION target)</Label>
        <ConnectionSelect
          connections={connections}
          value={publisherId}
          onChange={(id) => {
            setPublisherId(id);
            setPicked(new Set());
          }}
        />
        {sameSrcDst ? (
          <div className="lag-warn" style={{ fontSize: 11 }}>
            Subscriber and publisher are the same database. That works for testing
            but is rarely useful in production.
          </div>
        ) : null}

        <Field label="Subscription name" value={name} onChange={setName} />

        <Label>Publications to subscribe to</Label>
        {pubOptions.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            No publications visible on the selected publisher yet (try again after
            its snapshot lands, or create one first).
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            {pubOptions.map((p) => (
              <label key={p} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={picked.has(p)}
                  onChange={() => togglePub(p)}
                />
                {p}
              </label>
            ))}
          </div>
        )}

        <Label>Options</Label>
        <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={createSlot}
              onChange={(e) => setCreateSlot(e.target.checked)}
            />
            Create replication slot on publisher
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={copyData}
              onChange={(e) => setCopyData(e.target.checked)}
            />
            Copy existing data
          </label>
        </div>

        <Field
          label="Slot name (optional — defaults to the subscription name)"
          value={slotName}
          onChange={setSlotName}
        />

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
            {m.isPending ? "Creating…" : "Create subscription"}
          </button>
        </div>
      </FormBody>
    </Modal>
  );
}
