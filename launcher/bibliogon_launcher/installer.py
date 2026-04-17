"""Bibliogon installer: download release ZIP and extract to target dir.

Uses stdlib only (``urllib.request``, ``zipfile``, ``tempfile``) so the
PyInstaller bundle stays small. No git dependency.

The install flow:
1. Download release ZIP from GitHub to a temp file
2. Verify ZIP integrity (``zipfile.is_zipfile``)
3. Extract to target directory (strip top-level archive directory)
4. Generate ``.env`` from ``.env.example`` with a random secret
5. Caller writes the install manifest on success

All functions return ``(ok, detail)`` tuples for consistent error
reporting via the launcher's UI layer.
"""

from __future__ import annotations

import logging
import secrets
import shutil
import tempfile
import zipfile
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

logger = logging.getLogger("bibliogon_launcher.installer")

GITHUB_REPO = "astrapi69/bibliogon"

# The Bibliogon version this launcher was built for. Updated during
# the release workflow (Step 4) alongside the other version strings.
COMPATIBLE_VERSION = "0.17.0"


def release_zip_url(version: str | None = None) -> str:
    """GitHub archive URL for a tagged release."""
    ver = version or COMPATIBLE_VERSION
    tag = ver if ver.startswith("v") else f"v{ver}"
    return f"https://github.com/{GITHUB_REPO}/archive/refs/tags/{tag}.zip"


def download_release(target_dir: Path, version: str | None = None) -> tuple[bool, str]:
    """Download and extract a Bibliogon release to ``target_dir``.

    The ZIP from GitHub contains a single top-level directory named
    ``bibliogon-{version}/``. We strip that prefix so files land
    directly inside ``target_dir``.

    Returns ``(True, "ok")`` on success, ``(False, detail)`` on failure.
    """
    ver = version or COMPATIBLE_VERSION
    url = release_zip_url(ver)
    logger.info("Downloading %s", url)

    tmp_zip = None
    try:
        # Download to temp file (atomic: only use the file if download completes)
        tmp_fd, tmp_zip_path = tempfile.mkstemp(suffix=".zip", prefix="bibliogon-")
        tmp_zip = Path(tmp_zip_path)
        try:
            import os
            os.close(tmp_fd)
            with urlopen(url, timeout=120) as resp, open(tmp_zip, "wb") as out:
                shutil.copyfileobj(resp, out)
        except (URLError, OSError, TimeoutError) as exc:
            return False, f"Download failed: {exc}"

        # Verify ZIP integrity
        if not zipfile.is_zipfile(tmp_zip):
            return False, "Downloaded file is not a valid ZIP archive."

        # Extract with top-level directory stripping
        target_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            # Find the common prefix (e.g. "bibliogon-0.16.0/")
            names = zf.namelist()
            if not names:
                return False, "ZIP archive is empty."
            prefix = names[0].split("/")[0] + "/"
            for member in zf.infolist():
                if member.is_dir():
                    continue
                # Strip the top-level directory
                rel = member.filename
                if rel.startswith(prefix):
                    rel = rel[len(prefix):]
                if not rel:
                    continue
                dest = target_dir / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)

        logger.info("Extracted to %s", target_dir)
        return True, "ok"

    finally:
        # Clean up temp file regardless of outcome
        if tmp_zip and tmp_zip.exists():
            try:
                tmp_zip.unlink()
            except OSError:
                pass


def create_env_file(repo_dir: Path) -> tuple[bool, str]:
    """Create ``.env`` from ``.env.example`` with a generated secret.

    No-op if ``.env`` already exists (preserves user config on re-install).
    """
    env_file = repo_dir / ".env"
    if env_file.is_file():
        return True, "already exists"

    example = repo_dir / ".env.example"
    if not example.is_file():
        return False, f"{example.name} not found in {repo_dir}"

    try:
        text = example.read_text(encoding="utf-8")
        text = text.replace("change-me-to-a-random-secret", secrets.token_hex(32))
        env_file.write_text(text, encoding="utf-8")
    except OSError as exc:
        return False, f"Failed to create .env: {exc}"

    return True, "created"


def remove_install(install_dir: Path) -> tuple[bool, str]:
    """Remove the Bibliogon installation directory.

    Returns ``(True, "ok")`` on success. On Windows, locked files
    (Docker, running processes) cause ``(False, detail)`` with the
    specific path that could not be removed.
    """
    if not install_dir.exists():
        return True, "already removed"
    try:
        shutil.rmtree(install_dir)
    except OSError as exc:
        return False, f"Could not remove {install_dir}: {exc}"
    return True, "ok"
