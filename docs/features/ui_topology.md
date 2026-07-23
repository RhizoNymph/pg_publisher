# ui_topology

## Scope
- React Flow graph visualising:
  - Database nodes (one per saved connection).
  - Publication nodes attached to publisher DBs.
  - Subscription nodes attached to subscriber DBs.
  - Edges from subscription → publication, coloured/animated by current lag.
- Live updates via the `/ws` WebSocket.
- Hover/click opens a detail drawer (handled in `ui_metrics`).

## Non-scope
- Editing topology by drag-and-drop (v2).

## Data / control flow
1. On mount, queries `GET /connections` then `GET /connections/{id}/snapshot` for each.
2. Builds a typed `Topology` model from snapshots.
3. Opens `/ws` and subscribes to all connection IDs; applies deltas to topology + lag map.

## Files
- `frontend/src/views/Topology.tsx`
- `frontend/src/lib/topology.ts` — pure builder from snapshots → `Topology`.
- `frontend/src/lib/ws.ts` — typed WebSocket client.
- `frontend/src/components/PublicationNode.tsx`
- `frontend/src/components/SubscriptionNode.tsx`
- `frontend/src/components/DatabaseNode.tsx`

## Invariants
- All graph state derives deterministically from `(snapshots, latestSamplePerStream)`.
- Edge colour is a pure function of `lag_bytes`/`lag_seconds`.
