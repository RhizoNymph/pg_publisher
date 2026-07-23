# ---- frontend build ---------------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- runtime ------------------------------------------------------------------
FROM python:3.13-slim-bookworm

# pg_dump for the clone feature. Bookworm ships postgresql-client 15, whose
# pg_dump refuses to dump from newer servers, so install 17 from PGDG.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY backend ./backend
# Editable install keeps the package rooted at /app so the backend's static
# file lookup (source tree relative) resolves to /app/frontend/dist.
RUN pip install --no-cache-dir -e .
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PGP_HOST=0.0.0.0
EXPOSE 8765
# Connection store + metrics history (Settings.data_dir defaults to ./.pg_publisher).
VOLUME /app/.pg_publisher
CMD ["pg-publisher"]
