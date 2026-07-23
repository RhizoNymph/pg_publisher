# actions

## Scope
- Typed mutations:
  - `CreatePublication(name, tables|all_tables, publish=[insert,update,delete,truncate])`
  - `AlterPublicationAddTable / DropTable`
  - `DropPublication`
  - `CreateSubscription(name, conninfo_ref, publication_names, with_options)`
  - `AlterSubscription(enable|disable|refresh|set_publication|set_conninfo_ref)`
  - `DropSubscription`
- Each action returns a typed result with the SQL that ran (for audit).

## Non-scope
- Bulk multi-DB transactional changes (each action targets a single connection).
- DDL on user tables (publications reference existing tables; we don't create them).

## Data / control flow
1. API receives `ActionRequest` (discriminated union).
2. `actions.execute(connection_id, action)` looks up the pool from the registry.
3. SQL is built with `asyncpg.utils._quote_ident` / explicit identifier quoting; literals via bind params where allowed (DDL forbids most params, so identifiers are validated against a strict regex).
4. Audit log row written to SQLite with timestamp, user-agent (best-effort), action, SQL, outcome.

## Files
- `backend/pg_publisher/actions/models.py` — discriminated union of action types.
- `backend/pg_publisher/actions/executor.py` — `execute()` dispatcher.
- `backend/pg_publisher/actions/identifiers.py` — strict identifier validation.
- `backend/pg_publisher/actions/audit.py` — audit log persistence.

## Invariants
- Identifier inputs must match `^[A-Za-z_][A-Za-z0-9_$]{0,62}$` or wrapped quoting.
- Every executed statement is recorded in the audit log before commit.
- Errors are typed (`IdentifierInvalid`, `ConnectionNotFound`, `PostgresError`).
