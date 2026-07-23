# pg_publisher

A local GUI for managing Postgres logical-replication **publications** and
**subscriptions** across multiple databases. It visualises the topology and
shows live replication-lag and related metrics, and exposes the common
publication/subscription mutations as confirmable typed actions.

See [`docs/OVERVIEW.md`](docs/OVERVIEW.md) for the architecture map.

## Requirements

- Postgres 14+ on the target databases, with `wal_level = logical` for
  publishers and appropriate `max_replication_slots` / `max_wal_senders`.
- Python 3.13+
- Node 20+ (for the frontend)
- `pg_dump` on `PATH` if you want to use the "Clone schema" feature
  (`postgresql-client` on Debian/Ubuntu, `postgresql` on Homebrew).
- Optional: Docker (only used by the integration tests via testcontainers).

## Layout

```
backend/pg_publisher/   # FastAPI app + samplers + inspector + actions
backend/tests/          # pytest suite (unit + testcontainers integration)
frontend/               # Vite + React + TypeScript UI
docs/                   # architecture overview + per-feature docs
```

## Running

The Makefile wraps the common flows (`make help` lists everything):

```bash
make setup      # uv sync + npm ci
make dev        # backend on :8765 + Vite dev server on :5173, together
make serve      # single-process deploy: build the UI, serve it all on :8765
make check      # ruff + tsc + pytest
```

Or by hand — backend:

```bash
uv sync                                  # or: pip install -e '.[dev]'
uv run python -m pg_publisher            # http://127.0.0.1:8765
```

Frontend (in another terminal):

```bash
cd frontend
npm install
npm run dev                              # http://127.0.0.1:5173, proxies to backend
```

For a single-process deploy, `npm run build` writes to `frontend/dist/`, which
the backend serves at `/`.

## Docker

```bash
make docker-build   # multi-stage image: UI build + Python 3.13 + pg_dump 17
make docker-up      # app on http://localhost:8765, data in a named volume
make demo-up        # app + two Postgres 17 instances with wal_level=logical
                    #   (pub-db → localhost:5433, sub-db → localhost:5434)
```

Connection secrets are looked up by env-var name, so put them in `.env` —
compose passes it to the container when present (`env_file`, optional). From
inside the container, the demo databases are reachable as `pub-db:5432` and
`sub-db:5432`; databases on the docker host are reachable via
`host.docker.internal` (add an `extra_hosts` mapping on Linux) rather than
`localhost`.

## Adding a connection

Two modes; pick whichever fits how you already manage credentials. Credentials
can be either `export`ed in the shell or placed in a `.env` file in the
working directory — `.env` is loaded into the process environment at startup.

```dotenv
# .env
PGP_CONN_PRIMARY_PW=hunter2
PGP_CONN_REPLICA_DSN=postgres://repuser:hunter2@db2.example.com:5432/app?sslmode=require
```

**Structured.** Explicit host/port/db/user; password lives in its own env var.
```bash
export PGP_CONN_PRIMARY_PW='hunter2'
```
In the UI: **+ Add connection → Structured**, fill in host/db/user, set
`password_env` to `PGP_CONN_PRIMARY_PW`.

**DSN.** A single env var holds a full libpq connection string. Accepts
either URI form or keyword=value form:
```bash
export PGP_CONN_PRIMARY_DSN='postgres://user:hunter2@db.example.com:5432/app?sslmode=require'
# or:
export PGP_CONN_PRIMARY_DSN='host=db.example.com port=5432 dbname=app user=user password=hunter2 sslmode=require'
```
In the UI: **+ Add connection → DSN env var**, set `dsn_env` to
`PGP_CONN_PRIMARY_DSN`.

Click **Test** to verify either way.

The metrics sampler will pick the connection up automatically and you'll see
its publications, subscriptions, and live lag on the topology graph.

## Tests

```bash
uv run pytest                            # unit tests
# Integration tests spin up Postgres via testcontainers; skipped when Docker
# is unavailable.
```
