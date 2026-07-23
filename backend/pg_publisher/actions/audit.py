from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import aiosqlite

from pg_publisher.actions.models import ActionRequest


class AuditLog:
    def __init__(self, sqlite_path: Path) -> None:
        self._sqlite_path = sqlite_path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._db = await aiosqlite.connect(self._sqlite_path)

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    async def record(
        self,
        connection_id: UUID,
        action: ActionRequest,
        sql_text: str,
        outcome: str,
        error_message: str | None = None,
    ) -> None:
        if self._db is None:
            raise RuntimeError("AuditLog not open")
        await self._db.execute(
            """
            INSERT INTO action_audit
                (connection_id, occurred_at, action_type, action_json,
                 sql_text, outcome, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(connection_id),
                datetime.now(UTC).isoformat(),
                action.kind,
                json.dumps(action.model_dump(mode="json")),
                sql_text,
                outcome,
                error_message,
            ),
        )
        await self._db.commit()
