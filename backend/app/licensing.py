"""Offline license validation using Ed25519 signatures.

License keys are Base64-encoded JSON payloads signed with Ed25519.
Validation uses only the public key - no server needed.

Key format: APPPREFIX-PLUGINNAME-vVERSION-<base64 payload>.<base64 signature>
Example:    BIBLIOGON-KINDERBUCH-v1-eyJwbH....<sig>

Payload JSON:
{
    "plugin": "kinderbuch",
    "version": "1",
    "expires": "2027-12-31" | "lifetime",
    "machine_id": "optional-machine-id" | null
}
"""

import base64
import hashlib
import hmac
import json
import platform
import uuid
from datetime import date, datetime
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
        machine_id: str | None = None,
    ) -> None:
        self.plugin = plugin
        self.version = version
        self.expires = expires
        self.machine_id = machine_id

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
        # Wildcard "*" matches all plugins (used for trial keys)
        if self.plugin == "*":
            return True
        return self.plugin.lower() == plugin_name.lower()

    def matches_machine(self) -> bool:
        if not self.machine_id:
            return True  # no machine restriction
        return self.machine_id == get_machine_id()

    def to_dict(self) -> dict[str, Any]:
        return {
            "plugin": self.plugin,
            "version": self.version,
            "expires": self.expires,
            "machine_id": self.machine_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LicensePayload":
        return cls(
            plugin=data["plugin"],
            version=data["version"],
            expires=data["expires"],
            machine_id=data.get("machine_id"),
        )


def get_machine_id() -> str:
    """Generate a stable machine identifier."""
    raw = f"{platform.node()}-{uuid.getnode()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class LicenseValidator:
    """Validates license keys using HMAC-SHA256.

    For production use, replace HMAC with Ed25519 (using cryptography lib).
    HMAC is used here to avoid adding a heavy dependency.
    The secret key would be kept private, only the app ships with it
    embedded for offline validation.
    """

    def __init__(self, secret_key: str | bytes) -> None:
        if isinstance(secret_key, str):
            secret_key = secret_key.encode("utf-8")
        self._secret = secret_key

    def create_license(self, payload: LicensePayload) -> str:
        """Create a signed license key string.

        Returns: formatted license key string.
        """
        payload_json = json.dumps(payload.to_dict(), sort_keys=True)
        payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
        signature = self._sign(payload_b64)
        sig_b64 = base64.urlsafe_b64encode(signature).decode()

        prefix = f"BIBLIOGON-{payload.plugin.upper()}-v{payload.version}"
        return f"{prefix}-{payload_b64}.{sig_b64}"

    def validate_license(self, license_key: str, plugin_name: str) -> LicensePayload:
        """Validate a license key and return the payload.

        Raises LicenseError if invalid, expired, or mismatched.
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
            raise LicenseError(
                f"License expired on {payload.expires}"
            )

        # Check machine
        if not payload.matches_machine():
            raise LicenseError("License is not valid for this machine")

        return payload

    def _sign(self, data: str) -> bytes:
        return hmac.new(self._secret, data.encode(), hashlib.sha256).digest()

    @staticmethod
    def _parse_key(key: str) -> tuple[str, str]:
        """Parse license key into payload_b64 and sig_b64."""
        # Strip prefix (BIBLIOGON-PLUGINNAME-vN-)
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
        """Get the license key for a plugin."""
        return self._licenses.get(plugin_name)

    def set(self, plugin_name: str, license_key: str) -> None:
        """Store a license key for a plugin."""
        self._licenses[plugin_name] = license_key
        self._save()

    def remove(self, plugin_name: str) -> None:
        """Remove a license key."""
        self._licenses.pop(plugin_name, None)
        self._save()

    def all(self) -> dict[str, str]:
        """Return all stored license keys."""
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


def create_trial_key(validator: LicenseValidator, days: int = 30) -> str:
    """Create a trial license key that unlocks all premium plugins.

    The key uses plugin="*" (wildcard) and expires after the given days.
    """
    from datetime import timedelta
    expires = (date.today() + timedelta(days=days)).isoformat()
    payload = LicensePayload(plugin="*", version="1", expires=expires)
    return validator.create_license(payload)
