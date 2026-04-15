"""Generate the placeholder launcher icon.

Writes launcher/bibliogon.ico with a simple "B" monogram at multiple
sizes. Runs via ``python scripts/make_icon.py`` from the launcher dir.
Re-run whenever the real art arrives; until then this keeps the build
reproducible from source.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


SIZES = (16, 32, 48, 64, 128, 256)
BG = (43, 37, 31)   # warm dark brown matches the default theme accent
FG = (222, 199, 167)


def build_frame(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    draw = ImageDraw.Draw(img)
    font = _load_font(int(size * 0.72))
    text = "B"
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text(
        ((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1] - int(size * 0.02)),
        text,
        fill=FG,
        font=font,
    )
    return img


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "C:/Windows/Fonts/georgia.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    # PIL's ICO writer reads sizes= off the source image and downscales
    # itself, so we build the largest and let it generate the rest.
    largest = build_frame(max(SIZES))
    out = Path(__file__).resolve().parent.parent / "bibliogon.ico"
    largest.save(out, format="ICO", sizes=[(s, s) for s in SIZES])
    print(f"Wrote {out} with sizes {SIZES}")


if __name__ == "__main__":
    main()
