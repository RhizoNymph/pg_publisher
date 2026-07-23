"""Build a libpq conninfo string from a saved Connection.

Used by `ActionExecutor` to materialise the `CONNECTION '<libpq>'` clause of
`CREATE SUBSCRIPTION`. For DSN-backed connections we pass the env value
through unchanged; for structured connections we assemble the keyword=value
form.
"""

from __future__ import annotations

import os

from pg_publisher.connections.models import (
    Connection,
    DsnConnection,
    StructuredConnection,
)
from pg_publisher.errors import SecretNotFound


def _escape_libpq_value(v: str) -> str:
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


def libpq_conninfo_for(conn: Connection) -> str:
    """Return a libpq conninfo string suitable for `CREATE SUBSCRIPTION`.

    The result is already shell/SQL-safe to interpolate into the `'…'`
    string literal in the generated DDL.
    """
    if isinstance(conn, StructuredConnection):
        password = os.environ.get(conn.password_env)
        if password is None:
            raise SecretNotFound(conn.password_env)
        parts = [
            f"host={_escape_libpq_value(conn.host)}",
            f"port={_escape_libpq_value(str(conn.port))}",
            f"dbname={_escape_libpq_value(conn.database)}",
            f"user={_escape_libpq_value(conn.username)}",
            f"password={_escape_libpq_value(password)}",
            f"sslmode={_escape_libpq_value(conn.ssl_mode.value)}",
        ]
        return " ".join(parts)
    if isinstance(conn, DsnConnection):
        dsn = os.environ.get(conn.dsn_env)
        if dsn is None:
            raise SecretNotFound(conn.dsn_env)
        return dsn
    raise AssertionError(f"unhandled connection kind: {type(conn)!r}")
