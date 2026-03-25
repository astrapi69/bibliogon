import os

import pytest

# Use in-memory DB for tests
os.environ["BIBLIOGON_TEST"] = "1"

from app.database import Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
