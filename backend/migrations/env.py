"""Alembic environment configuration for Bibliogon."""

import logging
from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401 - ensure models are registered
from app.database import DATABASE_URL, Base, engine

# Alembic Config object
config = context.config

# Set the database URL from our app config
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Logging.
#
# Skip fileConfig entirely when the app has already configured
# logging. fileConfig is for the standalone `alembic` CLI use case
# where alembic.ini is the only logging source of truth. When this
# env.py runs under app.main's init_db() the FastAPI app has
# already set up handlers + level + formatter via uvicorn or its
# own basicConfig; calling fileConfig here would:
#
#   1. Reset the root-logger level to WARNING per alembic.ini's
#      [logger_root], silencing every app.main INFO line that fires
#      after init_db (plugin discovery, plugin loading, lifespan
#      shutdown). The user-visible symptom: "backend logs show no
#      plugin loading messages, only alembic plugins".
#   2. Replace the app's handler/formatter with alembic's terser
#      "LEVEL [name] msg" shape, breaking timestamp + structured
#      log discipline mid-startup.
#
# Detection: if the root logger already has handlers, the app has
# configured logging; we leave it alone. The standalone `alembic`
# CLI invokes env.py before any handler is attached, so the
# fileConfig path still fires there.
if config.config_file_name is not None and not logging.getLogger().handlers:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Model metadata for autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
