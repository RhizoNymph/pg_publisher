import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runAction } from "../../lib/api";
import { ActionRequest, ActionResult } from "../../lib/types";
import { FormBody, Modal, ResultBlock } from "./Modal";

export interface DropTarget {
  connectionId: string;
  /** Stream kind as used by the metrics layer. */
  kind: string;
  name: string;
}

/**
 * Two-step delete: the caller opens this modal, the user confirms here, and
 * only then does the DROP run. `onDropped` fires once the server reports ok so
 * the caller can drop its selection of a now-gone object.
 */
export function DropStreamModal({
  target,
  onClose,
  onDropped,
}: {
  target: DropTarget;
  onClose: () => void;
  onDropped: () => void;
}) {
  const qc = useQueryClient();
  const isSubscription = target.kind === "subscription";
  const noun = isSubscription ? "subscription" : "publication";

  const [disableFirst, setDisableFirst] = useState(true);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => {
      const action: ActionRequest = isSubscription
        ? { kind: "drop_subscription", name: target.name, disable_first: disableFirst }
        : { kind: "drop_publication", name: target.name };
      return runAction(target.connectionId, action);
    },
    onSuccess: (res) => {
      setResult(res);
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: ["snapshot", target.connectionId] });
      onDropped();
    },
    onError: (e: Error) => setError(e.message),
  });

  const done = result?.ok === true;

  return (
    <Modal title={`Drop ${noun}`} onClose={onClose} width={520}>
      <FormBody>
        <div style={{ fontSize: 13 }}>
          Drop {noun} <b>{target.name}</b>?
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {isSubscription
            ? "Replication into this database stops immediately. Already-copied rows stay; the subscription cannot be restored without recreating it."
            : "Subscribers pointing at this publication stop receiving changes. Published tables and their data are not touched."}
        </div>

        {isSubscription ? (
          <label
            style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}
          >
            <input
              type="checkbox"
              checked={disableFirst}
              disabled={done}
              onChange={(e) => setDisableFirst(e.target.checked)}
            />
            <span>
              Disable and detach the slot first
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Required when the publisher is unreachable — otherwise DROP hangs.
                Leaves the replication slot on the publisher, which must be dropped
                there by hand.
              </div>
            </span>
          </label>
        ) : null}

        <ResultBlock result={result} error={error} />

        <div
          style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}
        >
          <button onClick={onClose}>{done ? "Close" : "Cancel"}</button>
          {!done ? (
            <button
              disabled={m.isPending}
              style={{ borderColor: "var(--err)", color: "var(--err)" }}
              onClick={() => {
                setError(null);
                setResult(null);
                m.mutate();
              }}
            >
              {m.isPending ? "Dropping…" : `Yes, drop ${noun}`}
            </button>
          ) : null}
        </div>
      </FormBody>
    </Modal>
  );
}
