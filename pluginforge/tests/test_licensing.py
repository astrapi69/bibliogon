"""Tests for licensing module."""

from pathlib import Path

import pytest

from pluginforge.licensing import (
    LicenseError,
    LicensePayload,
    LicenseStore,
    LicenseValidator,
    get_machine_id,
)


SECRET = "test-secret-key-for-signing"


class TestLicensePayload:

    def test_lifetime_license(self) -> None:
        payload = LicensePayload(plugin="test", version="1", expires="lifetime")
        assert payload.is_lifetime
        assert not payload.is_expired
        assert payload.expiry_date is None

    def test_valid_date_license(self) -> None:
        payload = LicensePayload(plugin="test", version="1", expires="2099-12-31")
        assert not payload.is_lifetime
        assert not payload.is_expired

    def test_expired_license(self) -> None:
        payload = LicensePayload(plugin="test", version="1", expires="2020-01-01")
        assert payload.is_expired

    def test_matches_plugin(self) -> None:
        payload = LicensePayload(plugin="kinderbuch", version="1", expires="lifetime")
        assert payload.matches_plugin("kinderbuch")
        assert payload.matches_plugin("KINDERBUCH")
        assert not payload.matches_plugin("kdp")

    def test_no_machine_id_matches_any(self) -> None:
        payload = LicensePayload(plugin="test", version="1", expires="lifetime")
        assert payload.matches_machine()

    def test_roundtrip_dict(self) -> None:
        payload = LicensePayload(
            plugin="test", version="1", expires="2099-12-31", machine_id="abc123"
        )
        data = payload.to_dict()
        restored = LicensePayload.from_dict(data)
        assert restored.plugin == "test"
        assert restored.expires == "2099-12-31"
        assert restored.machine_id == "abc123"


class TestLicenseValidator:

    def test_create_and_validate(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="kinderbuch", version="1", expires="lifetime")
        key = validator.create_license(payload)

        result = validator.validate_license(key, "kinderbuch")
        assert result.plugin == "kinderbuch"
        assert result.is_lifetime

    def test_validate_with_expiry(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="kdp", version="1", expires="2099-06-30")
        key = validator.create_license(payload)

        result = validator.validate_license(key, "kdp")
        assert result.expires == "2099-06-30"
        assert not result.is_expired

    def test_expired_license_raises(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="test", version="1", expires="2020-01-01")
        key = validator.create_license(payload)

        with pytest.raises(LicenseError, match="expired"):
            validator.validate_license(key, "test")

    def test_wrong_plugin_raises(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="kinderbuch", version="1", expires="lifetime")
        key = validator.create_license(payload)

        with pytest.raises(LicenseError, match="not 'kdp'"):
            validator.validate_license(key, "kdp")

    def test_tampered_key_raises(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="test", version="1", expires="lifetime")
        key = validator.create_license(payload)

        # Tamper with the payload
        parts = key.rsplit(".", 1)
        tampered = parts[0] + "X." + parts[1]

        with pytest.raises(LicenseError, match="Invalid license signature"):
            validator.validate_license(tampered, "test")

    def test_wrong_secret_raises(self) -> None:
        creator = LicenseValidator("secret-A")
        checker = LicenseValidator("secret-B")

        payload = LicensePayload(plugin="test", version="1", expires="lifetime")
        key = creator.create_license(payload)

        with pytest.raises(LicenseError, match="Invalid license signature"):
            checker.validate_license(key, "test")

    def test_malformed_key_raises(self) -> None:
        validator = LicenseValidator(SECRET)

        with pytest.raises(LicenseError, match="Malformed"):
            validator.validate_license("garbage", "test")

    def test_key_format(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(plugin="kinderbuch", version="1", expires="lifetime")
        key = validator.create_license(payload)

        assert key.startswith("BIBLIOGON-KINDERBUCH-v1-")
        assert "." in key

    def test_machine_id_mismatch_raises(self) -> None:
        validator = LicenseValidator(SECRET)
        payload = LicensePayload(
            plugin="test", version="1", expires="lifetime", machine_id="wrong-machine"
        )
        key = validator.create_license(payload)

        with pytest.raises(LicenseError, match="not valid for this machine"):
            validator.validate_license(key, "test")

    def test_machine_id_correct(self) -> None:
        validator = LicenseValidator(SECRET)
        machine = get_machine_id()
        payload = LicensePayload(
            plugin="test", version="1", expires="lifetime", machine_id=machine
        )
        key = validator.create_license(payload)

        result = validator.validate_license(key, "test")
        assert result.machine_id == machine


class TestLicenseStore:

    def test_set_and_get(self, tmp_path: Path) -> None:
        store = LicenseStore(tmp_path / "licenses.json")
        store.set("kinderbuch", "SOME-KEY")
        assert store.get("kinderbuch") == "SOME-KEY"

    def test_persistence(self, tmp_path: Path) -> None:
        path = tmp_path / "licenses.json"
        store1 = LicenseStore(path)
        store1.set("kdp", "KDP-KEY")

        store2 = LicenseStore(path)
        assert store2.get("kdp") == "KDP-KEY"

    def test_remove(self, tmp_path: Path) -> None:
        store = LicenseStore(tmp_path / "licenses.json")
        store.set("test", "KEY")
        store.remove("test")
        assert store.get("test") is None

    def test_all(self, tmp_path: Path) -> None:
        store = LicenseStore(tmp_path / "licenses.json")
        store.set("a", "KEY-A")
        store.set("b", "KEY-B")
        assert store.all() == {"a": "KEY-A", "b": "KEY-B"}

    def test_missing_file(self, tmp_path: Path) -> None:
        store = LicenseStore(tmp_path / "nonexistent" / "licenses.json")
        assert store.get("test") is None


class TestGetMachineId:

    def test_returns_string(self) -> None:
        mid = get_machine_id()
        assert isinstance(mid, str)
        assert len(mid) == 16

    def test_stable(self) -> None:
        assert get_machine_id() == get_machine_id()
