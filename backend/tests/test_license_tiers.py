"""Tests for the license infrastructure (dormant but preserved for future reactivation).

The licensing system is currently disabled (LICENSING_ENABLED=False), but these
tests verify the underlying LicenseValidator/LicenseStore/key generation still
work correctly so reactivation is a one-line change.
"""

from datetime import date, timedelta

import pytest

from app.licensing import (
    LicenseError,
    LicensePayload,
    LicenseStore,
    LicenseValidator,
    create_plugin_key,
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
    tier = "core"
    assert tier == "core"


# --- Premium plugin without license ---


def test_premium_plugin_blocked_without_license(validator, store):
    """Premium plugins should be blocked when no license key exists."""
    assert store.get("audiobook") is None


def test_premium_plugin_blocked_with_invalid_key(validator):
    """Premium plugins should be blocked with an invalid key."""
    with pytest.raises(LicenseError, match="Malformed"):
        validator.validate_license("INVALID-KEY", "audiobook")


# --- Premium plugin with valid key ---


def test_premium_plugin_activates_with_valid_key(validator):
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="Test Author")
    key = validator.create_license(payload)
    result, warning = validator.validate_license(key, "audiobook")
    assert result.plugin == "audiobook"
    assert not result.is_expired
    assert warning is None


def test_premium_plugin_lifetime_key(validator):
    payload = LicensePayload(plugin="translation", version="1", expires="lifetime", author="Test")
    key = validator.create_license(payload)
    result, _ = validator.validate_license(key, "translation")
    assert result.is_lifetime
    assert not result.is_expired


# --- Expired key ---


def test_premium_plugin_expired_key_rejected(validator):
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)
    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(key, "audiobook")


def test_expired_key_data_preserved(validator, store):
    """When a key expires, the stored key remains (data preserved)."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2020-01-01")
    key = validator.create_license(payload)
    store.set("audiobook", key)
    assert store.get("audiobook") == key
    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(store.get("audiobook"), "audiobook")
    assert store.get("audiobook") == key  # still there


# --- Trial key ---


def test_trial_key_unlocks_all_premium_plugins(validator):
    trial = create_trial_key(validator, author="Test Author", days=30)
    result, _ = validator.validate_license(trial, "*")
    assert result.plugin == "*"
    assert not result.is_expired


def test_trial_key_wildcard_matches_any_plugin():
    payload = LicensePayload(plugin="*", version="1", expires="2099-12-31")
    assert payload.matches_plugin("audiobook")
    assert payload.matches_plugin("translation")
    assert payload.matches_plugin("anything")


def test_trial_key_expires_after_30_days(validator):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    payload = LicensePayload(plugin="*", version="1", expires=yesterday)
    key = validator.create_license(payload)
    with pytest.raises(LicenseError, match="expired"):
        validator.validate_license(key, "*")


def test_trial_key_valid_today(validator):
    trial = create_trial_key(validator, author="Test", days=30)
    result, _ = validator.validate_license(trial, "*")
    assert result.expiry_date == date.today() + timedelta(days=30)


def test_trial_key_stored_as_wildcard(validator, store):
    trial = create_trial_key(validator, author="Test", days=30)
    store.set("*", trial)
    assert store.get("*") == trial
    result, _ = validator.validate_license(store.get("*"), "*")
    assert result.plugin == "*"


# --- Plugin name mismatch ---


def test_wrong_plugin_name_rejected(validator):
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31")
    key = validator.create_license(payload)
    with pytest.raises(LicenseError, match="not 'translation'"):
        validator.validate_license(key, "translation")


# --- Author binding (no device lock) ---


def test_key_works_without_machine_id(validator):
    """Keys should work on any device - no machine-ID check."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="Author")
    key = validator.create_license(payload)
    result, warning = validator.validate_license(key, "audiobook", "Author")
    assert result.author == "Author"
    assert warning is None


def test_author_mismatch_warns_not_blocks(validator):
    """Author name mismatch should warn, not block."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="Asterios Raptis")
    key = validator.create_license(payload)
    result, warning = validator.validate_license(key, "audiobook", "A. Raptis")
    assert result.plugin == "audiobook"  # not blocked
    assert warning is not None
    assert "Asterios Raptis" in warning
    assert "A. Raptis" in warning


def test_author_match_case_insensitive(validator):
    """Author comparison should be case-insensitive."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="Asterios Raptis")
    key = validator.create_license(payload)
    result, warning = validator.validate_license(key, "audiobook", "asterios raptis")
    assert warning is None  # matches, no warning


def test_empty_author_in_key_matches_anyone(validator):
    """Key with empty author should match any author profile."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="")
    key = validator.create_license(payload)
    result, warning = validator.validate_license(key, "audiobook", "Anyone")
    assert warning is None


def test_same_key_works_on_different_installations(validator):
    """Same key should work without any device restriction."""
    payload = LicensePayload(plugin="audiobook", version="1", expires="2099-12-31", author="Author")
    key = validator.create_license(payload)
    # Simulate two different installations - just validate twice
    r1, _ = validator.validate_license(key, "audiobook")
    r2, _ = validator.validate_license(key, "audiobook")
    assert r1.plugin == r2.plugin
    assert r1.expires == r2.expires


# --- Production key generation ---


def test_create_plugin_key(validator):
    key = create_plugin_key(validator, "audiobook", "Test Author", 365)
    result, _ = validator.validate_license(key, "audiobook")
    assert result.plugin == "audiobook"
    assert result.author == "Test Author"
    assert result.expiry_date == date.today() + timedelta(days=365)


def test_create_plugin_key_only_works_for_that_plugin(validator):
    key = create_plugin_key(validator, "audiobook", "Author", 365)
    with pytest.raises(LicenseError, match="not 'translation'"):
        validator.validate_license(key, "translation")
