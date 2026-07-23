# api

## Scope
- REST endpoints:
  - `GET/POST/PATCH/DELETE /connections`
  - `POST /connections/{id}/test`
  - `GET /connections/{id}/snapshot` — current pubs/subs/lag
  - `GET /connections/{id}/history?metric=lag_bytes&since=…`
  - `POST /actions/...` (see actions feature)
- WebSocket `/ws`:
  - Client → server: `{type:"subscribe", connection_ids:[…]}` / `{type:"unsubscribe", …}`
  - Server → client: `{type:"sample", connection_id, sample}` on each new sample.

## Non-scope
- AuthN/AuthZ (local-only tool for now).
- Multi-user concurrency control.

## Data / control flow
1. FastAPI app instantiated in `backend/pg_publisher/api/app.py`.
2. Routers in `connections.py`, `snapshot.py`, `actions.py`, `ws.py`.
3. WS hub holds a `set[WebSocket]` per connection_id and pushes `MetricsSupervisor` events to subscribers.

## Files
- `backend/pg_publisher/api/app.py` — FastAPI factory; mounts routers and lifespan.
- `backend/pg_publisher/api/connections.py`
- `backend/pg_publisher/api/snapshot.py`
- `backend/pg_publisher/api/actions.py`
- `backend/pg_publisher/api/ws.py`
- `backend/pg_publisher/api/deps.py` — DI providers (store, registry, supervisor).

## Invariants
- All payloads validated by pydantic; no untyped dicts cross the boundary.
- WS messages are JSON with an explicit `type` discriminator.
