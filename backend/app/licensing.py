"""Offline license validation using HMAC-SHA256 signatures.

License keys are Base64-encoded JSON payloads signed with HMAC-SHA256.
Validation is offline - no license server needed.

Key format: BIBLIOGON-PLUGINNAME-vVERSION-<base64 payload>.<base64 signature>
Example:    BIBLIOGON-AUDIOBOOK-v1-eyJwbH....<sig>

Payload JSON:
{
    "plugin": "audiobook" | "*",
    "version": "1",
    "expires": "2027-12-31" | "lifetime",
    "author": "Asterios Raptis"
}

Keys are bound to an author name (case-insensitive, soft check) and work
on any device. No machine-ID, no device lock. Trust-based until Phase 11 (SaaS).
"""

import base64
import hashlib
import hmac
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any


class LicenseError(Exception):
    """Raised when a license is invalid, expired, or missing."""


class LicensePayload:
    """Parsed and validated license data."""

    def __init__(
        self,
        plugin: str,
        version: str,
        expires: str,
        author: str = "",
    ) -> None:
        self.plugin = plugin
        self.version = version
        self.expires = expires
        self.author = author

    @property
    def is_lifetime(self) -> bool:
        return self.expires == "lifetime"

    @property
    def expiry_date(self) -> date | None:
        if self.is_lifetime:
            return None
        return date.fromisoformat(self.expires)

    @property
    def is_expired(self) -> bool:
        if self.is_lifetime:
            return False
        expiry = self.expiry_date
        if expiry is None:
            return False
        return date.today() > expiry

    def matches_plugin(self, plugin_name: str) -> bool:
        """Check if this license covers the given plugin. '*' matches all."""
        if self.plugin == "*":
            return True
        return self.plugin.lower() == plugin_name.lower()

    def matches_author(self, author_name: str) -> bool:
        """Case-insensitive author name comparison. Empty author matches all."""
        if not self.author:
            return True
        return self.author.strip().lower() == author_name.strip().lower()

    def to_dict(self) -> dict[str, Any]:
        return {
            "author": self.author,
            "expires": self.expires,
            "plugin": self.plugin,
            "version": self.version,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LicensePayload":
        return cls(
            plugin=data["plugin"],
            version=data["version"],
            expires=data["expires"],
            author=data.get("author", data.get("machine_id", "")),
        )


class LicenseValidator:
    """Validates license keys using HMAC-SHA256."""

    def __init__(self, secret_key: str | bytes) -> None:
        if isinstance(secret_key, str):
            secret_key = secret_key.encode("utf-8")
        self._secret = secret_key

    def create_license(self, payload: LicensePayload) -> str:
        """Create a signed license key string."""
        payload_json = json.dumps(payload.to_dict(), sort_keys=True)
        payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
        signature = self._sign(payload_b64)
        sig_b64 = base64.urlsafe_b64encode(signature).decode()

        prefix = f"BIBLIOGON-{payload.plugin.upper()}-v{payload.version}"
        return f"{prefix}-{payload_b64}.{sig_b64}"

    def validate_license(
        self, license_key: str, plugin_name: str, author_name: str = ""
    ) -> tuple[LicensePayload, str | None]:
        """Validate a license key and return (payload, warning).

        Returns tuple of (LicensePayload, optional warning message).
        Warning is set when author name doesn't match (soft check).
        Raises LicenseError if invalid, expired, or wrong plugin.
        """
        try:
            payload_b64, sig_b64 = self._parse_key(license_key)
        except ValueError as e:
            raise LicenseError(f"Malformed license key: {e}")

        # Verify signature
        expected_sig = self._sign(payload_b64)
        actual_sig = base64.urlsafe_b64decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise LicenseError("Invalid license signature")

        # Decode payload
        try:
            payload_json = base64.urlsafe_b64decode(payload_b64).decode()
            data = json.loads(payload_json)
            payload = LicensePayload.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            raise LicenseError(f"Corrupted license payload: {e}")

        # Check plugin match
        if not payload.matches_plugin(plugin_name):
            raise LicenseError(
                f"License is for plugin '{payload.plugin}', not '{plugin_name}'"
            )

        # Check expiry
        if payload.is_expired:
            raise LicenseError(f"License expired on {payload.expires}")

        # Check author (soft - warning only, no block)
        warning: str | None = None
        if author_name and payload.author and not payload.matches_author(author_name):
            warning = (
                f"License issued for '{payload.author}', "
                f"but author profile shows '{author_name}'"
            )

        return payload, warning

    def _sign(self, data: str) -> bytes:
        return hmac.new(self._secret, data.encode(), hashlib.sha256).digest()

    @staticmethod
    def _parse_key(key: str) -> tuple[str, str]:
        """Parse license key into payload_b64 and sig_b64."""
        parts = key.split("-", 3)
        if len(parts) < 4:
            raise ValueError("Key must have format PREFIX-NAME-VERSION-PAYLOAD.SIG")

        payload_sig = parts[3]
        if "." not in payload_sig:
            raise ValueError("Key must contain PAYLOAD.SIGNATURE")

        payload_b64, sig_b64 = payload_sig.rsplit(".", 1)
        return payload_b64, sig_b64


class LicenseStore:
    """Stores and retrieves license keys from a local file."""

    def __init__(self, path: str | Path = "config/licenses.json") -> None:
        self.path = Path(path)
        self._licenses: dict[str, str] = {}
        self._load()

    def get(self, plugin_name: str) -> str | None:
        return self._licenses.get(plugin_name)

    def set(self, plugin_name: str, license_key: str) -> None:
        self._licenses[plugin_name] = license_key
        self._save()

    def remove(self, plugin_name: str) -> None:
        self._licenses.pop(plugin_name, None)
        self._save()

    def all(self) -> dict[str, str]:
        return dict(self._licenses)

    def _load(self) -> None:
        if self.path.exists():
            try:
                self._licenses = json.loads(self.path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                self._licenses = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self._licenses, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


def create_trial_key(validator: LicenseValidator, author: str = "", days: int = 30) -> str:
    """Create a trial key that unlocks all premium plugins for the given days."""
    expires = (date.today() + timedelta(days=days)).isoformat()
    payload = LicensePayload(plugin="*", version="1", expires=expires, author=author)
    return validator.create_license(payload)


def create_plugin_key(
    validator: LicenseValidator, plugin: str, author: str, days: int = 365
) -> str:
    """Create a production key for a specific plugin."""
    expires = (date.today() + timedelta(days=days)).isoformat()
    payload = LicensePayload(plugin=plugin, version="1", expires=expires, author=author)
    return validator.create_license(payload)


def get_license_secret() -> str:
    """Get the license signing secret from environment or default."""
    return os.getenv("BIBLIOGON_LICENSE_SECRET", "pluginforge-default-key")
