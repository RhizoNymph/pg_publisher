from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PGP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8765

    data_dir: Path = Field(default=Path("./.pg_publisher"))
    sqlite_path: Path = Field(default=Path("./.pg_publisher/store.sqlite"))

    sample_interval_seconds: float = 2.0
    ring_buffer_size: int = 600  # ~20 min at 2s
    statement_timeout_ms: int = 5000

    log_level: str = "INFO"

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
