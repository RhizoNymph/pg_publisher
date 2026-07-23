from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from pg_publisher.api.deps import get_state
from pg_publisher.api.state import AppState
from pg_publisher.clone.models import (
    CloneResult,
    CloneSchemaRequest,
    CopyIndexesRequest,
    CopyIndexesResult,
    DiffIndexesRequest,
    IndexDiffResult,
)
from pg_publisher.clone.pg_dump import PgDumpFailed, PgDumpUnavailable
from pg_publisher.errors import ConnectionNotFound, IdentifierInvalid, SecretNotFound

router = APIRouter(prefix="/clone", tags=["clone"])


@router.post("/schema", response_model=CloneResult)
async def clone_schema(
    payload: CloneSchemaRequest, state: AppState = Depends(get_state)
) -> CloneResult:
    try:
        return await state.clone.clone_schema(payload)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (IdentifierInvalid, SecretNotFound) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PgDumpUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PgDumpFailed as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/indexes", response_model=CopyIndexesResult)
async def copy_indexes(
    payload: CopyIndexesRequest, state: AppState = Depends(get_state)
) -> CopyIndexesResult:
    try:
        return await state.clone.copy_indexes(payload)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (IdentifierInvalid, SecretNotFound) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/indexes/diff", response_model=IndexDiffResult)
async def diff_indexes(
    payload: DiffIndexesRequest, state: AppState = Depends(get_state)
) -> IndexDiffResult:
    try:
        return await state.clone.diff_indexes(payload)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (IdentifierInvalid, SecretNotFound) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
