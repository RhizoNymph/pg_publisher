from __future__ import annotations

import aiosqlite

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,                                  -- 'structured' | 'dsn'
    role TEXT NOT NULL DEFAULT 'auto',
    -- structured fields (nullable for dsn rows):
    host TEXT,
    port INTEGER,
    database TEXT,
    username TEXT,
    password_env TEXT,
    ssl_mode TEXT,
    -- dsn fields (nullable for structured rows):
    dsn_env TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
        (kind = 'structured'
         AND host IS NOT NULL AND port IS NOT NULL AND database IS NOT NULL
         AND username IS NOT NULL AND password_env IS NOT NULL
         AND ssl_mode IS NOT NULL AND dsn_env IS NULL)
        OR
        (kind = 'dsn'
         AND dsn_env IS NOT NULL
         AND host IS NULL AND port IS NULL AND database IS NULL
         AND username IS NULL AND password_env IS NULL AND ssl_mode IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS metric_samples (
    connection_id TEXT NOT NULL,
    stream_kind TEXT NOT NULL,         -- 'publication_slot' | 'subscription'
    stream_name TEXT NOT NULL,
    sampled_at TEXT NOT NULL,
    lag_bytes INTEGER,
    lag_seconds REAL,
    state TEXT,
    extra_json TEXT,
    PRIMARY KEY (connection_id, stream_kind, stream_name, sampled_at)
);

CREATE INDEX IF NOT EXISTS idx_metric_samples_recent
    ON metric_samples (connection_id, sampled_at DESC);

CREATE TABLE IF NOT EXISTS action_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_json TEXT NOT NULL,
    sql_text TEXT NOT NULL,
    outcome TEXT NOT NULL,             -- 'ok' | 'error'
    error_message TEXT
);
"""


async def init_schema(db: aiosqlite.Connection) -> None:
    await db.executescript(SCHEMA_SQL)
    await db.commit()
