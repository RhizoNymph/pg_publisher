```yaml
Overview:
  description: |
    pg_publisher is a local GUI for managing Postgres logical-replication
    publications and subscriptions across multiple databases. It visualises
    the publication/subscription topology and shows live replication lag
    and related metrics. Mutations (CREATE/ALTER/DROP PUBLICATION,
    SUBSCRIPTION) are exposed as confirmable typed actions.
  subsystems:
    connections:
      role: Persist saved DB connections and provide async connection pools.
      tech: aiosqlite for config, asyncpg pools per target DB.
    inspector:
      role: Run read-only catalog/stat-view queries to discover topology and lag.
      tech: asyncpg + typed pydantic result models.
    metrics:
      role: Periodically sample inspector views, compute lag, retain history.
      tech: asyncio tasks, in-memory ring buffer per (connection, slot/sub), SQLite for durable history.
    api:
      role: Expose REST for CRUD/snapshot and WebSocket for live ticks.
      tech: FastAPI + uvicorn + pydantic.
    actions:
      role: Typed mutations against publisher/subscriber DBs with confirmation.
      tech: asyncpg, validation via pydantic.
    clone:
      role: Schema clone (via pg_dump), index copy with per-index outcome reporting, and source/target index diff between connections.
      tech: asyncio subprocess + asyncpg.
    ui:
      role: Render topology graph, detail drawers, sparklines, and action forms.
      tech: React + Vite + TypeScript + React Flow + Recharts + TanStack Query.
  data_flow: |
    1. User saves connections via UI → REST → connections store (SQLite).
    2. metrics sampler opens an asyncpg pool per connection, polls inspector
       queries on a fixed interval, writes samples to ring buffer + SQLite.
    3. UI subscribes via WebSocket; api layer multiplexes ring-buffer deltas
       to all subscribed clients.
    4. UI mutations call REST → actions → asyncpg → catalogs change; next
       sampler tick picks up the new topology automatically.

Features Index:
  connections:
    description: Manage saved Postgres connections (CRUD, test, env-var secrets).
    entry_points: [backend/pg_publisher/connections/, backend/pg_publisher/api/connections.py]
    depends_on: [store]
    doc: docs/features/connections.md
  inspector:
    description: Read-only catalog and stat-view queries for pubs/subs/lag.
    entry_points: [backend/pg_publisher/inspector/]
    depends_on: [connections]
    doc: docs/features/inspector.md
  metrics:
    description: Periodic sampler, ring buffer, lag computation, history persistence.
    entry_points: [backend/pg_publisher/metrics/]
    depends_on: [inspector, store]
    doc: docs/features/metrics.md
  api:
    description: REST + WebSocket layer over the other subsystems.
    entry_points: [backend/pg_publisher/api/]
    depends_on: [connections, inspector, metrics, actions]
    doc: docs/features/api.md
  actions:
    description: Typed publication/subscription mutations.
    entry_points: [backend/pg_publisher/actions/]
    depends_on: [connections]
    doc: docs/features/actions.md
  clone:
    description: Schema clone via pg_dump + index copy (per-index created/exists/conflict/failed report) and index diff between connections.
    entry_points: [backend/pg_publisher/clone/, backend/pg_publisher/api/clone.py]
    depends_on: [connections]
    doc: docs/features/clone.md
  ui_topology:
    description: Visual topology of databases, publications, subscriptions, and lag.
    entry_points: [frontend/src/views/Topology.tsx]
    depends_on: [api]
    doc: docs/features/ui_topology.md
  ui_metrics:
    description: |
      Sparklines (numbered axes) and detail panels for replication lag /
      throughput, per-table copy state for subscriptions, and confirmed
      dropping of the selected publication/subscription.
    entry_points:
      - frontend/src/views/MetricsPanel.tsx
      - frontend/src/views/actions/DropStreamModal.tsx
    depends_on: [api]
    doc: docs/features/ui_metrics.md
```
