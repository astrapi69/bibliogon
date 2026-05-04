"""Verify _resolve_database_url honours its priority chain.

Covers the BIBLIOGON_DB_PATH deprecation warning emitted when the
legacy override is set without the canonical BIBLIOGON_DATA_DIR. Also
pins the priority order so a future precedence flip is intentional.

Spies on ``app.database.logger.warning`` directly because the suite
reconfigures loggers across tests and ``caplog`` / direct handler
attachment is not reliable cross-test for module-level loggers (same
pattern as test_settings_api.py and test_config_loader.py).
"""

import pytest

from app import database as database_module
from app.database import _resolve_database_url


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Clear every env var the resolver inspects so each test starts clean."""
    for var in (
        "BIBLIOGON_TEST",
        "DATABASE_URL",
        "BIBLIOGON_DB_PATH",
        "BIBLIOGON_DATA_DIR",
        "TEST_DATABASE_URL",
    ):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def warning_spy(monkeypatch):
    """Capture every ``logger.warning`` call on app.database."""
    captured: list[str] = []
    original = database_module.logger.warning

    def spy(msg, *args, **kwargs):
        captured.append(msg % args if args else msg)
        return original(msg, *args, **kwargs)

    monkeypatch.setattr(database_module.logger, "warning", spy)
    return captured


def test_db_path_alone_emits_deprecation_warning(monkeypatch, tmp_path, warning_spy):
    db_file = tmp_path / "explicit.db"
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(db_file))

    url = _resolve_database_url()

    assert url == f"sqlite:///{db_file}"
    deprecation_msgs = [m for m in warning_spy if "deprecated" in m.lower()]
    assert len(deprecation_msgs) == 1
    assert "BIBLIOGON_DATA_DIR" in deprecation_msgs[0]
    assert str(db_file) in deprecation_msgs[0]


def test_db_path_with_data_dir_does_not_warn(monkeypatch, tmp_path, warning_spy):
    """User in transition (both vars set) should not be warned every startup."""
    db_file = tmp_path / "explicit.db"
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(db_file))
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    url = _resolve_database_url()

    assert url == f"sqlite:///{db_file}"
    assert not any("deprecated" in m.lower() for m in warning_spy)


def test_data_dir_alone_does_not_warn(monkeypatch, tmp_path, warning_spy):
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    url = _resolve_database_url()

    assert url == f"sqlite:///{tmp_path / 'bibliogon.db'}"
    assert not any("deprecated" in m.lower() for m in warning_spy)


def test_database_url_takes_precedence_over_db_path(monkeypatch, tmp_path):
    """DATABASE_URL is honoured verbatim and short-circuits everything below."""
    monkeypatch.setenv("DATABASE_URL", "sqlite:///custom.db")
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(tmp_path / "ignored.db"))

    assert _resolve_database_url() == "sqlite:///custom.db"


def test_test_mode_short_circuits_all_overrides(monkeypatch, tmp_path):
    monkeypatch.setenv("BIBLIOGON_TEST", "1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///should-be-ignored.db")
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(tmp_path / "also-ignored.db"))

    assert _resolve_database_url() == "sqlite:///:memory:"
