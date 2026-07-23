from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

_Identifier = Annotated[str, Field(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CloneSchemaRequest(_Base):
    """Clone a schema's structure (no data, no owners, no privileges) from one
    Postgres connection to another, optionally renaming it.
    """

    source_connection_id: UUID
    source_schema: _Identifier
    target_connection_id: UUID
    target_schema: _Identifier
    create_schema_if_missing: bool = True
    dry_run: bool = False


class CopyIndexesRequest(_Base):
    """Copy index definitions from one schema/table to another.

    Reads `pg_indexes.indexdef` on the source and replays it on the target,
    optionally rewriting the schema and/or table name.
    """

    source_connection_id: UUID
    source_schema: _Identifier
    source_table: _Identifier | None = None
    target_connection_id: UUID
    target_schema: _Identifier
    target_table: _Identifier | None = None
    if_not_exists: bool = True
    dry_run: bool = False


class DiffIndexesRequest(_Base):
    """Compare index definitions between a source and a target schema/table
    without changing anything."""

    source_connection_id: UUID
    source_schema: _Identifier
    source_table: _Identifier | None = None
    target_connection_id: UUID
    target_schema: _Identifier
    target_table: _Identifier | None = None


class IndexDef(_Base):
    schema_name: str
    table_name: str
    index_name: str
    indexdef: str


IndexCopyStatus = Literal["missing", "created", "exists", "conflict", "failed"]
"""Per-index outcome.

- ``missing``: absent on target (diff / dry-run only — a copy turns these
  into ``created`` or ``failed``).
- ``created``: successfully created on the target.
- ``exists``: the target already has an index with an identical definition
  (the name may differ).
- ``conflict``: the target has an index with the same name but a different
  definition; it is never touched, only reported.
- ``failed``: the CREATE INDEX errored on the target.
"""


class IndexCopyOutcome(_Base):
    table_name: str
    index_name: str
    status: IndexCopyStatus
    indexdef: str
    target_indexdef: str | None = None
    error: str | None = None


class CopyIndexesResult(_Base):
    ok: bool
    created: int
    exists: int
    conflicts: int
    failed: int
    sql: str
    outcomes: list[IndexCopyOutcome]
    detail: str | None = None


class IndexDiffResult(_Base):
    missing: list[IndexCopyOutcome]
    conflicts: list[IndexCopyOutcome]
    identical: list[IndexCopyOutcome]
    target_only: list[IndexDef]


class CloneResult(_Base):
    ok: bool
    statements_run: int
    sql: str
    detail: str | None = None
