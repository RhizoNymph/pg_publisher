from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pg_publisher.connections import (
    ConnectionRole,
    DsnConnection,
    SslMode,
    StructuredConnection,
    libpq_conninfo_for,
)
from pg_publisher.errors import SecretNotFound


def _now() -> datetime:
    return datetime.now(UTC)


def test_structured_conninfo_includes_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PGP_PW_X", "s3cret'with quote")
    conn = StructuredConnection(
        id=uuid4(),
        name="primary",
        role=ConnectionRole.publisher,
        host="db.example.com",
        port=5432,
        database="app",
        username="repuser",
        password_env="PGP_PW_X",
        ssl_mode=SslMode.require,
        created_at=_now(),
        updated_at=_now(),
    )
    out = libpq_conninfo_for(conn)
    assert "host='db.example.com'" in out
    assert "port='5432'" in out
    assert "user='repuser'" in out
    assert "dbname='app'" in out
    assert "sslmode='require'" in out
    # Single quote in the password must be backslash-escaped per libpq rules.
    assert "password='s3cret\\'with quote'" in out


def test_dsn_conninfo_passes_through(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PGP_DSN_Y", "postgres://u:p@h:5432/db?sslmode=require")
    conn = DsnConnection(
        id=uuid4(),
        name="dsn",
        role=ConnectionRole.publisher,
        dsn_env="PGP_DSN_Y",
        created_at=_now(),
        updated_at=_now(),
    )
    assert libpq_conninfo_for(conn) == "postgres://u:p@h:5432/db?sslmode=require"


def test_missing_env_raises() -> None:
    conn = DsnConnection(
        id=uuid4(),
        name="dsn",
        role=ConnectionRole.publisher,
        dsn_env="PGP_DSN_DOES_NOT_EXIST",
        created_at=_now(),
        updated_at=_now(),
    )
    with pytest.raises(SecretNotFound):
        libpq_conninfo_for(conn)
