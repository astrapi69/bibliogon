"""Integration tests for the license management API endpoints.

Covers:
  GET    /api/licenses              -> list stored licenses with status
  POST   /api/licenses              -> activate a license key
  DELETE /api/licenses/{plugin}     -> deactivate (remove) a license key

Uses the real LicenseValidator and LicenseStore via TestClient, but
patches the store path to a temp file so the real licenses.json is
never touched.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.licensing import (
    LicensePayload,
    LicenseStore,
    LicenseValidator,
    create_plugin_key,
    create_trial_key,
)
from app.main import app
from app.routers import licenses as licenses_module

SECRET = "test-secret-integration"


@pytest.fixture
def validator():
    return LicenseValidator(SECRET)


@pytest.fixture
def store(tmp_path):
    return LicenseStore(tmp_path / "test-licenses.json")


@pytest.fixture
def client(validator, store):
    """TestClient with license module configured to use temp store."""
    original_validator = licenses_module._validator
    original_store = licenses_module._store
    original_manager = licenses_module._manager

    licenses_module._validator = validator
    licenses_module._store = store
    licenses_module._manager = None  # skip plugin activation side effects

    yield TestClient(app)

    licenses_module._validator = original_validator
    licenses_module._store = original_store
    licenses_module._manager = original_manager


# --- GET /api/licenses ---


def test_list_licenses_empty(client):
    """Empty store returns empty dict."""
    resp = client.get("/api/licenses")
    assert resp.status_code == 200
    assert resp.json() == {}


def test_list_licenses_shows_valid_key(client, validator, store):
    """Valid key appears with status 'valid' and metadata."""
    key = create_plugin_key(validator, "audiobook", "Test Author", 365)
    store.set("audiobook", key)

    resp = client.get("/api/licenses")
    assert resp.status_code == 200
    data = resp.json()
    assert "audiobook" in data
    assert data["audiobook"]["status"] == "valid"
    assert data["audiobook"]["author"] == "Test Author"
    assert data["audiobook"]["key_full"] == key


def test_list_licenses_shows_expired_key(client, validator, store):
    """Expired key appears with status 'invalid' and error detail."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)
    store.set("audiobook", key)

    resp = client.get("/api/licenses")
    assert resp.status_code == 200
    data = resp.json()
    assert data["audiobook"]["status"] == "invalid"
    assert "expired" in data["audiobook"]["error"].lower()


def test_list_licenses_shows_trial_wildcard(client, validator, store):
    """Trial key stored as '*' appears in the list."""
    trial = create_trial_key(validator, author="Test", days=30)
    store.set("*", trial)

    resp = client.get("/api/licenses")
    assert resp.status_code == 200
    data = resp.json()
    assert "*" in data
    assert data["*"]["status"] == "valid"


# --- POST /api/licenses ---


def test_activate_valid_key(client, validator):
    """Activating a valid key stores it and returns success."""
    key = create_plugin_key(validator, "translation", "Author", 365)

    resp = client.post(
        "/api/licenses",
        json={"plugin_name": "translation", "license_key": key},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["plugin"] == "translation"
    assert body["status"] == "activated"
    assert body["author"] == "Author"
    assert body["expires"] is not None

    # Verify it persists - shows up in GET
    list_resp = client.get("/api/licenses")
    assert "translation" in list_resp.json()


def test_activate_invalid_key_returns_400(client):
    """Malformed key is rejected with HTTP 400."""
    resp = client.post(
        "/api/licenses",
        json={"plugin_name": "audiobook", "license_key": "INVALID-GARBAGE"},
    )
    assert resp.status_code == 400
    assert "Malformed" in resp.json()["detail"]


def test_activate_expired_key_returns_400(client, validator):
    """Expired key is rejected with HTTP 400."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)

    resp = client.post(
        "/api/licenses",
        json={"plugin_name": "audiobook", "license_key": key},
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


def test_activate_wrong_plugin_returns_400(client, validator):
    """Key for a different plugin is rejected."""
    key = create_plugin_key(validator, "audiobook", "Author", 365)

    resp = client.post(
        "/api/licenses",
        json={"plugin_name": "translation", "license_key": key},
    )
    assert resp.status_code == 400
    assert "not 'translation'" in resp.json()["detail"]


def test_activate_replaces_existing_key(client, validator, store):
    """Activating a new key for the same plugin replaces the old one."""
    old_key = create_plugin_key(validator, "audiobook", "Old Author", 365)
    store.set("audiobook", old_key)

    new_key = create_plugin_key(validator, "audiobook", "New Author", 365)
    resp = client.post(
        "/api/licenses",
        json={"plugin_name": "audiobook", "license_key": new_key},
    )
    assert resp.status_code == 200
    assert resp.json()["author"] == "New Author"

    # Old key is gone
    list_resp = client.get("/api/licenses")
    assert list_resp.json()["audiobook"]["author"] == "New Author"


# --- DELETE /api/licenses/{plugin} ---


def test_deactivate_license(client, validator, store):
    """Deactivating removes the key from the store."""
    key = create_plugin_key(validator, "audiobook", "Author", 365)
    store.set("audiobook", key)

    resp = client.delete("/api/licenses/audiobook")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deactivated"

    # Verify removal
    list_resp = client.get("/api/licenses")
    assert "audiobook" not in list_resp.json()


def test_deactivate_nonexistent_is_idempotent(client):
    """Deactivating a plugin without a key does not error."""
    resp = client.delete("/api/licenses/nonexistent")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deactivated"


def test_activate_then_deactivate_roundtrip(client, validator):
    """Full cycle: activate -> verify -> deactivate -> verify gone."""
    key = create_plugin_key(validator, "grammar", "Author", 365)

    # Activate
    client.post("/api/licenses", json={"plugin_name": "grammar", "license_key": key})

    # Verify active
    list_resp = client.get("/api/licenses")
    assert "grammar" in list_resp.json()
    assert list_resp.json()["grammar"]["status"] == "valid"

    # Deactivate
    client.delete("/api/licenses/grammar")

    # Verify gone
    list_resp = client.get("/api/licenses")
    assert "grammar" not in list_resp.json()
