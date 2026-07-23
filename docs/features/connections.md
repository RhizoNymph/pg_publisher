# connections

## Scope
- Persist user-saved Postgres connections in two interchangeable shapes:
  - **structured**: explicit `host`, `port`, `database`, `username`,
    `password_env`, `ssl_mode`.
  - **dsn**: a single `dsn_env` env-var name whose value is a libpq DSN
    (URI form `postgres://user:pw@host:port/db?…` or keyword=value form).
- Provide an async connection-pool registry keyed by connection id.
- "Test connection" endpoint validates credentials and reachability.

## Non-scope
- Secret rotation, full credential vaulting. Secrets live entirely in env
  vars; only env-var *names* are persisted.
- Mutating connection parameters in place: `PATCH /connections/{id}` only
  changes `name` and `role`. To change anything else, delete and re-create
  (preserves a single source of truth in the discriminated row).

## Data / control flow
1. UI submits a `StructuredCreate` or `DsnCreate` (discriminated by `kind`).
2. `ConnectionStore` writes the row to SQLite. A `CHECK` constraint enforces
   that exactly one set of kind-specific columns is populated.
3. `ConnectionRegistry` lazily creates an `asyncpg.Pool` on first use:
   - structured → `create_pool(host=…, password=$env, …)`
   - dsn → `create_pool(dsn=$env)`
   Pools are cached by connection id and evicted on delete.
4. For `CREATE SUBSCRIPTION`, `libpq_conninfo_for(conn)` materialises the
   `CONNECTION '…'` literal — keyword=value form for structured, raw DSN
   pass-through for dsn rows.

## Files
- `backend/pg_publisher/connections/models.py` — discriminated union
  (`StructuredCreate | DsnCreate` → `ConnectionCreate`,
   `StructuredConnection | DsnConnection` → `Connection`), `ConnectionUpdate`.
- `backend/pg_publisher/connections/store.py` — `ConnectionStore` (aiosqlite),
  row → model decoder that branches on `kind`.
- `backend/pg_publisher/connections/registry.py` — `ConnectionRegistry`
  (asyncpg pool cache, kind-aware pool construction).
- `backend/pg_publisher/connections/libpq.py` — `libpq_conninfo_for(conn)`
  for downstream consumers (CREATE SUBSCRIPTION).
- `backend/pg_publisher/store/schema.py` — the SQLite schema with the
  per-kind nullability `CHECK`.

## Invariants
- Connection IDs are UUIDv4, stable for the lifetime of the row.
- A row is either fully structured or fully dsn; the SQLite `CHECK`
  guarantees no half-populated rows can exist.
- The registry never holds a pool whose underlying row has been deleted.
- No secret value (password or full DSN) is ever persisted; only env-var
  names are stored.
