from __future__ import annotations

import asyncio
import os
from uuid import UUID

import asyncpg

from pg_publisher.connections.models import (
    Connection,
    DsnConnection,
    SslMode,
    StructuredConnection,
)
from pg_publisher.errors import ConnectionTestFailed, SecretNotFound


def _resolve_env(env_var: str) -> str:
    value = os.environ.get(env_var)
    if value is None:
        raise SecretNotFound(env_var)
    return value


def _ssl_param(mode: SslMode) -> str | bool:
    if mode is SslMode.disable:
        return False
    return mode.value  # libpq-style strings: allow/prefer/require/verify-ca/verify-full


class ConnectionRegistry:
    """Lazily builds and caches one asyncpg pool per saved Connection."""

    def __init__(self, statement_timeout_ms: int) -> None:
        self._statement_timeout_ms = statement_timeout_ms
        self._pools: dict[UUID, asyncpg.Pool] = {}
        self._lock = asyncio.Lock()

    async def _create_pool(self, conn: Connection) -> asyncpg.Pool:
        server_settings = {
            "application_name": "pg_publisher",
            "statement_timeout": str(self._statement_timeout_ms),
        }
        common = dict(
            min_size=1,
            max_size=4,
            command_timeout=self._statement_timeout_ms / 1000,
            server_settings=server_settings,
        )
        if isinstance(conn, StructuredConnection):
            return await asyncpg.create_pool(
                host=conn.host,
                port=conn.port,
                database=conn.database,
                user=conn.username,
                password=_resolve_env(conn.password_env),
                ssl=_ssl_param(conn.ssl_mode),
                **common,
            )
        if isinstance(conn, DsnConnection):
            return await asyncpg.create_pool(dsn=_resolve_env(conn.dsn_env), **common)
        raise AssertionError(f"unhandled connection kind: {type(conn)!r}")

    async def get_pool(self, conn: Connection) -> asyncpg.Pool:
        async with self._lock:
            existing = self._pools.get(conn.id)
            if existing is not None:
                return existing
            pool = await self._create_pool(conn)
            self._pools[conn.id] = pool
            return pool

    async def evict(self, connection_id: UUID) -> None:
        async with self._lock:
            pool = self._pools.pop(connection_id, None)
        if pool is not None:
            await pool.close()

    async def close_all(self) -> None:
        async with self._lock:
            pools = list(self._pools.values())
            self._pools.clear()
        for pool in pools:
            await pool.close()

    async def test(self, conn: Connection) -> None:
        try:
            pool = await self.get_pool(conn)
            async with pool.acquire() as c:
                await c.fetchval("SELECT 1")
        except SecretNotFound:
            raise
        except Exception as exc:
            await self.evict(conn.id)
            raise ConnectionTestFailed(str(conn.id), str(exc)) from exc
