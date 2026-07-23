from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pg_publisher.actions import ActionExecutor
from pg_publisher.actions.audit import AuditLog
from pg_publisher.api import actions as actions_router
from pg_publisher.api import clone as clone_router
from pg_publisher.api import connections as connections_router
from pg_publisher.api import snapshot as snapshot_router
from pg_publisher.api import ws as ws_router
from pg_publisher.api.state import AppState
from pg_publisher.clone import CloneExecutor
from pg_publisher.connections import ConnectionRegistry, ConnectionStore
from pg_publisher.logging import configure_logging, log
from pg_publisher.metrics import MetricsSupervisor
from pg_publisher.metrics.history import HistoryStore
from pg_publisher.settings import Settings


def _build_state(settings: Settings) -> AppState:
    settings.ensure_dirs()
    store = ConnectionStore(settings.sqlite_path)
    registry = ConnectionRegistry(statement_timeout_ms=settings.statement_timeout_ms)
    history = HistoryStore(settings.sqlite_path)
    supervisor = MetricsSupervisor(
        store=store,
        registry=registry,
        history=history,
        interval_seconds=settings.sample_interval_seconds,
        ring_capacity=settings.ring_buffer_size,
    )
    audit = AuditLog(settings.sqlite_path)
    executor = ActionExecutor(store=store, registry=registry, audit=audit)
    clone = CloneExecutor(store=store, registry=registry)
    return AppState(
        settings=settings,
        store=store,
        registry=registry,
        history=history,
        supervisor=supervisor,
        audit=audit,
        executor=executor,
        clone=clone,
    )


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    state: AppState = app.state.app_state
    await state.store.open()
    await state.history.open()
    await state.audit.open()
    await state.supervisor.start()
    log.info("startup_complete", port=state.settings.port)
    try:
        yield
    finally:
        await state.supervisor.stop()
        await state.registry.close_all()
        await state.audit.close()
        await state.history.close()
        await state.store.close()
        log.info("shutdown_complete")


def create_app(settings: Settings | None = None) -> FastAPI:
    # Also load when create_app() is invoked directly (e.g. by uvicorn's
    # factory loader, tests, or a third-party ASGI runner) so behaviour
    # matches `python -m pg_publisher`.
    load_dotenv(override=False)
    settings = settings or Settings()
    configure_logging(settings.log_level)
    state = _build_state(settings)

    app = FastAPI(title="pg_publisher", version="0.1.0", lifespan=_lifespan)
    app.state.app_state = state

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )

    app.include_router(connections_router.router)
    app.include_router(snapshot_router.router)
    app.include_router(actions_router.router)
    app.include_router(clone_router.router)
    app.include_router(ws_router.router)

    static_dir = Path(__file__).resolve().parents[3] / "frontend" / "dist"
    if static_dir.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=static_dir / "assets"),
            name="assets",
        )

        @app.get("/")
        async def index() -> FileResponse:
            return FileResponse(static_dir / "index.html")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app
