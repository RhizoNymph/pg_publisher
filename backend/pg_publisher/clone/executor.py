from __future__ import annotations

import re
from uuid import UUID

import asyncpg

from pg_publisher.actions.identifiers import quote_identifier, validate_identifier
from pg_publisher.clone.models import (
    CloneResult,
    CloneSchemaRequest,
    CopyIndexesRequest,
    CopyIndexesResult,
    DiffIndexesRequest,
    IndexCopyOutcome,
    IndexDef,
    IndexDiffResult,
)
from pg_publisher.clone.pg_dump import dump_schema
from pg_publisher.connections import ConnectionRegistry, ConnectionStore
from pg_publisher.logging import log


def _rewrite_schema_in_dump(sql: str, src: str, dst: str) -> str:
    """Rewrite an unquoted schema identifier in pg_dump output.

    Uses a word-boundary regex on the bare source schema name. This works for
    typical lowercase identifiers used by pg_dump's output; renaming a schema
    whose name appears as a literal token inside a function body would also
    be rewritten and is a known limitation.
    """
    if src == dst:
        return sql
    pattern = re.compile(rf"(?<![A-Za-z0-9_]){re.escape(src)}(?![A-Za-z0-9_])")
    return pattern.sub(dst, sql)


def _is_comment_only(stmt: str) -> bool:
    """True if every non-blank line is a `--` line comment.

    Such "statements" (e.g. pg_dump's trailing "dump complete" banner) yield
    EmptyQueryResponse from the server, which asyncpg's simple-query path
    can't handle, so they must not be executed.
    """
    for line in stmt.splitlines():
        s = line.strip()
        if s and not s.startswith("--"):
            return False
    return True


def _split_statements(sql: str) -> list[str]:
    """Split pg_dump output into individual SQL statements.

    A `;` only terminates a statement outside of: dollar-quoted bodies
    (`$$`/`$tag$`), `--` line comments (pg_dump banners contain semicolons,
    e.g. `-- Name: t; Type: TABLE; ...`), single-quoted literals, and
    double-quoted identifiers.

    Lines starting with a backslash (outside dollar-quoted bodies) are psql
    meta-commands — pg_dump 16.10/17.6+ emits `\\restrict`/`\\unrestrict`
    guards — and are dropped, since the server would reject them. Chunks
    containing only comments are dropped for the same reason.
    """
    out: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    dollar_tag = ""

    def flush() -> None:
        stmt = "".join(buf).strip()
        if stmt and not _is_comment_only(stmt):
            out.append(stmt)
        buf.clear()

    while i < n:
        ch = sql[i]
        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = ""
            else:
                buf.append(ch)
                i += 1
            continue
        if ch == "\\" and (i == 0 or sql[i - 1] == "\n"):
            # psql meta-command line; skip through end of line.
            nl = sql.find("\n", i)
            i = n if nl == -1 else nl + 1
            continue
        if ch == "-" and sql.startswith("--", i):
            # Line comment: copy verbatim so a `;` inside doesn't split.
            nl = sql.find("\n", i)
            end = n if nl == -1 else nl + 1
            buf.append(sql[i:end])
            i = end
            continue
        if ch in ("'", '"'):
            # Quoted literal/identifier; a doubled quote is an escape.
            j = i + 1
            while j < n:
                if sql[j] == ch:
                    if j + 1 < n and sql[j + 1] == ch:
                        j += 2
                        continue
                    break
                j += 1
            end = min(j + 1, n)
            buf.append(sql[i:end])
            i = end
            continue
        if ch == "$":
            # Look for $tag$ — capture the tag if any.
            m = re.match(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
            if m:
                dollar_tag = m.group(0)
                buf.append(dollar_tag)
                i += len(dollar_tag)
                continue
        if ch == ";":
            flush()
            i += 1
            continue
        buf.append(ch)
        i += 1
    flush()
    return out


def _without_leading_comments(stmt: str) -> str:
    """Strip leading `--` comment lines (statements keep their pg_dump
    banner comments attached)."""
    lines = stmt.splitlines()
    i = 0
    while i < len(lines) and (not lines[i].strip() or lines[i].lstrip().startswith("--")):
        i += 1
    return "\n".join(lines[i:])


def _strip_create_schema(stmts: list[str], schema: str) -> list[str]:
    """Drop `CREATE SCHEMA <schema>;` if present (we create it ourselves)."""
    bare = re.compile(
        rf"^\s*CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?{re.escape(schema)}\s*$",
        re.IGNORECASE,
    )
    quoted = re.compile(
        rf'^\s*CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?"{re.escape(schema)}"\s*$',
        re.IGNORECASE,
    )
    out: list[str] = []
    for s in stmts:
        body = _without_leading_comments(s)
        if bare.match(body) or quoted.match(body):
            continue
        out.append(s)
    return out


_INDEX_DEFS_SQL = """
SELECT schemaname AS schema_name,
       tablename  AS table_name,
       indexname  AS index_name,
       indexdef
FROM pg_indexes
WHERE schemaname = $1
"""

_INDEX_DEFS_SQL_TABLE = _INDEX_DEFS_SQL + " AND tablename = $2"

_CREATE_INDEX_RE = re.compile(
    r'^\s*CREATE\s+(?P<unique>UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?'
    r'(?P<name>"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\s+(?P<rest>ON\b.*)$',
    re.IGNORECASE | re.DOTALL,
)


def _rewrite_indexdef(
    indexdef: str,
    source_schema: str,
    target_schema: str,
    source_table: str | None,
    target_table: str | None,
) -> str:
    """Rewrite schema (and optionally a single table name) references in a
    `pg_indexes.indexdef` statement, using the same word-boundary regex as
    the schema clone."""
    sql = indexdef
    if target_schema != source_schema:
        sql = re.sub(
            rf"(?<![A-Za-z0-9_]){re.escape(source_schema)}(?![A-Za-z0-9_])",
            target_schema,
            sql,
        )
    if source_table and target_table and target_table != source_table:
        sql = re.sub(
            rf"(?<![A-Za-z0-9_]){re.escape(source_table)}(?![A-Za-z0-9_])",
            target_table,
            sql,
        )
    return sql


def _inject_if_not_exists(indexdef: str) -> str:
    return re.sub(
        r"^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\b)",
        lambda m: f"CREATE {m.group(1) or ''}INDEX IF NOT EXISTS ",
        indexdef,
        count=1,
        flags=re.IGNORECASE,
    )


def _index_signature(indexdef: str) -> str:
    """A comparison key for an index definition: the statement with the index
    name and any IF NOT EXISTS removed and whitespace collapsed. Two indexes
    with equal signatures are structurally identical regardless of name."""
    m = _CREATE_INDEX_RE.match(indexdef)
    if m is None:
        return re.sub(r"\s+", " ", indexdef).strip()
    unique = "UNIQUE " if m.group("unique") else ""
    rest = re.sub(r"\s+", " ", m.group("rest")).strip()
    return f"CREATE {unique}INDEX {rest}"


def _index_name_of(indexdef: str, fallback: str) -> str:
    m = _CREATE_INDEX_RE.match(indexdef)
    if m is None:
        return fallback
    name = m.group("name")
    if name.startswith('"'):
        return name[1:-1].replace('""', '"')
    return name


def _compute_index_diff(
    source: list[IndexDef],
    target: list[IndexDef],
    *,
    source_schema: str,
    target_schema: str,
    source_table: str | None,
    target_table: str | None,
) -> IndexDiffResult:
    """Categorise source indexes against the target's catalog.

    Matching is definition-first: a source index whose rewritten definition
    exists on the target under any name is `identical`; otherwise a target
    index with the same name but a different definition is a `conflict`;
    otherwise the index is `missing`. Target indexes matched by nothing on
    the source are `target_only`.
    """
    target_by_sig: dict[str, IndexDef] = {}
    target_by_name: dict[str, IndexDef] = {}
    for t in target:
        target_by_sig.setdefault(_index_signature(t.indexdef), t)
        target_by_name[t.index_name] = t

    missing: list[IndexCopyOutcome] = []
    conflicts: list[IndexCopyOutcome] = []
    identical: list[IndexCopyOutcome] = []
    matched_target_names: set[str] = set()

    for s in source:
        rewritten = _rewrite_indexdef(
            s.indexdef, source_schema, target_schema, source_table, target_table
        )
        name = _index_name_of(rewritten, s.index_name)
        sig_match = target_by_sig.get(_index_signature(rewritten))
        if sig_match is not None:
            matched_target_names.add(sig_match.index_name)
            identical.append(
                IndexCopyOutcome(
                    table_name=s.table_name,
                    index_name=name,
                    status="exists",
                    indexdef=rewritten,
                    target_indexdef=sig_match.indexdef,
                )
            )
            continue
        name_match = target_by_name.get(name)
        if name_match is not None:
            matched_target_names.add(name_match.index_name)
            conflicts.append(
                IndexCopyOutcome(
                    table_name=s.table_name,
                    index_name=name,
                    status="conflict",
                    indexdef=rewritten,
                    target_indexdef=name_match.indexdef,
                )
            )
            continue
        missing.append(
            IndexCopyOutcome(
                table_name=s.table_name,
                index_name=name,
                status="missing",
                indexdef=rewritten,
            )
        )

    target_only = [t for t in target if t.index_name not in matched_target_names]
    return IndexDiffResult(
        missing=missing,
        conflicts=conflicts,
        identical=identical,
        target_only=target_only,
    )


class CloneExecutor:
    def __init__(self, store: ConnectionStore, registry: ConnectionRegistry) -> None:
        self._store = store
        self._registry = registry

    async def _pool(self, connection_id: UUID) -> asyncpg.Pool:
        conn = await self._store.get(connection_id)
        return await self._registry.get_pool(conn)

    async def clone_schema(self, req: CloneSchemaRequest) -> CloneResult:
        source = await self._store.get(req.source_connection_id)
        target_pool = await self._pool(req.target_connection_id)

        raw = await dump_schema(source, req.source_schema)
        rewritten = _rewrite_schema_in_dump(raw, req.source_schema, req.target_schema)
        stmts = _split_statements(rewritten)
        # We control the create-schema step explicitly so callers can choose
        # whether to fail if it already exists.
        stmts = _strip_create_schema(stmts, req.target_schema)

        prelude: list[str] = []
        if req.create_schema_if_missing:
            prelude.append(
                f"CREATE SCHEMA IF NOT EXISTS {quote_identifier(req.target_schema)}"
            )
        all_stmts = prelude + stmts
        full_sql = ";\n".join(all_stmts) + (";" if all_stmts else "")

        if req.dry_run:
            return CloneResult(ok=True, statements_run=0, sql=full_sql, detail="dry-run")

        ran = 0
        current = ""
        try:
            async with target_pool.acquire() as c:
                async with c.transaction():
                    for s in all_stmts:
                        current = s
                        await c.execute(s)
                        ran += 1
        except asyncpg.PostgresError as exc:
            log.warning(
                "clone_schema_failed",
                source=str(req.source_connection_id),
                target=str(req.target_connection_id),
                schema=req.source_schema,
                ran=ran,
                error=str(exc),
                statement=current,
            )
            return CloneResult(
                ok=False,
                statements_run=ran,
                sql=full_sql,
                detail=f"{exc} (in statement: {current[:500]})",
            )
        log.info(
            "clone_schema_ok",
            source=str(req.source_connection_id),
            target=str(req.target_connection_id),
            source_schema=req.source_schema,
            target_schema=req.target_schema,
            statements=ran,
        )
        return CloneResult(ok=True, statements_run=ran, sql=full_sql)

    async def _list_indexes(
        self, pool: asyncpg.Pool, schema: str, table: str | None
    ) -> list[IndexDef]:
        validate_identifier(schema)
        if table is not None:
            validate_identifier(table)
        async with pool.acquire() as c:
            if table is None:
                rows = await c.fetch(_INDEX_DEFS_SQL, schema)
            else:
                rows = await c.fetch(_INDEX_DEFS_SQL_TABLE, schema, table)
        return [IndexDef.model_validate(dict(r)) for r in rows]

    async def _diff(self, req: CopyIndexesRequest | DiffIndexesRequest) -> IndexDiffResult:
        source_pool = await self._pool(req.source_connection_id)
        target_pool = await self._pool(req.target_connection_id)
        source_defs = await self._list_indexes(
            source_pool, req.source_schema, req.source_table
        )
        target_defs = await self._list_indexes(
            target_pool, req.target_schema, req.target_table
        )
        return _compute_index_diff(
            source_defs,
            target_defs,
            source_schema=req.source_schema,
            target_schema=req.target_schema,
            source_table=req.source_table,
            target_table=req.target_table,
        )

    async def diff_indexes(self, req: DiffIndexesRequest) -> IndexDiffResult:
        return await self._diff(req)

    async def copy_indexes(self, req: CopyIndexesRequest) -> CopyIndexesResult:
        diff = await self._diff(req)
        target_pool = await self._pool(req.target_connection_id)

        stmts = [
            (o, _inject_if_not_exists(o.indexdef) if req.if_not_exists else o.indexdef)
            for o in diff.missing
        ]
        full_sql = ";\n".join(s for _, s in stmts) + (";" if stmts else "")
        # Identical and conflicting indexes are never executed; they are
        # reported so a run that creates nothing is visibly a no-op.
        report = list(diff.identical) + list(diff.conflicts)

        if req.dry_run:
            outcomes = report + list(diff.missing)
            return CopyIndexesResult(
                ok=True,
                created=0,
                exists=len(diff.identical),
                conflicts=len(diff.conflicts),
                failed=0,
                sql=full_sql,
                outcomes=outcomes,
                detail="dry-run",
            )

        created = 0
        failed = 0
        async with target_pool.acquire() as c:
            for outcome, sql in stmts:
                try:
                    await c.execute(sql)
                except asyncpg.PostgresError as exc:
                    failed += 1
                    report.append(
                        outcome.model_copy(update={"status": "failed", "error": str(exc)})
                    )
                    log.warning(
                        "copy_index_failed",
                        target=str(req.target_connection_id),
                        index=outcome.index_name,
                        error=str(exc),
                    )
                else:
                    created += 1
                    report.append(outcome.model_copy(update={"status": "created"}))

        detail = None
        if failed:
            detail = f"{failed} index(es) failed"
        elif not stmts:
            detail = "nothing to do: no missing indexes on target"
        log.info(
            "copy_indexes_done",
            source=str(req.source_connection_id),
            target=str(req.target_connection_id),
            source_schema=req.source_schema,
            target_schema=req.target_schema,
            created=created,
            exists=len(diff.identical),
            conflicts=len(diff.conflicts),
            failed=failed,
        )
        return CopyIndexesResult(
            ok=failed == 0,
            created=created,
            exists=len(diff.identical),
            conflicts=len(diff.conflicts),
            failed=failed,
            sql=full_sql,
            outcomes=report,
            detail=detail,
        )
