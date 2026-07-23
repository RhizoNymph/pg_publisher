from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status

from pg_publisher.api.deps import get_state
from pg_publisher.api.state import AppState
from pg_publisher.connections import (
    Connection,
    ConnectionUpdate,
    DsnCreate,
    StructuredCreate,
)
from pg_publisher.errors import (
    ConnectionNotFound,
    ConnectionTestFailed,
    IdentifierInvalid,
    SecretNotFound,
)
from pg_publisher.inspector import Inspector, TableInfo

# Declared directly on the route signature so FastAPI sees the discriminator
# at the parameter level (re-exporting the alias from connections/__init__.py
# loses the `Field(discriminator=…)` metadata before FastAPI inspects it).
ConnectionCreateBody = Annotated[
    StructuredCreate | DsnCreate, Body(discriminator="kind")
]

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=list[Connection])
async def list_connections(state: AppState = Depends(get_state)) -> list[Connection]:
    return await state.store.list()


@router.post("", response_model=Connection, status_code=status.HTTP_201_CREATED)
async def create_connection(
    payload: ConnectionCreateBody,
    state: AppState = Depends(get_state),
) -> Connection:
    conn = await state.store.create(payload)
    await state.supervisor.add_connection(conn)
    return conn


@router.patch("/{connection_id}", response_model=Connection)
async def update_connection(
    connection_id: UUID,
    payload: ConnectionUpdate,
    state: AppState = Depends(get_state),
) -> Connection:
    try:
        conn = await state.store.update(connection_id, payload)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return conn


@router.delete(
    "/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_connection(
    connection_id: UUID, state: AppState = Depends(get_state)
) -> None:
    try:
        await state.store.delete(connection_id)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await state.supervisor.remove_connection(connection_id)
    await state.registry.evict(connection_id)


@router.get("/{connection_id}/tables", response_model=list[TableInfo])
async def list_tables(
    connection_id: UUID,
    schema: str,
    state: AppState = Depends(get_state),
) -> list[TableInfo]:
    try:
        conn = await state.store.get(connection_id)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        pool = await state.registry.get_pool(conn)
    except SecretNotFound as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return await Inspector(pool).list_tables(schema)
    except IdentifierInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{connection_id}/test")
async def test_connection(
    connection_id: UUID, state: AppState = Depends(get_state)
) -> dict[str, str]:
    try:
        conn = await state.store.get(connection_id)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        await state.registry.test(conn)
    except SecretNotFound as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionTestFailed as exc:
        raise HTTPException(status_code=502, detail=exc.reason) from exc
    return {"ok": "true"}
