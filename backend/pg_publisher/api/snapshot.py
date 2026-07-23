from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from pg_publisher.api.deps import get_state
from pg_publisher.api.state import AppState
from pg_publisher.errors import ConnectionNotFound
from pg_publisher.metrics.models import MetricSample, SnapshotPayload, StreamKind

router = APIRouter(tags=["snapshot"])


@router.get("/connections/{connection_id}/snapshot", response_model=SnapshotPayload)
async def get_snapshot(
    connection_id: UUID, state: AppState = Depends(get_state)
) -> SnapshotPayload:
    # Verify the connection exists (real 404), then either return the cached
    # snapshot or an empty placeholder until the first sampler tick lands.
    try:
        await state.store.get(connection_id)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    snap = state.supervisor.latest_snapshot(connection_id)
    if snap is not None:
        return snap
    return SnapshotPayload(
        connection_id=connection_id,
        sampled_at=datetime.now(UTC),
        publications=[],
        publication_tables=[],
        replication_slots=[],
        replication_stats=[],
        subscriptions=[],
        subscription_rels=[],
        subscription_stats=[],
        latest_samples=[],
    )


@router.get("/connections/{connection_id}/history", response_model=list[MetricSample])
async def get_history(
    connection_id: UUID,
    minutes: int = Query(default=15, ge=1, le=24 * 60),
    stream_kind: StreamKind | None = Query(default=None),
    stream_name: str | None = Query(default=None),
    state: AppState = Depends(get_state),
) -> list[MetricSample]:
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    return await state.history.range(
        str(connection_id),
        since,
        stream_kind=stream_kind,
        stream_name=stream_name,
    )
