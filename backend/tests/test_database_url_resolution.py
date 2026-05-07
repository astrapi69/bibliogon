"""Verify _resolve_database_url honours its priority chain.

Covers DEP-DBPATH-01 step 3 (full removal of BIBLIOGON_DB_PATH as a
path override): when the env var is set, the resolver no longer uses
it for path resolution but emits a warning naming the ignored value
so the user can see it has no effect. The path always resolves
through the normal DATA_DIR / platformdirs chain. Step 1 (the
deprecation warning) shipped in v0.27.0 and step 2 (precedence flip)
in v0.28.0; this is the final removal in v0.30.0.

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


def test_db_path_alone_is_ignored_with_warning(monkeypatch, tmp_path, warning_spy):
    """Step-3 final removal: BIBLIOGON_DB_PATH alone no longer drives path
    resolution. The resolver falls through to the platformdirs default and
    emits a warning naming the ignored value."""
    db_file = tmp_path / "ignored.db"
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(db_file))

    url = _resolve_database_url()

    # The DB_PATH location is NOT used; resolver falls through to the
    # platformdirs default (which the function-local get_db_path call
    # produces). The exact location varies per host, so the test only
    # asserts that DB_PATH is NOT honoured.
    assert url.startswith("sqlite:///")
    assert str(db_file) not in url
    # Single warning naming the ignored value.
    ignored_msgs = [m for m in warning_spy if "no longer honoured" in m]
    assert len(ignored_msgs) == 1
    assert str(db_file) in ignored_msgs[0]


def test_db_path_with_data_dir_is_ignored_with_warning(
    monkeypatch, tmp_path, warning_spy
):
    """Same warning regardless of whether DATA_DIR is also set. Path
    resolves to <DATA_DIR>/bibliogon.db; DB_PATH is fully ignored."""
    db_file = tmp_path / "ignored.db"
    data_dir = tmp_path / "data"
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(db_file))
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(data_dir))

    url = _resolve_database_url()

    # DATA_DIR-derived path wins; DB_PATH location is NOT used.
    assert url == f"sqlite:///{data_dir / 'bibliogon.db'}"
    # Single warning naming the ignored DB_PATH value.
    ignored_msgs = [m for m in warning_spy if "no longer honoured" in m]
    assert len(ignored_msgs) == 1
    assert str(db_file) in ignored_msgs[0]


def test_data_dir_alone_does_not_warn(monkeypatch, tmp_path, warning_spy):
    monkeypatch.setenv("BIBLIOGON_DATA_DIR", str(tmp_path))

    url = _resolve_database_url()

    assert url == f"sqlite:///{tmp_path / 'bibliogon.db'}"
    assert not any("no longer honoured" in m for m in warning_spy)
    assert not any("deprecated" in m.lower() for m in warning_spy)


def test_neither_env_var_set_does_not_warn(monkeypatch, warning_spy):
    """The default platformdirs path is used silently when neither
    BIBLIOGON_DATA_DIR nor BIBLIOGON_DB_PATH is set."""
    url = _resolve_database_url()

    assert url.startswith("sqlite:///")
    assert not any("no longer honoured" in m for m in warning_spy)


def test_database_url_takes_precedence_over_db_path(monkeypatch, tmp_path):
    """DATABASE_URL is honoured verbatim and short-circuits everything
    below, including the DB_PATH ignore-warning path."""
    monkeypatch.setenv("DATABASE_URL", "sqlite:///custom.db")
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(tmp_path / "ignored.db"))

    assert _resolve_database_url() == "sqlite:///custom.db"


def test_test_mode_short_circuits_all_overrides(monkeypatch, tmp_path):
    monkeypatch.setenv("BIBLIOGON_TEST", "1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///should-be-ignored.db")
    monkeypatch.setenv("BIBLIOGON_DB_PATH", str(tmp_path / "also-ignored.db"))

    assert _resolve_database_url() == "sqlite:///:memory:"
