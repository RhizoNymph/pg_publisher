.DEFAULT_GOAL := help

UV      ?= uv
NPM     ?= npm
COMPOSE ?= docker compose

.PHONY: help setup setup-backend setup-frontend dev backend frontend build serve \
        test lint typecheck mypy check clean \
        docker-build docker-up docker-down docker-logs demo-up demo-down

help: ## list available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-16s %s\n", $$1, $$2}'

# ---- setup -----------------------------------------------------------------

setup: setup-backend setup-frontend ## install backend + frontend dependencies

setup-backend: ## sync the Python env (incl. dev extras) with uv
	$(UV) sync --extra dev

setup-frontend: ## install frontend deps from the lockfile
	cd frontend && $(NPM) ci

# ---- development -----------------------------------------------------------

dev: ## run backend and frontend dev servers together (Ctrl-C stops both)
	$(MAKE) -j2 backend frontend

backend: ## run the API on http://127.0.0.1:8765
	$(UV) run python -m pg_publisher

frontend: ## run the Vite dev server on http://127.0.0.1:5173 (proxies to :8765)
	cd frontend && $(NPM) run dev

# ---- build / deploy --------------------------------------------------------

build: ## build the frontend into frontend/dist
	cd frontend && $(NPM) run build

serve: build ## single-process deploy: build the UI, serve everything on :8765
	$(UV) run python -m pg_publisher

# ---- quality ---------------------------------------------------------------

test: ## run the backend test suite
	$(UV) run pytest

lint: ## ruff over the backend
	$(UV) run ruff check backend

typecheck: ## frontend tsc --noEmit
	cd frontend && $(NPM) run typecheck

mypy: ## backend mypy --strict (has known pre-existing errors)
	$(UV) run mypy

check: lint typecheck test ## lint + typecheck + tests

# ---- docker ----------------------------------------------------------------

docker-build: ## build the app image
	$(COMPOSE) build

docker-up: ## start the app container on :8765
	$(COMPOSE) up -d app

docker-down: ## stop and remove containers
	$(COMPOSE) down

docker-logs: ## follow app container logs
	$(COMPOSE) logs -f app

demo-up: ## start app + two demo Postgres 17 instances (wal_level=logical)
	$(COMPOSE) --profile demo up -d

demo-down: ## stop the demo stack (volumes are kept)
	$(COMPOSE) --profile demo down

# ---- misc ------------------------------------------------------------------

clean: ## remove build artifacts and tool caches
	rm -rf frontend/dist .pytest_cache .ruff_cache .mypy_cache
