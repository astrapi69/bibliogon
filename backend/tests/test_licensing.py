"""Unit tests for `app.licensing`.

The module implements offline HMAC-SHA256 license validation. Although the
licensing infrastructure is currently dormant (LICENSING_ENABLED=False),
the code path remains in the tree and is security-critical: a weak
signature check or wildcard bug would matter the moment the feature is
reactivated. These tests pin every branch in the class API plus the
helper functions, with explicit coverage of the negative security paths
(tampered signature, tampered payload, wrong secret, malformed key).
"""

import json
from datetime import date, timedelta

import pytest

from app.licensing import (
    LicenseError,
    LicensePayload,
    LicenseStore,
    LicenseValidator,
    create_plugin_key,
    create_trial_key,
    get_license_secret,
)


# --- LicensePayload.is_lifetime / expiry_date / is_expired -----------------


def test_is_lifetime_true_when_expires_is_lifetime():
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    assert p.is_lifetime is True
    assert p.expiry_date is None
    assert p.is_expired is False


def test_is_expired_false_for_future_date():
    future = (date.today() + timedelta(days=7)).isoformat()
    p = LicensePayload(plugin="audiobook", version="1", expires=future)
    assert p.is_expired is False
    assert p.expiry_date == date.fromisoformat(future)


def test_is_expired_true_for_past_date():
    past = (date.today() - timedelta(days=1)).isoformat()
    p = LicensePayload(plugin="audiobook", version="1", expires=past)
    assert p.is_expired is True


def test_is_expired_false_on_expiry_day_boundary():
    """`is_expired` uses `>`, so the licence is still valid ON its expiry day."""
    today = date.today().isoformat()
    p = LicensePayload(plugin="audiobook", version="1", expires=today)
    assert p.is_expired is False


# --- LicensePayload.matches_plugin -----------------------------------------


def test_matches_plugin_exact_name():
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    assert p.matches_plugin("audiobook") is True
    assert p.matches_plugin("export") is False


def test_matches_plugin_case_insensitive():
    p = LicensePayload(plugin="AudioBook", version="1", expires="lifetime")
    assert p.matches_plugin("audiobook") is True
    assert p.matches_plugin("AUDIOBOOK") is True


def test_matches_plugin_wildcard_matches_everything():
    p = LicensePayload(plugin="*", version="1", expires="lifetime")
    assert p.matches_plugin("audiobook") is True
    assert p.matches_plugin("kdp") is True
    assert p.matches_plugin("anything-else") is True


# --- LicensePayload.matches_author -----------------------------------------


def test_matches_author_empty_payload_matches_anything():
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime", author="")
    assert p.matches_author("anyone") is True
    assert p.matches_author("") is True


def test_matches_author_case_insensitive_and_trimmed():
    p = LicensePayload(
        plugin="audiobook", version="1", expires="lifetime", author="Asterios Raptis"
    )
    assert p.matches_author("asterios raptis") is True
    assert p.matches_author("  ASTERIOS RAPTIS  ") is True
    assert p.matches_author("somebody else") is False


# --- LicensePayload.to_dict / from_dict ------------------------------------


def test_to_dict_from_dict_roundtrip():
    original = LicensePayload(plugin="kdp", version="1", expires="2027-12-31", author="A")
    restored = LicensePayload.from_dict(original.to_dict())
    assert restored.to_dict() == original.to_dict()


def test_from_dict_legacy_machine_id_falls_back_to_author():
    """Older licence payloads stored the buyer as `machine_id` - the accessor
    still reads those entries so old licences keep working."""
    p = LicensePayload.from_dict(
        {"plugin": "audiobook", "version": "1", "expires": "lifetime", "machine_id": "Legacy"}
    )
    assert p.author == "Legacy"


# --- LicenseValidator.create_license ---------------------------------------


SECRET = "unit-test-secret"


def _fresh_validator(secret: str = SECRET) -> LicenseValidator:
    return LicenseValidator(secret)


def test_create_license_produces_expected_prefix():
    v = _fresh_validator()
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime", author="A")
    key = v.create_license(p)
    assert key.startswith("BIBLIOGON-AUDIOBOOK-v1-")
    assert "." in key  # payload.signature separator


def test_create_license_accepts_bytes_secret():
    v = LicenseValidator(SECRET.encode("utf-8"))
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = v.create_license(p)
    payload, _ = v.validate_license(key, "audiobook")
    assert payload.plugin == "audiobook"


# --- LicenseValidator.validate_license: happy paths ------------------------


def test_validate_license_happy_path_no_warning():
    v = _fresh_validator()
    expires = (date.today() + timedelta(days=30)).isoformat()
    p = LicensePayload(plugin="audiobook", version="1", expires=expires, author="Author X")
    key = v.create_license(p)
    payload, warning = v.validate_license(key, "audiobook", author_name="Author X")
    assert payload.plugin == "audiobook"
    assert warning is None


def test_validate_license_wildcard_unlocks_any_plugin():
    v = _fresh_validator()
    p = LicensePayload(plugin="*", version="1", expires="lifetime")
    key = v.create_license(p)
    for plugin in ["audiobook", "kdp", "grammar"]:
        payload, _ = v.validate_license(key, plugin)
        assert payload.plugin == "*"


def test_validate_license_lifetime_never_expires():
    v = _fresh_validator()
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = v.create_license(p)
    payload, _ = v.validate_license(key, "audiobook")
    assert payload.is_expired is False


def test_validate_license_author_mismatch_returns_warning_not_error():
    v = _fresh_validator()
    p = LicensePayload(
        plugin="audiobook", version="1", expires="lifetime", author="Alice"
    )
    key = v.create_license(p)
    payload, warning = v.validate_license(key, "audiobook", author_name="Bob")
    assert payload.plugin == "audiobook"
    assert warning is not None
    assert "Alice" in warning
    assert "Bob" in warning


# --- LicenseValidator.validate_license: negative paths ---------------------


def test_validate_license_tampered_signature_raises():
    v = _fresh_validator()
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = v.create_license(p)
    # Flip one char in the signature tail
    tampered = key[:-1] + ("A" if key[-1] != "A" else "B")
    with pytest.raises(LicenseError, match="Invalid license signature"):
        v.validate_license(tampered, "audiobook")


def test_validate_license_tampered_payload_raises():
    v = _fresh_validator()
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = v.create_license(p)
    payload_part, sig_part = key.rsplit(".", 1)
    # Append a character to the payload - signature no longer matches
    tampered = payload_part + "X." + sig_part
    with pytest.raises(LicenseError):
        v.validate_license(tampered, "audiobook")


def test_validate_license_wrong_secret_raises():
    creator = _fresh_validator("secret-A")
    verifier = _fresh_validator("secret-B")
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = creator.create_license(p)
    with pytest.raises(LicenseError, match="Invalid license signature"):
        verifier.validate_license(key, "audiobook")


def test_validate_license_malformed_key_missing_parts():
    v = _fresh_validator()
    with pytest.raises(LicenseError, match="Malformed"):
        v.validate_license("BIBLIOGON-AUDIOBOOK", "audiobook")


def test_validate_license_missing_dot_separator():
    v = _fresh_validator()
    with pytest.raises(LicenseError, match="Malformed"):
        v.validate_license("BIBLIOGON-AUDIOBOOK-v1-payloadwithoutdot", "audiobook")


def test_validate_license_wrong_plugin_raises():
    v = _fresh_validator()
    p = LicensePayload(plugin="audiobook", version="1", expires="lifetime")
    key = v.create_license(p)
    with pytest.raises(LicenseError, match="not 'kdp'"):
        v.validate_license(key, "kdp")


def test_validate_license_expired_raises():
    v = _fresh_validator()
    past = (date.today() - timedelta(days=1)).isoformat()
    p = LicensePayload(plugin="audiobook", version="1", expires=past)
    key = v.create_license(p)
    with pytest.raises(LicenseError, match="expired"):
        v.validate_license(key, "audiobook")


# --- LicenseStore ----------------------------------------------------------


def test_license_store_empty_when_missing_file(tmp_path):
    store = LicenseStore(path=tmp_path / "licenses.json")
    assert store.all() == {}
    assert store.get("audiobook") is None


def test_license_store_set_get_remove(tmp_path):
    store = LicenseStore(path=tmp_path / "licenses.json")
    store.set("audiobook", "KEY-AUDIO")
    assert store.get("audiobook") == "KEY-AUDIO"
    store.remove("audiobook")
    assert store.get("audiobook") is None


def test_license_store_remove_missing_key_is_noop(tmp_path):
    store = LicenseStore(path=tmp_path / "licenses.json")
    # Must not raise
    store.remove("does-not-exist")
    assert store.all() == {}


def test_license_store_persists_across_instances(tmp_path):
    path = tmp_path / "licenses.json"
    first = LicenseStore(path=path)
    first.set("audiobook", "KEY-A")
    first.set("kdp", "KEY-K")

    second = LicenseStore(path=path)
    assert second.all() == {"audiobook": "KEY-A", "kdp": "KEY-K"}


def test_license_store_corrupt_json_starts_empty(tmp_path):
    path = tmp_path / "licenses.json"
    path.write_text("{{{not valid json", encoding="utf-8")
    store = LicenseStore(path=path)
    assert store.all() == {}


def test_license_store_save_creates_parent_directory(tmp_path):
    path = tmp_path / "nested" / "deeper" / "licenses.json"
    store = LicenseStore(path=path)
    store.set("kdp", "KEY-K")
    assert path.exists()
    assert json.loads(path.read_text(encoding="utf-8")) == {"kdp": "KEY-K"}


# --- Helpers: create_trial_key / create_plugin_key -------------------------


def test_create_trial_key_uses_wildcard_plugin():
    v = _fresh_validator()
    key = create_trial_key(v, author="A", days=30)
    payload, _ = v.validate_license(key, "any-plugin")
    assert payload.plugin == "*"
    assert payload.author == "A"


def test_create_trial_key_default_30_days_from_today():
    v = _fresh_validator()
    key = create_trial_key(v, author="A")
    payload, _ = v.validate_license(key, "audiobook")
    expiry = date.fromisoformat(payload.expires)
    assert expiry == date.today() + timedelta(days=30)


def test_create_plugin_key_binds_to_specific_plugin():
    v = _fresh_validator()
    key = create_plugin_key(v, plugin="audiobook", author="A", days=365)
    payload, _ = v.validate_license(key, "audiobook")
    assert payload.plugin == "audiobook"
    # Same key cannot unlock a different plugin
    with pytest.raises(LicenseError):
        v.validate_license(key, "kdp")


# --- Helpers: get_license_secret -------------------------------------------


def test_get_license_secret_uses_env_var(monkeypatch):
    monkeypatch.setenv("BIBLIOGON_LICENSE_SECRET", "env-secret")
    assert get_license_secret() == "env-secret"


def test_get_license_secret_default_when_env_unset(monkeypatch):
    monkeypatch.delenv("BIBLIOGON_LICENSE_SECRET", raising=False)
    assert get_license_secret() == "pluginforge-default-key"
