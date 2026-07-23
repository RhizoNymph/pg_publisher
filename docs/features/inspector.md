# inspector

## Scope
- Read-only async queries against Postgres catalogs / stat views:
  - `pg_publication`, `pg_publication_tables`
  - `pg_subscription`, `pg_subscription_rel`
  - `pg_stat_replication` (publisher side)
  - `pg_stat_subscription` (subscriber side, PG ≥ 14 `pg_stat_subscription_stats` where available)
  - `pg_replication_slots`
  - `pg_current_wal_lsn()`, `pg_last_wal_receive_lsn()`, `pg_last_wal_replay_lsn()`
- Compute byte lag = `pg_wal_lsn_diff(remote_lsn, local_lsn)`.

## Non-scope
- Mutations (handled by `actions`).
- Time-series storage (handled by `metrics`).

## Data / control flow
1. `Inspector(pool)` is constructed per asyncpg pool.
2. Each method returns a pydantic model (`PublicationRow`, `SubscriptionRow`, `ReplicationStat`, etc.).
3. Queries use only catalogs available to the connecting role; methods raise typed errors when privileges are insufficient.

## Files
- `backend/pg_publisher/inspector/queries.py` — SQL constants.
- `backend/pg_publisher/inspector/models.py` — typed row models.
- `backend/pg_publisher/inspector/service.py` — `Inspector` class.

## Invariants
- All queries are SELECT-only and have a hard statement_timeout (5s).
- Models carry the `connection_id` of the source pool so multi-DB callers can join client-side.
