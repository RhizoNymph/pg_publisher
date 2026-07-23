from __future__ import annotations

import uvicorn
from dotenv import load_dotenv

from pg_publisher.settings import Settings


def main() -> None:
    # Populate os.environ from .env so connection secrets referenced by
    # name (password_env / dsn_env) resolve without needing `export`.
    load_dotenv(override=False)
    settings = Settings()
    uvicorn.run(
        "pg_publisher.api.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        log_config=None,
        reload=False,
    )


if __name__ == "__main__":
    main()
