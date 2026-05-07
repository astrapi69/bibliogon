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
    3. BIBLIOGON_DATA_DIR derivation: when set, the database path is
       derived as ``<BIBLIOGON_DATA_DIR>/bibliogon.db``.
    4. Default falls through to ``app.paths.get_db_path()`` which
       uses platformdirs for the canonical OS-specific data directory.

    DEP-DBPATH-01 step 3 (full removal): the legacy
    ``BIBLIOGON_DB_PATH`` env var is no longer honoured as a path
    override. If it is still set in the environment, the resolver
    emits a single warning naming the ignored value so the user can
    see it has no effect, then resolves the path through the normal
    DATA_DIR / platformdirs chain. Step 1 (deprecation warning)
    shipped in v0.27.0; step 2 (precedence flip) shipped in v0.28.0;
    this is the final removal.
    """
    if os.getenv("BIBLIOGON_TEST") == "1":
        return os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    if explicit := os.getenv("DATABASE_URL"):
        return explicit
    if db_path_override := os.getenv("BIBLIOGON_DB_PATH"):
        logger.warning(
            "BIBLIOGON_DB_PATH=%s is set but is no longer honoured as of "
            "the v0.30.0 deprecation removal (DEP-DBPATH-01 step 3). The "
            "database path is determined by BIBLIOGON_DATA_DIR or the "
            "platformdirs default. Remove BIBLIOGON_DB_PATH from your "
            "environment; this warning will be removed in a later release.",
            db_path_override,
        )
    # Late import: app.paths import is cheap but keeping it inside
    # the function preserves the historical "database.py imports
    # are minimal" property and avoids any circular-import risk
    # with future paths.py extensions.
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
