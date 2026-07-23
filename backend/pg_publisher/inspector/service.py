from __future__ import annotations

import asyncpg

from pg_publisher.inspector import queries
from pg_publisher.inspector.models import (
    PublicationRow,
    PublicationTableRow,
    ReplicationSlotRow,
    ReplicationStatRow,
    SubscriptionRel,
    SubscriptionRow,
    SubscriptionStatRow,
    TableInfo,
)


class Inspector:
    """Read-only Postgres introspection bound to a single asyncpg pool."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def list_tables(self, schema: str) -> list[TableInfo]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.TABLES_IN_SCHEMA, schema)
        return [TableInfo.model_validate(dict(r)) for r in rows]

    async def publications(self) -> list[PublicationRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.PUBLICATIONS)
        return [PublicationRow.model_validate(dict(r)) for r in rows]

    async def publication_tables(self) -> list[PublicationTableRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.PUBLICATION_TABLES)
        return [PublicationTableRow.model_validate(dict(r)) for r in rows]

    async def replication_slots(self) -> list[ReplicationSlotRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.REPLICATION_SLOTS)
        return [ReplicationSlotRow.model_validate(dict(r)) for r in rows]

    async def replication_stats(self) -> list[ReplicationStatRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.REPLICATION_STAT)
        return [ReplicationStatRow.model_validate(dict(r)) for r in rows]

    async def subscriptions(self) -> list[SubscriptionRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.SUBSCRIPTIONS)
        return [SubscriptionRow.model_validate(dict(r)) for r in rows]

    async def subscription_rels(self) -> list[SubscriptionRel]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.SUBSCRIPTION_RELS)
        return [SubscriptionRel.model_validate(dict(r)) for r in rows]

    async def subscription_stats(self) -> list[SubscriptionStatRow]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(queries.SUBSCRIPTION_STAT)
        return [SubscriptionStatRow.model_validate(dict(r)) for r in rows]
