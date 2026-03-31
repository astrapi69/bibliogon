FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends pandoc && \
    rm -rf /var/lib/apt/lists/*

RUN pip install poetry

WORKDIR /app

COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --no-root

COPY . .

# Create non-root user and data directory
RUN groupadd -r bibliogon && useradd -r -g bibliogon bibliogon && \
    mkdir -p /app/data && chown -R bibliogon:bibliogon /app

USER bibliogon

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
