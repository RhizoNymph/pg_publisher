from __future__ import annotations

import shutil
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest


@pytest.fixture
def tmp_data_dir(tmp_path: Path) -> Iterator[Path]:
    p = tmp_path / "pgp"
    p.mkdir(parents=True, exist_ok=True)
    try:
        yield p
    finally:
        shutil.rmtree(p, ignore_errors=True)


def _docker_available() -> bool:
    try:
        import docker

        client = docker.from_env()
        client.ping()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def docker_available() -> bool:
    return _docker_available()


@pytest.fixture(scope="session")
async def pg_container() -> AsyncIterator[dict[str, object]]:
    if not _docker_available():
        pytest.skip("docker not available")
    from testcontainers.postgres import PostgresContainer

    container = (
        PostgresContainer("postgres:16-alpine")
        .with_command("postgres -c wal_level=logical -c max_replication_slots=10 "
                      "-c max_wal_senders=10")
    )
    container.start()
    try:
        yield {
            "host": container.get_container_host_ip(),
            "port": int(container.get_exposed_port(5432)),
            "user": container.username,
            "password": container.password,
            "database": container.dbname,
        }
    finally:
        container.stop()
