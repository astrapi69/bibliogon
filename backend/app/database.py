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
    import app.models  # noqa: F401 - ensure models are registered with Base.metadata
    Base.metadata.create_all(bind=engine)
