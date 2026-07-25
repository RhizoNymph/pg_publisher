# ui_metrics

## Scope
- Detail drawer shown when a node/edge is selected. Panel order, top to bottom:
  header (+ Drop button) → latest-value key/values → sparklines → table
  readiness list.
- Sparklines (Recharts) for:
  - `lag_bytes` over time
  - `lag_seconds` over time
  - `wal_send_rate` (derived)
  Both axes are labelled with numbers: the x axis with UTC clock ticks, the y
  axis with values run through the series' own formatter (bytes → `1.2 MiB`,
  seconds → `0.35s`).
- Tabular view of raw catalog rows (publication tables, subscription rels with state).
- Per-table copy state for a selected subscription: lists each table in
  `subscription_rels` with its `pg_subscription_rel.srsubstate` decoded
  (i=initializing, d=copying data, f=finished copy, s=synchronized, r=ready)
  and a ready/total summary.
- Dropping the selected publication / subscription, behind a confirmation modal.

## Non-scope
- Historical analysis / aggregation queries (v2).
- Any mutation other than DROP (creates live in the topbar modals).

## Data / control flow
1. On select, fetches `GET /connections/{id}/history?metric=lag_bytes&since=-15m`.
2. Subscribes to live samples for that stream and appends to the chart series.
3. For subscription selections, reads `subscription_rels` from the snapshot
   query (`["snapshot", connectionId]`, shared with the Topology view's cache,
   5s refetch) filtered to the selected subscription name.
4. Drop flow: `Drop` opens `DropStreamModal`, which requires an explicit
   confirmation click before `POST /actions/{connectionId}` runs
   `drop_publication` / `drop_subscription`. On success it invalidates
   `["snapshot", connectionId]` and shows the executed SQL; closing the modal
   clears the App's stream selection (the object no longer exists).

## Files
- `frontend/src/views/MetricsPanel.tsx` — panel layout, selection lifecycle,
  drop-modal state.
- `frontend/src/components/Sparkline.tsx` — `Sparkline` (props: `points`,
  `height`, `yLabel`, `color`, `formatValue`).
- `frontend/src/views/actions/DropStreamModal.tsx` — `DropStreamModal`
  (props: `target`, `onClose`, `onDropped`), the confirmation step.
- `frontend/src/App.tsx` — owns the selected stream; clears it via `onDropped`.

## Invariants
- Chart series is bounded (e.g. 600 points); older points are dropped client-side.
- Time axis uses UTC consistently — including the rendered x-axis ticks and the
  tooltip label, which are formatted with `timeZone: "UTC"`.
- A DROP never runs from a single click: the modal's confirm button is the only
  caller of `runAction`.
- Selection is cleared only after the user closes the drop modal, so the result
  SQL stays on screen.
