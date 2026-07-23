from __future__ import annotations

import asyncio
import os
import shutil

from pg_publisher.actions.identifiers import validate_identifier
from pg_publisher.connections.libpq import libpq_conninfo_for
from pg_publisher.connections.models import Connection
from pg_publisher.errors import PgPublisherError


class PgDumpUnavailable(PgPublisherError):
    def __init__(self) -> None:
        super().__init__("pg_dump executable not found on PATH")


class PgDumpFailed(PgPublisherError):
    def __init__(self, returncode: int, stderr: str) -> None:
        super().__init__(f"pg_dump exited {returncode}: {stderr.strip()}")
        self.returncode = returncode
        self.stderr = stderr


async def dump_schema(conn: Connection, schema: str) -> str:
    """Run `pg_dump --schema-only --no-owner --no-privileges -n <schema>` against
    `conn` and return the SQL text.
    """
    validate_identifier(schema)
    if shutil.which("pg_dump") is None:
        raise PgDumpUnavailable()

    dsn = libpq_conninfo_for(conn)
    # We pass the DSN via -d. For local-dev use that's fine; the value is
    # briefly visible in `ps`. Users who care can put the password in
    # ~/.pgpass and use a structured connection without the password env, or
    # restrict process listing.
    proc = await asyncio.create_subprocess_exec(
        "pg_dump",
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--no-publications",
        "--no-subscriptions",
        "-n",
        schema,
        "-d",
        dsn,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "PGAPPNAME": "pg_publisher"},
    )
    stdout_b, stderr_b = await proc.communicate()
    if proc.returncode != 0:
        raise PgDumpFailed(proc.returncode or -1, stderr_b.decode("utf-8", "replace"))
    return stdout_b.decode("utf-8")
