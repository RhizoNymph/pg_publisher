from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from datetime import UTC, datetime
from typing import TypeVar

import asyncpg

from pg_publisher.connections.models import Connection
from pg_publisher.inspector import Inspector
from pg_publisher.logging import log
from pg_publisher.metrics.models import MetricSample, SnapshotPayload, StreamKind
from pg_publisher.metrics.ring import RingBuffer

T = TypeVar("T")


class Sampler:
    """One sampling loop per connection.

    Pushes MetricSamples into a RingBuffer and emits each tick on an
    asyncio.Queue for downstream consumers (WebSocket fan-out + history persist).
    """

    def __init__(
        self,
        connection: Connection,
        pool: asyncpg.Pool,
        interval_seconds: float,
        ring: RingBuffer[MetricSample],
        out_queue: asyncio.Queue[tuple[Connection, list[MetricSample], SnapshotPayload]],
    ) -> None:
        self._connection = connection
        self._inspector = Inspector(pool)
        self._interval = interval_seconds
        self._ring = ring
        self._out_queue = out_queue
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()
        self._last_snapshot: SnapshotPayload | None = None

    @property
    def latest_snapshot(self) -> SnapshotPayload | None:
        return self._last_snapshot

    def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name=f"sampler:{self._connection.id}")

    async def stop(self) -> None:
        self._stopping.set()
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self) -> None:
        while not self._stopping.is_set():
            tick_started = asyncio.get_running_loop().time()
            try:
                samples, snapshot = await self._tick()
                self._ring.extend(samples)
                self._last_snapshot = snapshot
                await self._out_queue.put((self._connection, samples, snapshot))
            except Exception as exc:
                log.warning(
                    "sampler_tick_failed",
                    connection_id=str(self._connection.id),
                    error=str(exc),
                )
            elapsed = asyncio.get_running_loop().time() - tick_started
            sleep_for = max(0.0, self._interval - elapsed)
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=sleep_for)
            except TimeoutError:
                pass

    async def _safe(self, name: str, coro: Awaitable[list[T]]) -> list[T]:
        """Run one inspector call; on failure log a warning and yield []."""
        try:
            return await coro
        except Exception as exc:
            log.warning(
                "inspector_query_failed",
                connection_id=str(self._connection.id),
                query=name,
                error=str(exc),
            )
            return []

    async def _tick(self) -> tuple[list[MetricSample], SnapshotPayload]:
        now = datetime.now(UTC)
        (
            publications,
            publication_tables,
            slots,
            stats,
            subs,
            sub_rels,
            sub_stats,
        ) = await asyncio.gather(
            self._safe("publications", self._inspector.publications()),
            self._safe("publication_tables", self._inspector.publication_tables()),
            self._safe("replication_slots", self._inspector.replication_slots()),
            self._safe("replication_stats", self._inspector.replication_stats()),
            self._safe("subscriptions", self._inspector.subscriptions()),
            self._safe("subscription_rels", self._inspector.subscription_rels()),
            self._safe("subscription_stats", self._inspector.subscription_stats()),
        )

        samples: list[MetricSample] = []

        # Publisher-side: join slot with stat by application_name + slot_name.
        stat_by_app = {s.application_name: s for s in stats if s.application_name}
        for slot in slots:
            stat = stat_by_app.get(slot.slot_name)
            samples.append(
                MetricSample(
                    connection_id=self._connection.id,
                    stream_kind=StreamKind.publication_slot,
                    stream_name=slot.slot_name,
                    sampled_at=now,
                    lag_bytes=stat.sent_to_replay_lag_bytes if stat else None,
                    lag_seconds=stat.replay_lag_seconds if stat else None,
                    state=stat.state if stat else ("inactive" if not slot.active else "active"),
                )
            )

        # Subscriber-side.
        for ss in sub_stats:
            samples.append(
                MetricSample(
                    connection_id=self._connection.id,
                    stream_kind=StreamKind.subscription,
                    stream_name=ss.subscription_name,
                    sampled_at=now,
                    lag_bytes=ss.apply_lag_bytes,
                    lag_seconds=ss.apply_lag_seconds,
                    state="running" if ss.pid is not None else "stopped",
                )
            )

        snapshot = SnapshotPayload(
            connection_id=self._connection.id,
            sampled_at=now,
            publications=publications,
            publication_tables=publication_tables,
            replication_slots=slots,
            replication_stats=stats,
            subscriptions=subs,
            subscription_rels=sub_rels,
            subscription_stats=sub_stats,
            latest_samples=samples,
        )
        return samples, snapshot
