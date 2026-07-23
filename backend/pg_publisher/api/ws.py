from __future__ import annotations

import asyncio
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from pg_publisher.api.deps import get_state
from pg_publisher.api.state import AppState
from pg_publisher.logging import log
from pg_publisher.metrics.models import MetricSample

router = APIRouter(tags=["ws"])


class WSSubscribe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["subscribe"] = "subscribe"
    connection_ids: list[UUID]


class WSUnsubscribe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["unsubscribe"] = "unsubscribe"
    connection_ids: list[UUID]


WSClientMessage = Annotated[WSSubscribe | WSUnsubscribe, Field(discriminator="type")]
_client_adapter: TypeAdapter[WSClientMessage] = TypeAdapter(WSClientMessage)


class WSSamplePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["sample"] = "sample"
    connection_id: UUID
    samples: list[MetricSample]


@router.websocket("/ws")
async def ws(websocket: WebSocket, state: AppState = Depends(get_state)) -> None:
    await websocket.accept()
    selected: set[UUID] = set()
    queue = state.supervisor.subscribe()

    async def pump() -> None:
        while True:
            connection, samples, _snapshot = await queue.get()
            if connection.id not in selected:
                continue
            payload = WSSamplePayload(connection_id=connection.id, samples=samples)
            await websocket.send_text(payload.model_dump_json())

    pump_task = asyncio.create_task(pump(), name="ws-pump")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = _client_adapter.validate_json(raw)
            except Exception as exc:
                await websocket.send_json({"type": "error", "detail": f"bad message: {exc}"})
                continue
            if isinstance(msg, WSSubscribe):
                selected.update(msg.connection_ids)
            elif isinstance(msg, WSUnsubscribe):
                selected.difference_update(msg.connection_ids)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("ws_error", error=str(exc))
    finally:
        pump_task.cancel()
        try:
            await pump_task
        except (asyncio.CancelledError, Exception):
            pass
        state.supervisor.unsubscribe(queue)
