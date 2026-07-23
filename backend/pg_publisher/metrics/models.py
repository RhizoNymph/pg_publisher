from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from pg_publisher.inspector.models import (
    PublicationRow,
    PublicationTableRow,
    ReplicationSlotRow,
    ReplicationStatRow,
    SubscriptionRel,
    SubscriptionRow,
    SubscriptionStatRow,
)


class StreamKind(StrEnum):
    publication_slot = "publication_slot"
    subscription = "subscription"


class MetricSample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connection_id: UUID
    stream_kind: StreamKind
    stream_name: str
    sampled_at: datetime
    lag_bytes: int | None = None
    lag_seconds: float | None = None
    state: str | None = None
    extra: dict[str, Any] = {}


class LagSnapshot(BaseModel):
    """Most-recent lag value per stream, for a single connection."""

    model_config = ConfigDict(extra="forbid")

    connection_id: UUID
    samples: list[MetricSample]


class SnapshotPayload(BaseModel):
    """Full point-in-time snapshot for one connection."""

    model_config = ConfigDict(extra="forbid")

    connection_id: UUID
    sampled_at: datetime
    publications: list[PublicationRow]
    publication_tables: list[PublicationTableRow]
    replication_slots: list[ReplicationSlotRow]
    replication_stats: list[ReplicationStatRow]
    subscriptions: list[SubscriptionRow]
    subscription_rels: list[SubscriptionRel]
    subscription_stats: list[SubscriptionStatRow]
    latest_samples: list[MetricSample]
