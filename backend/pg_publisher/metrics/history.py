from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from pathlib import Path

import aiosqlite

from pg_publisher.metrics.models import MetricSample, StreamKind


class HistoryStore:
    """Durable storage of metric samples; supports range queries for sparklines."""

    def __init__(self, sqlite_path: Path) -> None:
        self._sqlite_path = sqlite_path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._db = await aiosqlite.connect(self._sqlite_path)
        self._db.row_factory = aiosqlite.Row

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    def _conn(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("HistoryStore is not open")
        return self._db

    async def insert_many(self, samples: Iterable[MetricSample]) -> None:
        rows = [
            (
                str(s.connection_id),
                s.stream_kind.value,
                s.stream_name,
                s.sampled_at.isoformat(),
                s.lag_bytes,
                s.lag_seconds,
                s.state,
                None,
            )
            for s in samples
        ]
        if not rows:
            return
        await self._conn().executemany(
            """
            INSERT OR IGNORE INTO metric_samples
                (connection_id, stream_kind, stream_name, sampled_at,
                 lag_bytes, lag_seconds, state, extra_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        await self._conn().commit()

    async def range(
        self,
        connection_id: str,
        since: datetime,
        stream_kind: StreamKind | None = None,
        stream_name: str | None = None,
    ) -> list[MetricSample]:
        sql = (
            "SELECT * FROM metric_samples "
            "WHERE connection_id = ? AND sampled_at >= ?"
        )
        params: list[object] = [connection_id, since.isoformat()]
        if stream_kind is not None:
            sql += " AND stream_kind = ?"
            params.append(stream_kind.value)
        if stream_name is not None:
            sql += " AND stream_name = ?"
            params.append(stream_name)
        sql += " ORDER BY sampled_at"
        cur = await self._conn().execute(sql, params)
        rows = await cur.fetchall()
        return [
            MetricSample(
                connection_id=row["connection_id"],
                stream_kind=StreamKind(row["stream_kind"]),
                stream_name=row["stream_name"],
                sampled_at=datetime.fromisoformat(row["sampled_at"]),
                lag_bytes=row["lag_bytes"],
                lag_seconds=row["lag_seconds"],
                state=row["state"],
            )
            for row in rows
        ]
