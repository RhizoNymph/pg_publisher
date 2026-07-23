from __future__ import annotations

from starlette.requests import HTTPConnection

from pg_publisher.api.state import AppState


def get_state(connection: HTTPConnection) -> AppState:
    """Resolve the AppState from either an HTTP request or a WebSocket.

    Starlette's `HTTPConnection` is the common base of `Request` and
    `WebSocket`; FastAPI injects whichever matches the route's scope.
    """
    state: AppState = connection.app.state.app_state
    return state
