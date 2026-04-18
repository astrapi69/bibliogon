import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DB path: configurable via BIBLIOGON_DB_PATH env var, defaults to backend/bibliogon.db
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DB_PATH = Path(os.getenv("BIBLIOGON_DB_PATH", str(_BACKEND_DIR / "bibliogon.db")))
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
    import app.models  # noqa: F401 - ensure models are registered

    from alembic import command
    from alembic.config import Config

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
