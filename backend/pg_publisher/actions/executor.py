from __future__ import annotations

import re
from uuid import UUID

import asyncpg

from pg_publisher.actions.audit import AuditLog
from pg_publisher.actions.identifiers import (
    quote_identifier,
    quote_qualified,
    validate_identifier,
)
from pg_publisher.actions.models import (
    ActionRequest,
    ActionResult,
    AlterPublicationAddTable,
    AlterPublicationDropTable,
    AlterSubscription,
    CreatePublication,
    CreateSubscription,
    DropPublication,
    DropSubscription,
)
from pg_publisher.connections import (
    ConnectionRegistry,
    ConnectionStore,
    libpq_conninfo_for,
)
from pg_publisher.errors import ConnectionNotFound
from pg_publisher.logging import log

_STATEMENT_TIMEOUT_S = 60.0


def _sql_escape_literal(value: str) -> str:
    """Escape a value for inclusion inside a SQL single-quoted string."""
    return value.replace("'", "''")


def _with_connect_timeout(conninfo: str, seconds: int = 10) -> str:
    """Ensure the CONNECTION string has a connect_timeout.

    Without it, the subscriber's walsender connection to an unreachable
    publisher (e.g. blocked by a firewall / DO trusted sources) blocks
    CREATE SUBSCRIPTION indefinitely. Handles both libpq forms: URI
    (`postgresql://…` — query parameter) and keyword/value.
    """
    if "connect_timeout" in conninfo:
        return conninfo
    if conninfo.startswith(("postgresql://", "postgres://")):
        sep = "&" if "?" in conninfo else "?"
        return f"{conninfo}{sep}connect_timeout={seconds}"
    return f"{conninfo} connect_timeout={seconds}"


_URI_PASSWORD_RE = re.compile(r"(://[^:/@?]+:)[^@]*(@)")
_KW_PASSWORD_RE = re.compile(r"(password\s*=\s*)(?:'(?:\\.|[^'])*'|\S+)")


def _redact_conninfo(conninfo: str) -> str:
    """Mask the password so conninfo can appear in results, audit and logs."""
    if conninfo.startswith(("postgresql://", "postgres://")):
        return _URI_PASSWORD_RE.sub(r"\1***\2", conninfo)
    return _KW_PASSWORD_RE.sub(r"\1***", conninfo)


async def _system_identifier(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as c:
        return await c.fetchval(
            "SELECT system_identifier FROM pg_control_system()",
            timeout=_STATEMENT_TIMEOUT_S,
        )


def _build_create_publication(action: CreatePublication) -> str:
    name = quote_identifier(action.name)
    if action.all_tables and action.tables:
        raise ValueError("create_publication: choose all_tables OR tables, not both")
    if action.all_tables:
        target = "FOR ALL TABLES"
    elif action.tables:
        target = "FOR TABLE " + ", ".join(
            quote_qualified(t.schema_name, t.table_name) for t in action.tables
        )
    else:
        target = ""
    p = action.publish
    chosen = [k for k, v in {
        "insert": p.insert, "update": p.update,
        "delete": p.delete, "truncate": p.truncate,
    }.items() if v]
    if not chosen:
        raise ValueError(
            "create_publication: at least one publish operation must be enabled"
        )
    # All four ops is the server default; omitting the clause keeps the SQL
    # canonical. An explicit clause is only needed for a proper subset.
    publish_clause = (
        f" WITH (publish = '{', '.join(chosen)}')" if len(chosen) < 4 else ""
    )
    target_clause = f" {target}" if target else ""
    return f"CREATE PUBLICATION {name}{target_clause}{publish_clause}"


def _build_alter_add_table(action: AlterPublicationAddTable) -> str:
    return (
        f"ALTER PUBLICATION {quote_identifier(action.name)} "
        f"ADD TABLE {quote_qualified(action.table.schema_name, action.table.table_name)}"
    )


def _build_alter_drop_table(action: AlterPublicationDropTable) -> str:
    return (
        f"ALTER PUBLICATION {quote_identifier(action.name)} "
        f"DROP TABLE {quote_qualified(action.table.schema_name, action.table.table_name)}"
    )


def _build_drop_publication(action: DropPublication) -> str:
    return f"DROP PUBLICATION {quote_identifier(action.name)}"


def _build_create_subscription(action: CreateSubscription, conninfo: str) -> str:
    name = quote_identifier(action.name)
    pubs = ", ".join(quote_identifier(p) for p in action.publications)
    options: list[str] = []
    options.append(f"enabled = {'true' if action.enabled else 'false'}")
    options.append(f"create_slot = {'true' if action.create_slot else 'false'}")
    options.append(f"copy_data = {'true' if action.copy_data else 'false'}")
    if action.slot_name is not None:
        options.append(f"slot_name = {quote_identifier(action.slot_name)}")
    if action.synchronous_commit is not None:
        validate_identifier(action.synchronous_commit)
        options.append(f"synchronous_commit = '{action.synchronous_commit}'")
    with_clause = " WITH (" + ", ".join(options) + ")" if options else ""
    return (
        f"CREATE SUBSCRIPTION {name} "
        f"CONNECTION '{_sql_escape_literal(conninfo)}' "
        f"PUBLICATION {pubs}{with_clause}"
    )


def _build_alter_subscription(action: AlterSubscription) -> str:
    name = quote_identifier(action.name)
    match action.op:
        case "enable":
            return f"ALTER SUBSCRIPTION {name} ENABLE"
        case "disable":
            return f"ALTER SUBSCRIPTION {name} DISABLE"
        case "refresh":
            return f"ALTER SUBSCRIPTION {name} REFRESH PUBLICATION"
        case "set_publication":
            if not action.publications:
                raise ValueError("set_publication requires publications")
            pubs = ", ".join(quote_identifier(p) for p in action.publications)
            return f"ALTER SUBSCRIPTION {name} SET PUBLICATION {pubs}"


def _build_drop_subscription(action: DropSubscription) -> list[str]:
    name = quote_identifier(action.name)
    stmts: list[str] = []
    if action.disable_first:
        stmts.append(f"ALTER SUBSCRIPTION {name} DISABLE")
        stmts.append(f"ALTER SUBSCRIPTION {name} SET (slot_name = NONE)")
    stmts.append(f"DROP SUBSCRIPTION {name}")
    return stmts


class ActionExecutor:
    def __init__(
        self,
        store: ConnectionStore,
        registry: ConnectionRegistry,
        audit: AuditLog,
    ) -> None:
        self._store = store
        self._registry = registry
        self._audit = audit

    async def execute(
        self, connection_id: UUID, action: ActionRequest
    ) -> ActionResult:
        try:
            conn = await self._store.get(connection_id)
        except ConnectionNotFound:
            raise

        pool = await self._registry.get_pool(conn)
        statements: list[str] = []
        # Redacted counterparts of `statements` for results/audit/logs;
        # None means the statements contain no secrets and can be shown as-is.
        display: list[str] | None = None
        pre_sql: list[str] = []  # publisher-side steps, for display/audit only
        current = ""

        try:
            match action:
                case CreatePublication():
                    statements.append(_build_create_publication(action))
                case AlterPublicationAddTable():
                    statements.append(_build_alter_add_table(action))
                case AlterPublicationDropTable():
                    statements.append(_build_alter_drop_table(action))
                case DropPublication():
                    statements.append(_build_drop_publication(action))
                case CreateSubscription():
                    publisher = await self._store.get(action.publisher_connection_id)
                    conninfo = _with_connect_timeout(libpq_conninfo_for(publisher))
                    effective = action
                    if action.create_slot:
                        pub_pool = await self._registry.get_pool(publisher)
                        same_cluster = await _system_identifier(
                            pool
                        ) == await _system_identifier(pub_pool)
                        if same_cluster:
                            # CREATE SUBSCRIPTION with create_slot = true hangs
                            # when publisher and subscriber are the same cluster
                            # (documented restriction). Pre-create the slot on
                            # the publisher and subscribe with create_slot=false.
                            slot = action.slot_name or action.name
                            validate_identifier(slot)
                            async with pub_pool.acquire() as pc:
                                exists = await pc.fetchval(
                                    "SELECT 1 FROM pg_replication_slots"
                                    " WHERE slot_name = $1",
                                    slot,
                                    timeout=_STATEMENT_TIMEOUT_S,
                                )
                                if exists is None:
                                    current = (
                                        "SELECT pg_create_logical_replication_slot"
                                        f"('{slot}', 'pgoutput')"
                                    )
                                    await pc.fetchval(
                                        "SELECT pg_create_logical_replication_slot"
                                        "($1, 'pgoutput')",
                                        slot,
                                        timeout=_STATEMENT_TIMEOUT_S,
                                    )
                            pre_sql.append(
                                "-- on publisher (same cluster as subscriber):\n"
                                "-- SELECT pg_create_logical_replication_slot"
                                f"('{slot}', 'pgoutput');"
                            )
                            effective = action.model_copy(
                                update={"create_slot": False, "slot_name": slot}
                            )
                    statements.append(
                        _build_create_subscription(effective, conninfo)
                    )
                    display = [
                        _build_create_subscription(
                            effective, _redact_conninfo(conninfo)
                        )
                    ]
                case AlterSubscription():
                    statements.append(_build_alter_subscription(action))
                case DropSubscription():
                    statements.extend(_build_drop_subscription(action))

            shown = display if display is not None else statements
            sql_combined = "\n".join([*pre_sql, ";\n".join(shown)])
            async with pool.acquire() as c:
                for stmt, disp in zip(statements, shown, strict=False):
                    current = disp
                    await c.execute(stmt, timeout=_STATEMENT_TIMEOUT_S)
        except (asyncpg.PostgresError, TimeoutError) as exc:
            shown = display if display is not None else statements
            sql_combined = "\n".join([*pre_sql, ";\n".join(shown)])
            if isinstance(exc, TimeoutError):
                detail = (
                    f"timed out after {int(_STATEMENT_TIMEOUT_S)}s"
                    f" in: {current[:500]}."
                    " For create_subscription this usually means the publisher"
                    " CONNECTION string is not reachable from the subscriber"
                    " server, or slot creation is waiting on a long-running"
                    " transaction on the publisher."
                )
            else:
                detail = f"{exc} (in statement: {current[:500]})"
            await self._audit.record(
                connection_id, action, sql_combined, "error", detail
            )
            log.warning(
                "action_failed",
                connection_id=str(connection_id),
                action=action.kind,
                error=detail,
            )
            return ActionResult(ok=False, sql=sql_combined, detail=detail)

        await self._audit.record(connection_id, action, sql_combined, "ok", None)
        log.info(
            "action_ok",
            connection_id=str(connection_id),
            action=action.kind,
        )
        return ActionResult(ok=True, sql=sql_combined)
