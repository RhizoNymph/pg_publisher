"""Integration tests against a real Postgres via testcontainers."""

from __future__ import annotations

import asyncpg
import pytest
from pg_publisher.inspector import Inspector


async def test_inspector_against_live_postgres(pg_container: dict[str, object]) -> None:
    pool = await asyncpg.create_pool(
        host=pg_container["host"],
        port=pg_container["port"],
        user=pg_container["user"],
        password=pg_container["password"],
        database=pg_container["database"],
        min_size=1,
        max_size=2,
    )
    try:
        async with pool.acquire() as c:
            await c.execute("CREATE TABLE IF NOT EXISTS t1 (id int primary key)")
            await c.execute("DROP PUBLICATION IF EXISTS pub_test")
            await c.execute("CREATE PUBLICATION pub_test FOR TABLE t1")

        inspector = Inspector(pool)
        pubs = await inspector.publications()
        names = {p.name for p in pubs}
        assert "pub_test" in names

        tables = await inspector.publication_tables()
        assert any(t.table_name == "t1" for t in tables)

        slots = await inspector.replication_slots()
        # No subscribers yet → there may be no slots; should not error.
        assert isinstance(slots, list)
    finally:
        await pool.close()


@pytest.mark.usefixtures("pg_container")
async def test_inspector_subscription_views_empty(
    pg_container: dict[str, object],
) -> None:
    pool = await asyncpg.create_pool(
        host=pg_container["host"],
        port=pg_container["port"],
        user=pg_container["user"],
        password=pg_container["password"],
        database=pg_container["database"],
    )
    try:
        inspector = Inspector(pool)
        subs = await inspector.subscriptions()
        assert subs == []
        stats = await inspector.subscription_stats()
        assert stats == []
    finally:
        await pool.close()
