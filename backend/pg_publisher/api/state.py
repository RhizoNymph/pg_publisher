from __future__ import annotations

from dataclasses import dataclass

from pg_publisher.actions import ActionExecutor
from pg_publisher.actions.audit import AuditLog
from pg_publisher.clone import CloneExecutor
from pg_publisher.connections import ConnectionRegistry, ConnectionStore
from pg_publisher.metrics import MetricsSupervisor
from pg_publisher.metrics.history import HistoryStore
from pg_publisher.settings import Settings


@dataclass
class AppState:
    settings: Settings
    store: ConnectionStore
    registry: ConnectionRegistry
    history: HistoryStore
    supervisor: MetricsSupervisor
    audit: AuditLog
    executor: ActionExecutor
    clone: CloneExecutor
