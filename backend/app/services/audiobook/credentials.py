"""ElevenLabs API-key credential plumbing for the audiobook routes.

Extracted from ``routers/audiobook.py`` (God-file split #8 follow-up,
2026-06-14). Holds the verify / store / read / delete logic for the
ElevenLabs key: storage strategy (encrypted Fernet store when
``BIBLIOGON_CREDENTIALS_SECRET`` is set, legacy plain-text YAML
otherwise), live-engine key push, and the upstream ``GET /v1/user``
verification call.

Per ``.claude/rules/code-hygiene.md`` the functions raise typed
``BibliogonError`` subclasses; the router stays thin and the global
handler in ``main.py`` maps them to HTTP status codes. The status codes
match the pre-split router behaviour 1:1 (400 on a rejected key, 502 on
an unreachable upstream, 500 on a missing config file / absent httpx).
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

import yaml
from ruamel.yaml import YAMLError as RuamelYAMLError

from app import credential_store
from app.exceptions import BibliogonError, ExternalServiceError, ValidationError
from app.yaml_io import read_yaml_roundtrip, write_yaml_roundtrip

logger = logging.getLogger(__name__)

# Path of the audiobook plugin config YAML on disk. Endpoints that need
# to write back into the YAML (the legacy ElevenLabs key) use this so the
# change persists across restarts.
AUDIOBOOK_CONFIG_PATH = Path("config/plugins/audiobook.yaml")
ELEVENLABS_USER_ENDPOINT = "https://api.elevenlabs.io/v1/user"
ELEVENLABS_CRED_FILENAME = "elevenlabs-key.enc"


def _load_yaml_config() -> dict[str, Any]:
    """Read the audiobook plugin config from disk, returning {} if missing."""
    if not AUDIOBOOK_CONFIG_PATH.exists():
        return {}
    try:
        data = read_yaml_roundtrip(AUDIOBOOK_CONFIG_PATH)
        return data if isinstance(data, dict) else {}
    except (OSError, yaml.YAMLError, RuamelYAMLError) as e:
        logger.warning("Failed to read audiobook.yaml: %s", e)
        return {}


def _write_yaml_config(cfg: dict[str, Any]) -> None:
    """Persist the audiobook plugin config to disk.

    The audiobook YAML is the source of truth that the plugin loads on
    activation. We never silently create a fresh file in an unexpected
    location: if the file is missing, the install is broken and we report
    a 500 instead of guessing.
    """
    if not AUDIOBOOK_CONFIG_PATH.exists():
        raise BibliogonError(f"Audiobook plugin config not found at {AUDIOBOOK_CONFIG_PATH}")
    try:
        write_yaml_roundtrip(AUDIOBOOK_CONFIG_PATH, cfg)
    except OSError as e:
        raise BibliogonError(f"Failed to write audiobook config: {e}") from e


def _push_key_to_engine(api_key: str) -> None:
    """Best-effort: push the new key into the live TTS engine module.

    The plugin may or may not be active in this process. Importing it
    lazily lets us update the in-memory key when it is, and skip silently
    when it is not (e.g. premium plugin not licensed).
    """
    try:
        from bibliogon_audiobook.tts_engine import set_elevenlabs_api_key
    except ImportError:
        return
    set_elevenlabs_api_key(api_key)


def get_engine_key() -> str:
    """Read the live ElevenLabs key, trying sources in order:

    1. In-memory engine override (fastest, set by set_elevenlabs_api_key)
    2. Encrypted credential file (if BIBLIOGON_CREDENTIALS_SECRET is set)
    3. Legacy plain-text YAML (backward compat for installs that have not
       migrated yet)
    """
    try:
        from bibliogon_audiobook.tts_engine import get_elevenlabs_api_key

        key = get_elevenlabs_api_key()
        if key:
            return str(key)
    except ImportError:
        pass

    # Encrypted store
    if credential_store.is_configured(ELEVENLABS_CRED_FILENAME):
        try:
            raw = credential_store.load_decrypted(ELEVENLABS_CRED_FILENAME)
            return str(json.loads(raw).get("api_key", "") or "")
        except Exception:
            pass

    # Legacy YAML fallback
    return ((_load_yaml_config().get("elevenlabs") or {}).get("api_key") or "").strip()


def _verify_elevenlabs_key(api_key: str) -> dict[str, Any]:
    """Hit GET /v1/user to verify the key. Returns the parsed user dict.

    Raises a typed ``BibliogonError`` with the upstream message on any
    failure so the Settings UI can show a precise error toast (400 on a
    rejected key, 502 on an unreachable / erroring upstream).
    """
    try:
        import httpx
    except ImportError as e:
        raise BibliogonError(f"httpx not installed in backend environment: {e}") from e
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                ELEVENLABS_USER_ENDPOINT,
                headers={"xi-api-key": api_key},
            )
    except httpx.HTTPError as e:
        raise ExternalServiceError("ElevenLabs", f"unreachable: {e}") from e
    if response.status_code == 401:
        raise ValidationError("ElevenLabs rejected the API key (401 Unauthorized).")
    if response.status_code >= 400:
        raise ExternalServiceError(
            "ElevenLabs",
            f"API error {response.status_code}: {response.text[:200]}",
        )
    try:
        body = response.json()
        return body if isinstance(body, dict) else {}
    except ValueError:
        return {}


def is_elevenlabs_configured() -> bool:
    """Report whether an ElevenLabs API key is currently configured."""
    return bool(get_engine_key())


def verify_and_store_elevenlabs_key(api_key: str) -> dict[str, Any]:
    """Verify, store, and activate an ElevenLabs API key.

    Storage strategy: encrypted via Fernet if ``BIBLIOGON_CREDENTIALS_SECRET``
    is set, plain-text YAML fallback otherwise. The encrypted path is
    preferred for consistency with Google Cloud TTS credentials.

    Returns the configured-state plus the subscription tier / usage info
    parsed from the ElevenLabs ``/v1/user`` response.
    """
    user_info = _verify_elevenlabs_key(api_key)

    if os.environ.get("BIBLIOGON_CREDENTIALS_SECRET"):
        credential_store.save_encrypted(
            json.dumps({"api_key": api_key}).encode(),
            filename=ELEVENLABS_CRED_FILENAME,
        )
        # Clear legacy YAML key so there is no stale plain-text copy.
        cfg = _load_yaml_config()
        if cfg.get("elevenlabs", {}).get("api_key"):
            cfg["elevenlabs"]["api_key"] = ""
            _write_yaml_config(cfg)
    else:
        # No encryption secret -> legacy YAML storage
        cfg = _load_yaml_config()
        cfg.setdefault("elevenlabs", {})["api_key"] = api_key
        _write_yaml_config(cfg)

    _push_key_to_engine(api_key)

    subscription = (user_info.get("subscription") or {}) if isinstance(user_info, dict) else {}
    return {
        "configured": True,
        "tier": subscription.get("tier"),
        "character_count": subscription.get("character_count"),
        "character_limit": subscription.get("character_limit"),
    }


def delete_elevenlabs_key() -> None:
    """Remove the configured ElevenLabs API key from all storage locations."""
    # Encrypted store
    credential_store.secure_delete(ELEVENLABS_CRED_FILENAME)
    # Legacy YAML
    cfg = _load_yaml_config()
    if cfg.get("elevenlabs", {}).get("api_key"):
        cfg["elevenlabs"]["api_key"] = ""
        _write_yaml_config(cfg)
    _push_key_to_engine("")
