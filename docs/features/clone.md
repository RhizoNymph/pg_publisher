# clone

## Scope
- **Clone schema**: copy a schema's structure (tables, constraints, sequences,
  views, functions, etc.) from one Postgres connection to another, optionally
  renaming the schema on the target. Uses `pg_dump --schema-only --no-owner
  --no-privileges --no-publications --no-subscriptions`.
- **Copy indexes**: read `pg_indexes.indexdef` on the source, compare against
  the target's catalog, and create only the indexes the target lacks,
  optionally rewriting schema/table names and adding `IF NOT EXISTS`. Returns
  a per-index report (`created` / `exists` / `conflict` / `failed`) so a run
  that creates nothing is visibly a no-op.
- **Diff indexes**: the same source-vs-target comparison without executing
  anything (`POST /clone/indexes/diff`). Reports indexes missing on the
  target, same-name/different-definition conflicts, identical matches, and
  target-only indexes.

Both mutating operations support a `dry_run` flag that returns the SQL that
would be applied without touching the target.

## Non-scope
- Data copy. Logical replication / `pg_dump --data-only` / `pg_restore` are
  the right tools for moving rows around; this feature exists so the topology
  graph can stand up matching DDL on a fresh subscriber.
- Generic schema-rename heuristics. The regex-based rewrite assumes the
  source schema name is a plain identifier that does not collide with other
  tokens in dollar-quoted function bodies. Renaming `public` is a bad idea.
- Comments and grants (deliberately stripped via `--no-comments`,
  `--no-owner`, `--no-privileges`).

## Data / control flow
1. UI submits a `CloneSchemaRequest` or `CopyIndexesRequest` to
   `POST /clone/schema` or `POST /clone/indexes`.
2. **Clone schema** path:
   1. Resolve source `Connection`; build its libpq conninfo via
      `libpq_conninfo_for`.
   2. Run `pg_dump` as an `asyncio.subprocess`, capture stdout.
   3. If `target_schema != source_schema`, rewrite occurrences of the source
      identifier with a word-boundary regex (`(?<![A-Za-z0-9_])src(?![A-Za-z0-9_])`).
   4. Split the dump into statements honouring `$tag$ … $tag$` dollar-quoting
      so function bodies aren't shredded.
   5. Strip `CREATE SCHEMA src;` (since we want to control whether to emit
      `CREATE SCHEMA IF NOT EXISTS dst`).
   6. Apply statements one by one inside a single transaction on the target
      pool; on `dry_run`, return the assembled SQL without executing.
3. **Copy indexes / diff indexes** path:
   1. Query `pg_indexes` on both source and target (optionally filtered by
      `tablename`).
   2. Rewrite each source `indexdef` (schema, and optionally a single table
      name), then categorise via `_compute_index_diff`:
      - an index whose *definition signature* (statement minus index name,
        minus `IF NOT EXISTS`, whitespace-collapsed) exists on the target
        under any name → `exists`;
      - else a target index with the same *name* but a different definition
        → `conflict` (never touched, only reported);
      - else `missing`.
      Target indexes matched by nothing on the source are `target_only`.
   3. Diff returns the categories as-is. Copy executes only the `missing`
      statements (with `IF NOT EXISTS` injected if requested), one by one,
      continuing past per-index failures; each becomes `created` or `failed`
      in the report. `ok` is true iff nothing failed.

## Files
- `backend/pg_publisher/clone/models.py` — request/result models.
- `backend/pg_publisher/clone/pg_dump.py` — async `pg_dump` wrapper +
  typed errors (`PgDumpUnavailable`, `PgDumpFailed`).
- `backend/pg_publisher/clone/executor.py` — `CloneExecutor.clone_schema`,
  `copy_indexes`, `diff_indexes`, plus the rewrite/split/signature/diff
  helpers (`_rewrite_indexdef`, `_index_signature`, `_compute_index_diff`).
- `backend/pg_publisher/api/clone.py` — `/clone/schema`, `/clone/indexes`,
  `/clone/indexes/diff`.
- `backend/tests/test_index_diff.py` — unit tests for the signature/rewrite/
  diff helpers.
- `frontend/src/views/actions/CloneSchemaModal.tsx` — schema clone form.
- `frontend/src/views/actions/CopyIndexesModal.tsx` — copy/diff form and the
  per-index report rendering.
- `frontend/src/views/actions/Modal.tsx` — shared modal chrome and
  `CloneResultBlock` (schema clone only).

## Invariants
- Schema/table identifiers passed to the executor are validated against the
  same strict identifier regex as the action layer
  (`[A-Za-z_][A-Za-z0-9_]{0,62}`).
- The `pg_dump` binary must be on `PATH`; otherwise the API responds 503
  with a clear message.
- Clone-schema statements run inside a single transaction so a mid-way
  failure leaves the target in its previous state (provided every statement
  is transactional — `CREATE INDEX CONCURRENTLY` is excluded by `--schema-only`).
- Copy-indexes does **not** wrap in a transaction (so partial progress on a
  long index build is preserved), and is idempotent: equivalent-definition
  indexes are detected before execution regardless of name, and
  `if_not_exists` additionally guards against races.
- Copy-indexes never drops or alters an existing target index; `conflict`
  entries require manual resolution.
- Copy-indexes only sees indexes that exist on the **source connection's**
  schema. Hand-tuned indexes created directly on a replica must be copied
  with the replica itself as the source (e.g. replica `prod_1` → replica
  `prod_2`); the diff endpoint exists to make that gap visible.

## Requirements
- The `pg_dump` major version should match the source server's major version
  to avoid catalog-shape surprises; in practice newer client + older server
  is also fine.
