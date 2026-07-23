from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from pg_publisher.actions.models import ActionRequest, ActionResult
from pg_publisher.api.deps import get_state
from pg_publisher.api.state import AppState
from pg_publisher.errors import ConnectionNotFound, IdentifierInvalid, SecretNotFound

router = APIRouter(prefix="/actions", tags=["actions"])


@router.post("/{connection_id}", response_model=ActionResult)
async def run_action(
    connection_id: UUID,
    action: ActionRequest,
    state: AppState = Depends(get_state),
) -> ActionResult:
    try:
        return await state.executor.execute(connection_id, action)
    except ConnectionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except IdentifierInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SecretNotFound as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
