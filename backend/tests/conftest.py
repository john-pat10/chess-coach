"""Point the app at a throwaway database so tests never touch a real repertoire."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_tmp = tempfile.mkdtemp(prefix="chess-coach-tests-")
os.environ["CHESS_COACH_DB"] = str(Path(_tmp) / "test.db")

import pytest  # noqa: E402


@pytest.fixture()
def db():
    """A fresh in-memory database session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db import Base, init_db

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    init_db(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db):
    """The real FastAPI app, wired to the in-memory database."""
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def override():
        yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
