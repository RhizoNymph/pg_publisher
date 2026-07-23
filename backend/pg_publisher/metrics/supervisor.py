from __future__ import annotations

import asyncio
from uuid import UUID

from pg_publisher.connections import Connection, ConnectionRegistry, ConnectionStore
from pg_publisher.logging import log
from pg_publisher.metrics.history import HistoryStore
from pg_publisher.metrics.models import MetricSample, SnapshotPayload
from pg_publisher.metrics.ring import RingBuffer
from pg_publisher.metrics.sampler import Sampler


class MetricsSupervisor:
    """Owns the set of running Samplers and fans out events to subscribers."""

    def __init__(
        self,
        store: ConnectionStore,
        registry: ConnectionRegistry,
        history: HistoryStore,
        interval_seconds: float,
        ring_capacity: int,
    ) -> None:
        self._store = store
        self._registry = registry
        self._history = history
        self._interval = interval_seconds
        self._ring_capacity = ring_capacity

        self._samplers: dict[UUID, Sampler] = {}
        self._rings: dict[UUID, RingBuffer[MetricSample]] = {}
        self._queue: asyncio.Queue[
            tuple[Connection, list[MetricSample], SnapshotPayload]
        ] = asyncio.Queue(maxsize=1024)
        self._listeners: set[
            asyncio.Queue[tuple[Connection, list[MetricSample], SnapshotPayload]]
        ] = set()
        self._fanout_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        self._fanout_task = asyncio.create_task(self._fanout(), name="metrics-fanout")
        for conn in await self._store.list():
            await self.add_connection(conn)

    async def stop(self) -> None:
        async with self._lock:
            samplers = list(self._samplers.values())
            self._samplers.clear()
        for s in samplers:
            await s.stop()
        if self._fanout_task is not None:
            self._fanout_task.cancel()
            try:
                await self._fanout_task
            except (asyncio.CancelledError, Exception):
                pass
            self._fanout_task = None

    async def add_connection(self, connection: Connection) -> None:
        async with self._lock:
            if connection.id in self._samplers:
                return
            ring: RingBuffer[MetricSample] = RingBuffer(self._ring_capacity)
            self._rings[connection.id] = ring
            try:
                pool = await self._registry.get_pool(connection)
            except Exception as exc:
                log.warning(
                    "sampler_skip_no_pool",
                    connection_id=str(connection.id),
                    error=str(exc),
                )
                return
            sampler = Sampler(
                connection=connection,
                pool=pool,
                interval_seconds=self._interval,
                ring=ring,
                out_queue=self._queue,
            )
            self._samplers[connection.id] = sampler
            sampler.start()

    async def remove_connection(self, connection_id: UUID) -> None:
        async with self._lock:
            sampler = self._samplers.pop(connection_id, None)
            self._rings.pop(connection_id, None)
        if sampler is not None:
            await sampler.stop()

    def latest_snapshot(self, connection_id: UUID) -> SnapshotPayload | None:
        sampler = self._samplers.get(connection_id)
        return sampler.latest_snapshot if sampler else None

    def ring_snapshot(self, connection_id: UUID) -> list[MetricSample]:
        ring = self._rings.get(connection_id)
        return ring.snapshot() if ring else []

    def subscribe(
        self,
    ) -> asyncio.Queue[tuple[Connection, list[MetricSample], SnapshotPayload]]:
        q: asyncio.Queue[
            tuple[Connection, list[MetricSample], SnapshotPayload]
        ] = asyncio.Queue(maxsize=256)
        self._listeners.add(q)
        return q

    def unsubscribe(
        self,
        q: asyncio.Queue[tuple[Connection, list[MetricSample], SnapshotPayload]],
    ) -> None:
        self._listeners.discard(q)

    async def _fanout(self) -> None:
        while True:
            event = await self._queue.get()
            _, samples, _ = event
            try:
                await self._history.insert_many(samples)
            except Exception as exc:
                log.warning("history_persist_failed", error=str(exc))
            for q in list(self._listeners):
                if q.full():
                    continue
                q.put_nowait(event)
