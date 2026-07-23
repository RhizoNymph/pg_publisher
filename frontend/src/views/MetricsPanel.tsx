import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHistory, getSnapshot } from "../lib/api";
import { MetricSample, SubscriptionRel, WSSamplePayload } from "../lib/types";
import { liveSocket } from "../lib/ws";
import { Sparkline } from "../components/Sparkline";
import { formatBytes } from "../lib/topology";

interface Props {
  selected: { connectionId: string; kind: string; name: string } | null;
}

// srsubstate codes from pg_subscription_rel.
const REL_STATES: Record<string, { label: string; className: string }> = {
  i: { label: "initializing", className: "lag-warn" },
  d: { label: "copying data", className: "lag-warn" },
  f: { label: "finished copy", className: "lag-warn" },
  s: { label: "synchronized", className: "lag-ok" },
  r: { label: "ready", className: "lag-ok" },
};

function SubscriptionTables({ rels }: { rels: SubscriptionRel[] }) {
  const ready = rels.filter((r) => r.state === "r").length;
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        Tables ({ready}/{rels.length} ready)
      </div>
      {rels.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          No tables tracked by this subscription.
        </div>
      ) : (
        <div className="kv">
          {rels.map((r) => {
            const st = REL_STATES[r.state] ?? { label: r.state, className: "" };
            return (
              <Fragment key={`${r.schema_name}.${r.table_name}`}>
                <span className="k" style={{ overflowWrap: "anywhere" }}>
                  {r.schema_name}.{r.table_name}
                </span>
                <span className={st.className}>{st.label}</span>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MetricsPanel({ selected }: Props) {
  const [live, setLive] = useState<MetricSample[]>([]);

  const history = useQuery({
    queryKey: ["history", selected?.connectionId, selected?.kind, selected?.name],
    queryFn: () =>
      selected
        ? getHistory(selected.connectionId, 15, selected.kind, selected.name)
        : Promise.resolve([] as MetricSample[]),
    enabled: !!selected,
  });

  // Same key/interval as Topology's snapshot queries so the cache is shared.
  const snapshot = useQuery({
    queryKey: ["snapshot", selected?.connectionId],
    queryFn: () => getSnapshot(selected!.connectionId),
    enabled: !!selected && selected.kind === "subscription",
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    setLive([]);
    if (!selected) return;
    const off = liveSocket.onSample((p: WSSamplePayload) => {
      if (p.connection_id !== selected.connectionId) return;
      const ours = p.samples.filter(
        (s) => s.stream_kind === selected.kind && s.stream_name === selected.name,
      );
      if (ours.length === 0) return;
      setLive((prev) => [...prev, ...ours].slice(-600));
    });
    return off;
  }, [selected]);

  if (!selected) {
    return (
      <div className="detail">
        <div className="empty">Click a publication or subscription to inspect.</div>
      </div>
    );
  }

  const series: MetricSample[] = [...(history.data ?? []), ...live];
  const bytesPoints = series.map((s) => ({
    t: s.sampled_at,
    v: s.lag_bytes ?? null,
  }));
  const secondsPoints = series.map((s) => ({
    t: s.sampled_at,
    v: s.lag_seconds ?? null,
  }));

  const last = series[series.length - 1];

  const rels =
    selected.kind === "subscription"
      ? (snapshot.data?.subscription_rels ?? []).filter(
          (r) => r.subscription === selected.name,
        )
      : null;

  return (
    <div className="detail">
      <div className="section-title">{selected.kind} · {selected.name}</div>
      <div className="kv" style={{ padding: 8 }}>
        <span className="k">Lag (bytes)</span>
        <span>{last?.lag_bytes != null ? formatBytes(last.lag_bytes) : "—"}</span>
        <span className="k">Lag (seconds)</span>
        <span>{last?.lag_seconds != null ? last.lag_seconds.toFixed(3) : "—"}</span>
        <span className="k">State</span>
        <span>{last?.state ?? "—"}</span>
        <span className="k">Samples</span>
        <span>{series.length}</span>
      </div>

      {rels !== null ? <SubscriptionTables rels={rels} /> : null}

      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
          Lag bytes
        </div>
        <Sparkline points={bytesPoints} yLabel="bytes" color="#7aa2ff" />
        <div style={{ fontSize: 11, color: "var(--muted)", margin: "12px 0 4px" }}>
          Lag seconds
        </div>
        <Sparkline points={secondsPoints} yLabel="seconds" color="#ffcc66" />
      </div>
    </div>
  );
}
