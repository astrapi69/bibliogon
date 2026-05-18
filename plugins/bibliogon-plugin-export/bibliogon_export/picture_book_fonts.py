"""Picture-book font catalog (Python side mirror of
``frontend/src/data/picture-book-fonts.ts``).

PB-PHASE4 Session 4c-B-1 Finding G3, D8 sub-decision 5-font set.
Five OFL-licensed fonts shipped under ``../fonts/`` for KDP-grade
embedded PDF rendering.

Single-source-of-truth discipline: the ``id`` field MUST match
the TypeScript constant exactly. The TipTap mark attribute value
the editor writes IS what the PDF walker reads + what the
``@font-face`` rule advertises as ``font-family``.

Keep this list + ``frontend/src/data/picture-book-fonts.ts``
in sync at all times. A future cross-cutting-concern check
(SSoT-discovery script per the lessons-learned rule) could
diff them automatically; for now, dual-side review at edit time.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PictureBookFont:
    """Single picture-book font entry."""

    #: Canonical name: matches TipTap mark + ``@font-face`` font-family.
    id: str
    #: Font file name under ``plugins/bibliogon-plugin-export/fonts/``.
    file_name: str


#: The 5 OFL fonts shipped for picture-book PDF export. Order
#: matches the dropdown order in the frontend toolbar.
PICTURE_BOOK_FONTS: tuple[PictureBookFont, ...] = (
    PictureBookFont(
        id="Atkinson Hyperlegible",
        file_name="AtkinsonHyperlegible-Regular.ttf",
    ),
    PictureBookFont(id="Andika", file_name="Andika-Regular.ttf"),
    PictureBookFont(id="Comic Neue", file_name="ComicNeue-Regular.ttf"),
    PictureBookFont(id="Lexend", file_name="Lexend-VariableWeight.ttf"),
    PictureBookFont(
        id="OpenDyslexic",
        file_name="OpenDyslexic-Regular.otf",
    ),
)

#: The default font for picture-book pages without a fontFamily
#: mark (D11 backward-compat: pre-Finding-G picture-books keep
#: their original look).
DEFAULT_PICTURE_BOOK_FONT_ID = "Atkinson Hyperlegible"

#: Directory under the export-plugin package root where the
#: bundled font files live. Returned as an absolute Path so the
#: PDF generator can build ``file://`` URLs for WeasyPrint's
#: @font-face ``src: url(...)`` rules without depending on the
#: caller's CWD.
FONTS_DIR: Path = (Path(__file__).resolve().parent.parent / "fonts").resolve()


def font_face_css() -> str:
    """Build the ``@font-face`` rule block for every shipped font.

    Returns a CSS string with one ``@font-face`` rule per font in
    :data:`PICTURE_BOOK_FONTS`. Each rule uses ``src: url(file://...)``
    so WeasyPrint embeds the font file at render time (KDP-grade
    embedded fonts requirement, per D10).

    Returns
    -------
    str
        Multi-line CSS string. Caller concatenates into the
        document's CSS payload.

    Raises
    ------
    FileNotFoundError
        If any expected font file is missing under :data:`FONTS_DIR`.
        Fail-loud rather than emit broken @font-face rules.
    """
    rules: list[str] = []
    for font in PICTURE_BOOK_FONTS:
        font_path = FONTS_DIR / font.file_name
        if not font_path.is_file():
            raise FileNotFoundError(
                f"Picture-book font file missing: {font_path}. "
                f"Expected for font id '{font.id}'.",
            )
        rules.append(
            f"""@font-face {{
    font-family: "{font.id}";
    src: url("file://{font_path}");
    font-display: swap;
}}""",
        )
    return "\n".join(rules)


def is_known_font(font_id: str | None) -> bool:
    """Whether ``font_id`` matches one of the 5 shipped fonts.

    ``None`` and unknown strings both return ``False``. The PDF
    walker uses this to decide whether to honor a fontFamily mark
    in TipTap JSON or fall back to the default.
    """
    if not font_id:
        return False
    return any(f.id == font_id for f in PICTURE_BOOK_FONTS)
