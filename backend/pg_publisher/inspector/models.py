from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TableInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_name: str
    table_name: str


class PublicationRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    oid: int
    name: str
    owner: str
    all_tables: bool
    insert: bool
    update: bool
    delete: bool
    truncate: bool


class PublicationTableRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    publication: str
    schema_name: str
    table_name: str


class ReplicationSlotRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot_name: str
    plugin: str | None
    slot_type: str
    database: str | None
    active: bool
    active_pid: int | None
    restart_lsn: str | None
    confirmed_flush_lsn: str | None
    wal_status: str | None
    safe_wal_size_bytes: int | None


class ReplicationStatRow(BaseModel):
    """Row from pg_stat_replication on the publisher side."""

    model_config = ConfigDict(extra="forbid")

    pid: int
    usename: str | None
    application_name: str | None
    client_addr: str | None
    state: str | None
    sync_state: str | None
    sent_lsn: str | None
    write_lsn: str | None
    flush_lsn: str | None
    replay_lsn: str | None
    write_lag_seconds: float | None
    flush_lag_seconds: float | None
    replay_lag_seconds: float | None
    backend_start: datetime | None
    # Computed:
    sent_to_replay_lag_bytes: int | None


class SubscriptionRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    oid: int
    name: str
    owner: str
    enabled: bool
    publications: list[str]
    slot_name: str | None
    synchronous_commit: str | None


class SubscriptionRel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subscription: str
    schema_name: str
    table_name: str
    state: str  # i=init, d=data sync, s=synchronized, r=ready
    lsn: str | None


class SubscriptionStatRow(BaseModel):
    """Row from pg_stat_subscription on the subscriber side."""

    model_config = ConfigDict(extra="forbid")

    subscription_name: str
    pid: int | None
    received_lsn: str | None
    last_msg_send_time: datetime | None
    last_msg_receipt_time: datetime | None
    latest_end_lsn: str | None
    latest_end_time: datetime | None
    # Computed:
    apply_lag_seconds: float | None
    apply_lag_bytes: int | None
