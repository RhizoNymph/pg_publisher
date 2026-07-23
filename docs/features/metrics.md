# metrics

## Scope
- Per-connection background sampler running at a configurable interval (default 2s).
- Compute replication lag (bytes + seconds) per slot / subscription.
- Keep N most-recent samples in memory for fast snapshot fetches and WS pushes.
- Persist samples to SQLite for sparkline history beyond the in-memory window.

## Non-scope
- Long-term TSDB / Prometheus exposition (future; can be added behind an exporter interface).
- Alerting.

## Data / control flow
1. `MetricsSupervisor.start()` spawns one `Sampler` task per known connection.
2. Each `Sampler` loop:
   a. Calls `Inspector` methods.
   b. Builds `MetricSample` records (publisher slots + subscriber subs).
   c. Pushes to in-memory `RingBuffer` and to SQLite via batched insert.
   d. Emits an `asyncio.Queue` event consumed by the WebSocket fan-out.
3. On connection add/remove, supervisor adjusts the running task set.

## Files
- `backend/pg_publisher/metrics/models.py` — `MetricSample`, `LagSnapshot`.
- `backend/pg_publisher/metrics/sampler.py` — `Sampler` task.
- `backend/pg_publisher/metrics/supervisor.py` — `MetricsSupervisor`.
- `backend/pg_publisher/metrics/ring.py` — typed ring buffer.
- `backend/pg_publisher/metrics/history.py` — SQLite persistence.

## Invariants
- A sampler never overlaps itself; if a tick takes longer than the interval, the next tick is skipped (warn log).
- Ring buffer size is bounded; oldest samples are dropped, not the newest.
- All time fields are UTC `datetime` with tzinfo.
