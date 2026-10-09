"""Regenerate the KDP cover-validation fixture images.

Run from the repo root, in an environment with Pillow (the kdp plugin's
venv has it):
    python3 e2e/fixtures/regen_kdp_cover_fixtures.py

Two solid-colour PNGs, because the cover step reads nothing but the
dimensions and the byte length:

- ``kdp-cover-pass.png`` 640x1024 - over the 625x1000 minimum with a
  ratio of 1.6, so every rule passes and the wizard can advance past the
  cover step. The smoke spec deferred that path for want of exactly this
  file.
- ``kdp-cover-too-small.png`` 300x480 - under the minimum on both axes,
  so the step renders its error row.

Solid colour keeps both under 4 KB. They are committed rather than built
at test time so the Playwright run needs no image library.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

FIXTURES = Path(__file__).resolve().parent

IMAGES: tuple[tuple[str, tuple[int, int], tuple[int, int, int]], ...] = (
    ("kdp-cover-pass.png", (640, 1024), (34, 51, 85)),
    ("kdp-cover-too-small.png", (300, 480), (85, 51, 34)),
)


def main() -> None:
    for name, size, colour in IMAGES:
        path = FIXTURES / name
        Image.new("RGB", size, colour).save(path, format="PNG", optimize=True)
        print(f"{name}: {size[0]}x{size[1]}, {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
