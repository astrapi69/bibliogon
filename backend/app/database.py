import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# DB path: configurable via BIBLIOGON_DB_PATH env var, defaults to backend/bibliogon.db
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DB_PATH = Path(os.getenv("BIBLIOGON_DB_PATH", str(_BACKEND_DIR / "bibliogon.db")))
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
