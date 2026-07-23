from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SslMode(StrEnum):
    disable = "disable"
    allow = "allow"
    prefer = "prefer"
    require = "require"
    verify_ca = "verify-ca"
    verify_full = "verify-full"


class ConnectionRole(StrEnum):
    publisher = "publisher"
    subscriber = "subscriber"
    auto = "auto"


Name = Annotated[str, Field(min_length=1, max_length=120)]
Host = Annotated[str, Field(min_length=1, max_length=253)]
Port = Annotated[int, Field(ge=1, le=65535)]
Database = Annotated[str, Field(min_length=1, max_length=128)]
Username = Annotated[str, Field(min_length=1, max_length=128)]
EnvVarName = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]{0,79}$")]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- Create payloads ------------------------------------------------------


class StructuredCreate(_Base):
    """Explicit host/port/db/user fields; password is an env-var reference."""

    kind: Literal["structured"] = "structured"
    name: Name
    role: ConnectionRole = ConnectionRole.auto
    host: Host
    port: Port = 5432
    database: Database
    username: Username
    password_env: EnvVarName
    ssl_mode: SslMode = SslMode.prefer


class DsnCreate(_Base):
    """Connection driven by a libpq DSN held in an env var.

    The env var may contain either keyword=value form
    (`host=... user=... password=...`) or URI form
    (`postgres://user:pw@host:port/db?sslmode=require`).
    """

    kind: Literal["dsn"] = "dsn"
    name: Name
    role: ConnectionRole = ConnectionRole.auto
    dsn_env: EnvVarName


ConnectionCreate = Annotated[
    StructuredCreate | DsnCreate, Field(discriminator="kind")
]


# ---- Update payload -------------------------------------------------------


class ConnectionUpdate(_Base):
    """Only `name` and `role` are mutable; to change connection parameters,
    delete and re-create.
    """

    name: Name | None = None
    role: ConnectionRole | None = None


# ---- Full rows ------------------------------------------------------------


class _RowFields(_Base):
    id: UUID
    created_at: datetime
    updated_at: datetime


class StructuredConnection(StructuredCreate, _RowFields):
    pass


class DsnConnection(DsnCreate, _RowFields):
    pass


Connection = Annotated[
    StructuredConnection | DsnConnection, Field(discriminator="kind")
]
