# ui_metrics

## Scope
- Detail drawer shown when a node/edge is selected.
- Sparklines (Recharts) for:
  - `lag_bytes` over time
  - `lag_seconds` over time
  - `wal_send_rate` (derived)
- Tabular view of raw catalog rows (publication tables, subscription rels with state).
- Per-table copy state for a selected subscription: lists each table in
  `subscription_rels` with its `pg_subscription_rel.srsubstate` decoded
  (i=initializing, d=copying data, f=finished copy, s=synchronized, r=ready)
  and a ready/total summary.

## Non-scope
- Historical analysis / aggregation queries (v2).

## Data / control flow
1. On select, fetches `GET /connections/{id}/history?metric=lag_bytes&since=-15m`.
2. Subscribes to live samples for that stream and appends to the chart series.
3. For subscription selections, reads `subscription_rels` from the snapshot
   query (`["snapshot", connectionId]`, shared with the Topology view's cache,
   5s refetch) filtered to the selected subscription name.

## Files
- `frontend/src/views/MetricsPanel.tsx`
- `frontend/src/components/Sparkline.tsx`

## Invariants
- Chart series is bounded (e.g. 600 points); older points are dropped client-side.
- Time axis uses UTC consistently.
