import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
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
    _auto_migrate()


def _auto_migrate():
    """Add missing columns to existing tables (simple forward-only migration).

    SQLAlchemy's create_all only creates new tables but does not add
    columns to existing ones. This function compares the model definitions
    with the actual database schema and adds any missing columns.
    """
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing:
                    col_type = column.type.compile(engine.dialect)
                    nullable = "NULL" if column.nullable else "NOT NULL"
                    default = ""
                    if column.default is not None:
                        default = f" DEFAULT {column.default.arg!r}"
                    sql = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type} {nullable}{default}"
                    conn.execute(text(sql))
