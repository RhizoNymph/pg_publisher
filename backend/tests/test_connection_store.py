from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from pg_publisher.connections import (
    ConnectionRole,
    ConnectionStore,
    ConnectionUpdate,
    DsnConnection,
    DsnCreate,
    SslMode,
    StructuredConnection,
    StructuredCreate,
)
from pg_publisher.errors import ConnectionNotFound


@pytest.fixture
async def store(tmp_data_dir: Path) -> AsyncIterator[ConnectionStore]:
    s = ConnectionStore(tmp_data_dir / "store.sqlite")
    await s.open()
    yield s
    await s.close()


async def test_create_and_get_structured(store: ConnectionStore) -> None:
    created = await store.create(
        StructuredCreate(
            name="primary",
            host="127.0.0.1",
            port=5432,
            database="app",
            username="postgres",
            password_env="PGP_TEST_PW",
            ssl_mode=SslMode.disable,
            role=ConnectionRole.publisher,
        )
    )
    assert isinstance(created, StructuredConnection)
    got = await store.get(created.id)
    assert isinstance(got, StructuredConnection)
    assert got.name == "primary"
    assert got.role is ConnectionRole.publisher


async def test_create_and_get_dsn(store: ConnectionStore) -> None:
    created = await store.create(
        DsnCreate(name="dsn-one", dsn_env="PGP_TEST_DSN")
    )
    assert isinstance(created, DsnConnection)
    got = await store.get(created.id)
    assert isinstance(got, DsnConnection)
    assert got.dsn_env == "PGP_TEST_DSN"


async def test_list_returns_mixed_kinds(store: ConnectionStore) -> None:
    await store.create(
        StructuredCreate(
            name="a-structured",
            host="127.0.0.1",
            database="app",
            username="postgres",
            password_env="PGP_TEST_PW",
        )
    )
    await store.create(DsnCreate(name="b-dsn", dsn_env="PGP_TEST_DSN"))
    rows = await store.list()
    kinds = {type(r) for r in rows}
    assert kinds == {StructuredConnection, DsnConnection}


async def test_update_name_and_role(store: ConnectionStore) -> None:
    created = await store.create(
        DsnCreate(name="x", dsn_env="PGP_TEST_DSN")
    )
    updated = await store.update(
        created.id, ConnectionUpdate(name="x-renamed", role=ConnectionRole.subscriber)
    )
    assert updated.name == "x-renamed"
    assert updated.role is ConnectionRole.subscriber


async def test_delete(store: ConnectionStore) -> None:
    created = await store.create(DsnCreate(name="gone", dsn_env="PGP_TEST_DSN"))
    await store.delete(created.id)
    with pytest.raises(ConnectionNotFound):
        await store.get(created.id)
