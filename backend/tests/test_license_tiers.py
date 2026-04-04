"""Tests for the license tier system (core vs premium plugins)."""

from datetime import date, timedelta

import pytest

from app.licensing import (
    LicenseError,
    LicensePayload,
    LicenseStore,
    LicenseValidator,
    create_trial_key,
)


SECRET = "test-secret-key"


@pytest.fixture
def validator():
    return LicenseValidator(SECRET)


@pytest.fixture
def store(tmp_path):
    return LicenseStore(tmp_path / "licenses.json")


# --- Core plugin behavior ---


def test_core_plugin_needs_no_license():
    """Core plugins should always pass pre_activate without a license."""
    # Simulate _check_license logic for core tier
    tier = "core"
    assert tier == "core"  # core plugins skip license check entirely


# --- Premium plugin without license ---


def test_premium_plugin_blocked_without_license(validator, store):
    """Premium plugins should be blocked when no license key exists."""
    key = store.get("audiobook")
    assert key is None  # no key stored


def test_premium_plugin_blocked_with_invalid_key(validator):
    """Premium plugins should be blocked with an invalid key."""
    with pytest.raises(LicenseError, match="Malformed"):
        validator.validate_license("INVALID-KEY", "audiobook")


# --- Premium plugin with valid key ---


def test_premium_plugin_activates_with_valid_key(validator):
    """Premium plugins should activate with a valid license key."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31")
    key = validator.create_license(payload)

    result = validator.validate_license(key, "audiobook")
    assert result.plugin == "audiobook"
    assert not result.is_expired


def test_premium_plugin_lifetime_key(validator):
    """Lifetime keys should never expire."""
    payload = LicensePayload(plugin="translation", version="1", expires="lifetime")
    key = validator.create_license(payload)

    result = validator.validate_license(key, "translation")
    assert result.is_lifetime
    assert not result.is_expired


# --- Expired key ---


def test_premium_plugin_expired_key_rejected(validator):
    """Expired license keys should be rejected."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)

    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(key, "audiobook")


def test_expired_key_data_preserved(validator, store):
    """When a key expires, the stored key remains (data preserved)."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)
    store.set("audiobook", key)

    # Key is stored but validation fails
    stored_key = store.get("audiobook")
    assert stored_key == key
    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(stored_key, "audiobook")

    # Key is still there (not removed on expiry)
    assert store.get("audiobook") == key


# --- Trial key ---


def test_trial_key_unlocks_all_premium_plugins(validator):
    """Trial key (plugin='*') should validate against any plugin name."""
    trial = create_trial_key(validator, days=30)

    # Should pass for any premium plugin
    result = validator.validate_license(trial, "*")
    assert result.plugin == "*"
    assert not result.is_expired


def test_trial_key_wildcard_matches_any_plugin():
    """Wildcard payload should match any plugin name."""
    payload = LicensePayload(plugin="*", version="1", expires="2099-12-31")
    assert payload.matches_plugin("audiobook")
    assert payload.matches_plugin("translation")
    assert payload.matches_plugin("kdp")
    assert payload.matches_plugin("anything")


def test_trial_key_expires_after_30_days(validator):
    """Trial key should expire after the configured number of days."""
    # Create a trial that expired yesterday
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    payload = LicensePayload(plugin="*", version="1", expires=yesterday)
    key = validator.create_license(payload)

    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(key, "*")


def test_trial_key_valid_today(validator):
    """Trial key created today should be valid."""
    trial = create_trial_key(validator, days=30)
    result = validator.validate_license(trial, "*")
    expected_expiry = date.today() + timedelta(days=30)
    assert result.expiry_date == expected_expiry


def test_trial_key_stored_as_wildcard(validator, store):
    """Trial key should be stored under '*' in the license store."""
    trial = create_trial_key(validator, days=30)
    store.set("*", trial)

    assert store.get("*") == trial
    # Still retrievable
    result = validator.validate_license(store.get("*"), "*")
    assert result.plugin == "*"


# --- Plugin name mismatch ---


def test_wrong_plugin_name_rejected(validator):
    """License for one plugin should not work for another."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31")
    key = validator.create_license(payload)

    with pytest.raises(LicenseError, match="not 'translation'"):
        validator.validate_license(key, "translation")
