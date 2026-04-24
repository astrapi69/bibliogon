"""Regenerate e2e/fixtures/minimal-book.bgb.

Run from the repo root:
    python3 e2e/fixtures/regen_minimal_bgb.py

The generated archive is the minimum shape BgbImportHandler
accepts: manifest.json at the root + a single book dir with
book.json + one chapter json. No assets. Keeps the Playwright
spec fast and the binary fixture under a few hundred bytes.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

BOOK_ID = "e2e-bgb-smoke"
CHAPTER_ID = f"{BOOK_ID}-ch-1"

MANIFEST = {"format": "bibliogon-backup", "version": 1}

BOOK = {
    "id": BOOK_ID,
    "title": "BGB Smoke Book",
    "author": "Playwright",
    "language": "en",
    "chapters": [
        {
            "id": CHAPTER_ID,
            "title": "Chapter One",
            "content": "Hello from the .bgb smoke fixture.",
            "position": 0,
        }
    ],
    "assets": [],
}

CHAPTER = {
    "id": CHAPTER_ID,
    "title": "Chapter One",
    "content": "Hello from the .bgb smoke fixture.",
    "position": 0,
}


def build() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(MANIFEST, indent=2))
        zf.writestr(f"books/{BOOK_ID}/book.json", json.dumps(BOOK, indent=2))
        zf.writestr(
            f"books/{BOOK_ID}/chapters/{CHAPTER_ID}.json",
            json.dumps(CHAPTER, indent=2),
        )
    return buf.getvalue()


def main() -> None:
    target = Path(__file__).parent / "minimal-book.bgb"
    target.write_bytes(build())
    print(f"Wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
