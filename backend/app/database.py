import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _resolve_database_url() -> str:
    """Decide which database URL to hand to SQLAlchemy.

    Priority (highest wins):
    1. BIBLIOGON_TEST=1 forces a test-only URL. TEST_DATABASE_URL may
       override; default is sqlite:///:memory:. When BIBLIOGON_TEST is
       set, it is IMPOSSIBLE to reach the production DB from this
       function, which is the whole point (see tests/conftest.py and
       tests/test_test_isolation.py).
    2. DATABASE_URL env var is honoured verbatim.
    3. BIBLIOGON_DATA_DIR derivation wins next: when set, the database
       path is derived as ``<BIBLIOGON_DATA_DIR>/bibliogon.db``. The
       legacy BIBLIOGON_DB_PATH override is ignored when DATA_DIR is
       set.
    4. BIBLIOGON_DB_PATH env var, only when BIBLIOGON_DATA_DIR is NOT
       set. DEPRECATED; emits a logger.warning every time. Kept as a
       backward-compatibility shim for deployments that still pass it
       (e.g. older docker-compose.prod.yml configurations). A later
       release removes the override entirely.
    5. Default falls through to ``app.paths.get_db_path()`` which
       uses platformdirs for the canonical OS-specific data directory.

    Step 2 of DEP-DBPATH-01 (precedence flip): BIBLIOGON_DATA_DIR is
    now the senior source. Users who set BOTH env vars previously
    saw BIBLIOGON_DB_PATH win; from this release onward the
    DATA_DIR-derived path wins. Step 1 (the deprecation warning)
    shipped in v0.27.0; step 3 (full removal) is queued for the
    release after this one.
    """
    if os.getenv("BIBLIOGON_TEST") == "1":
        return os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    if explicit := os.getenv("DATABASE_URL"):
        return explicit
    if os.getenv("BIBLIOGON_DATA_DIR"):
        # Late import: app.paths import is cheap but keeping it inside
        # the function preserves the historical "database.py imports
        # are minimal" property and avoids any circular-import risk
        # with future paths.py extensions.
        from app.paths import get_db_path

        if db_path_override := os.getenv("BIBLIOGON_DB_PATH"):
            logger.warning(
                "BIBLIOGON_DB_PATH=%s is set but BIBLIOGON_DATA_DIR is also "
                "set; BIBLIOGON_DATA_DIR wins (precedence flipped in step 2 "
                "of the deprecation cycle). Remove BIBLIOGON_DB_PATH from "
                "your environment; it will be ignored.",
                db_path_override,
            )
        db_path = get_db_path()
    elif db_path_override := os.getenv("BIBLIOGON_DB_PATH"):
        logger.warning(
            "BIBLIOGON_DB_PATH is deprecated and will be removed in a "
            "future release. Set BIBLIOGON_DATA_DIR instead; the "
            "database path is derived as <BIBLIOGON_DATA_DIR>/bibliogon.db. "
            "Current value: %s",
            db_path_override,
        )
        db_path = Path(db_path_override)
    else:
        from app.paths import get_db_path

        db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path}"


DATABASE_URL = _resolve_database_url()


def _engine_kwargs(url: str) -> dict:
    """SQLAlchemy engine options. In-memory SQLite needs a StaticPool so
    every SessionLocal() call sees the same ephemeral database; the
    default QueuePool hands out independent connections and each one
    gets its own fresh :memory: database, which is fine for a single
    test but breaks autouse create_all/drop_all and FastAPI's DI."""
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if ":memory:" in url:
        from sqlalchemy.pool import StaticPool

        kwargs["poolclass"] = StaticPool
    return kwargs


engine = create_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ARG001
    """Enable WAL + NORMAL sync + foreign keys on every new connection.

    WAL gives us concurrent readers without blocking the writer, which
    matters as soon as background jobs (audiobook, export) run alongside
    the editor saving chapters. synchronous=NORMAL is durable enough for
    a single-user desktop app and avoids the per-commit fsync cost of
    synchronous=FULL. foreign_keys=ON is the SQLite default-that-isn't;
    without it, ON DELETE CASCADE is ignored.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database using Alembic migrations.

    For new databases, creates all tables and stamps the alembic version.
    For existing databases, runs any pending migrations.
    """
    from alembic import command
    from alembic.config import Config

    import app.models  # noqa: F401 - ensure models are registered

    alembic_cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)

    # Check if this is a fresh database (no tables exist)
    from sqlalchemy import inspect

    inspector = inspect(engine)
    has_tables = inspector.has_table("books")
    has_alembic = inspector.has_table("alembic_version")

    if not has_tables:
        # Fresh database: create all tables and stamp as current
        Base.metadata.create_all(bind=engine)
        command.stamp(alembic_cfg, "head")
    elif not has_alembic:
        # Existing database without alembic: stamp as current (assumes schema is up to date)
        command.stamp(alembic_cfg, "head")
    else:
        # Existing database with alembic: run pending migrations
        command.upgrade(alembic_cfg, "head")
