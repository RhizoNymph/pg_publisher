from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import aiosqlite

from pg_publisher.connections.models import (
    Connection,
    ConnectionCreate,
    ConnectionRole,
    ConnectionUpdate,
    DsnConnection,
    DsnCreate,
    SslMode,
    StructuredConnection,
    StructuredCreate,
)
from pg_publisher.errors import ConnectionNotFound
from pg_publisher.store.schema import init_schema


def _row_to_connection(row: aiosqlite.Row) -> Connection:
    common = dict(
        id=UUID(row["id"]),
        name=row["name"],
        role=ConnectionRole(row["role"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )
    kind = row["kind"]
    if kind == "structured":
        return StructuredConnection(
            **common,
            host=row["host"],
            port=row["port"],
            database=row["database"],
            username=row["username"],
            password_env=row["password_env"],
            ssl_mode=SslMode(row["ssl_mode"]),
        )
    if kind == "dsn":
        return DsnConnection(**common, dsn_env=row["dsn_env"])
    raise ValueError(f"unknown connection kind in store: {kind!r}")


class ConnectionStore:
    def __init__(self, sqlite_path: Path) -> None:
        self._sqlite_path = sqlite_path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._db = await aiosqlite.connect(self._sqlite_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA foreign_keys = ON")
        await init_schema(self._db)

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    def _conn(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("ConnectionStore is not open")
        return self._db

    async def list(self) -> list[Connection]:
        cur = await self._conn().execute(
            "SELECT * FROM connections ORDER BY name"
        )
        rows = await cur.fetchall()
        return [_row_to_connection(r) for r in rows]

    async def get(self, connection_id: UUID) -> Connection:
        cur = await self._conn().execute(
            "SELECT * FROM connections WHERE id = ?", (str(connection_id),)
        )
        row = await cur.fetchone()
        if row is None:
            raise ConnectionNotFound(str(connection_id))
        return _row_to_connection(row)

    async def create(self, payload: ConnectionCreate) -> Connection:
        now = datetime.now(UTC).isoformat()
        cid = uuid4()

        if isinstance(payload, StructuredCreate):
            await self._conn().execute(
                """
                INSERT INTO connections
                    (id, name, kind, role,
                     host, port, database, username, password_env, ssl_mode,
                     dsn_env, created_at, updated_at)
                VALUES (?, ?, 'structured', ?,
                        ?, ?, ?, ?, ?, ?,
                        NULL, ?, ?)
                """,
                (
                    str(cid),
                    payload.name,
                    payload.role.value,
                    payload.host,
                    payload.port,
                    payload.database,
                    payload.username,
                    payload.password_env,
                    payload.ssl_mode.value,
                    now,
                    now,
                ),
            )
        elif isinstance(payload, DsnCreate):
            await self._conn().execute(
                """
                INSERT INTO connections
                    (id, name, kind, role,
                     host, port, database, username, password_env, ssl_mode,
                     dsn_env, created_at, updated_at)
                VALUES (?, ?, 'dsn', ?,
                        NULL, NULL, NULL, NULL, NULL, NULL,
                        ?, ?, ?)
                """,
                (
                    str(cid),
                    payload.name,
                    payload.role.value,
                    payload.dsn_env,
                    now,
                    now,
                ),
            )
        else:  # pragma: no cover - exhaustive on the union
            raise AssertionError(f"unhandled create payload: {type(payload)!r}")

        await self._conn().commit()
        return await self.get(cid)

    async def update(self, connection_id: UUID, patch: ConnectionUpdate) -> Connection:
        current = await self.get(connection_id)
        data = patch.model_dump(exclude_unset=True)
        new_name = data.get("name", current.name)
        new_role = data.get("role", current.role)
        if isinstance(new_role, ConnectionRole):
            new_role_value = new_role.value
        else:
            new_role_value = str(new_role)
        now = datetime.now(UTC).isoformat()
        await self._conn().execute(
            "UPDATE connections SET name=?, role=?, updated_at=? WHERE id=?",
            (new_name, new_role_value, now, str(connection_id)),
        )
        await self._conn().commit()
        return await self.get(connection_id)

    async def delete(self, connection_id: UUID) -> None:
        cur = await self._conn().execute(
            "DELETE FROM connections WHERE id = ?", (str(connection_id),)
        )
        if cur.rowcount == 0:
            raise ConnectionNotFound(str(connection_id))
        await self._conn().commit()
