# Stage 1: Build - resolve and install all production dependencies
FROM python:3.11-slim AS builder

RUN pip install --no-cache-dir poetry

WORKDIR /build

# Copy backend dependency definitions
COPY backend/pyproject.toml backend/poetry.lock* ./backend/

# Copy local plugin packages (path dependencies in backend/pyproject.toml).
# Glob picks up every plugins/bibliogon-plugin-* directory so new plugins do
# not require a Dockerfile change. .dockerignore strips tests and caches.
COPY plugins/ ./plugins/

WORKDIR /build/backend

# Install all production deps via Poetry first (resolves everything correctly)
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --no-root --only main

# Reinstall local plugins as proper packages (not .pth path links).
# Loop matches the COPY glob so any plugin in the tree is installed.
RUN for pkg in ../plugins/bibliogon-plugin-*; do \
        pip install --no-cache-dir --force-reinstall --no-deps "$pkg"; \
    done

# Remove .pth files left by Poetry's editable installs
RUN rm -f /usr/local/lib/python3.11/site-packages/bibliogon_plugin_*.pth

# Stage 2: Runtime - minimal image without Poetry, pip cache, or dev deps
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends pandoc && \
    rm -rf /var/lib/apt/lists/*

# Copy installed Python packages and scripts from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

WORKDIR /app

# Copy backend application code
COPY backend/ .

# Create non-root user and data directory
RUN groupadd -r bibliogon && useradd -r -g bibliogon bibliogon && \
    mkdir -p /app/data && chown -R bibliogon:bibliogon /app

USER bibliogon

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
