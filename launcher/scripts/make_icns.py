"""Convert bibliogon.ico to bibliogon.icns for the macOS .app bundle.

macOS-only step: creates a .iconset directory with the standard
Retina-aware size set, then invokes `iconutil` to produce the .icns.
Runs in the macOS CI job before PyInstaller. Not needed on Windows
or Linux builds.

Usage:
    python scripts/make_icns.py

Requires:
    Pillow (already a dev dependency for make_icon.py)
    iconutil (ships with macOS)
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    here = Path(__file__).parent.parent
    ico_path = here / "bibliogon.ico"
    icns_path = here / "bibliogon.icns"
    iconset = here / "icon.iconset"

    if not ico_path.is_file():
        print(f"error: {ico_path} not found. Run make_icon.py first.", file=sys.stderr)
        return 1

    # Pick the largest frame from the multi-size .ico file. Pillow
    # exposes ICO frames via seek(); iterate and keep the largest.
    best: Image.Image | None = None
    with Image.open(ico_path) as img:
        n = getattr(img, "n_frames", 1)
        for frame in range(n):
            try:
                img.seek(frame)
            except (EOFError, ValueError):
                break
            area = img.size[0] * img.size[1]
            if best is None or area > best.size[0] * best.size[1]:
                best = img.copy().convert("RGBA")
    if best is None:
        print(f"error: could not read any frame from {ico_path}", file=sys.stderr)
        return 1
    src = best

    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()

    # Standard .icns size set. @2x = Retina variant at double resolution.
    for s in (16, 32, 64, 128, 256, 512):
        src.resize((s, s), Image.LANCZOS).save(iconset / f"icon_{s}x{s}.png")
        src.resize((s * 2, s * 2), Image.LANCZOS).save(iconset / f"icon_{s}x{s}@2x.png")

    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(icns_path)],
        check=True,
    )
    shutil.rmtree(iconset)
    print(f"wrote {icns_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
