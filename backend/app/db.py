from __future__ import annotations

import datetime as dt
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Where your repertoire lives. Override with CHESS_COACH_DB to keep it
# somewhere else (the Docker image does this so it survives rebuilds).
DB_PATH = Path(os.environ.get("CHESS_COACH_DB") or BACKEND_DIR / "chess_coach.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def utcnow() -> dt.datetime:
    """Naive UTC timestamp (what SQLite stores), without the deprecated utcnow()."""
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. create_all() never alters an
# existing table, so older databases get these added in place on startup.
_ADDED_COLUMNS = {
    "review_states": {
        "learned": "BOOLEAN NOT NULL DEFAULT 0",
        "lapses": "INTEGER NOT NULL DEFAULT 0",
    },
}


def migrate(bind=None) -> None:
    bind = bind or engine
    inspector = inspect(bind)
    with bind.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if not inspector.has_table(table):
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                if name == "learned":
                    # Lines drilled before "learn" existed count as already learned.
                    conn.execute(text("UPDATE review_states SET learned = 1 WHERE total_attempts > 0"))


def init_db(bind=None) -> None:
    from . import models  # noqa: F401  (ensure models are registered)

    bind = bind or engine
    migrate(bind)                       # upgrade tables from older versions first
    Base.metadata.create_all(bind=bind)  # then create anything missing
