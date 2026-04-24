"""Repro for the CSS-not-imported bug on a specific WBT shape.

User reported two real write-book-template ZIPs with identical
``config/styles.css`` locations: one imports CSS, the other
doesn't. Broken repo has stray ``assets/*.jpg`` and
``assets/image_prompts.json`` at the top of ``assets/`` plus
a ``config/character-profile/`` sub-directory.

This test first reproduces the reported failure (before the
fix) and then becomes the regression guard after.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.models import Book


def _broken_shape_zip(tmp_dir: Path) -> Path:
    """Mirrors the user's broken repo layout as closely as practical.

    Real repo: das-erwachen-der-waechter. Keeps every structural
    quirk the working repo (Rueckkehr-oder-Befreiung) does NOT have:
    - chapter_*.jpg images directly at assets/ top-level (not in
      assets/figures/)
    - image_prompts.json stray at assets/ top-level
    - config/character-profile/ nested directory with many .md
    - front-matter/ + back-matter/ in manuscript/
    - README.md at project root (not inside config/)
    - no LICENSE, pyproject.toml, or pytest.ini (those might matter)
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("broken/README.md", "# das-erwachen-der-waechter\n")
        zf.writestr(
            "broken/config/metadata.yaml",
            "title: Das Erwachen\nauthor: Draven Quantum\nlang: de\n",
        )
        zf.writestr("broken/config/amazon-kdp-info.md", "KDP notes\n")
        zf.writestr(
            "broken/config/book-description.html",
            "<p>Die Waechter.</p>",
        )
        zf.writestr("broken/config/categories.md", "- Fantasy\n")
        zf.writestr(
            "broken/config/cover-back-page-author-introduction.md",
            "Autor-Bio\n",
        )
        zf.writestr(
            "broken/config/cover-back-page-description.md",
            "Rueckseite\n",
        )
        zf.writestr(
            "broken/config/export-settings.yaml",
            "section_order:\n  ebook:\n    - chapters\n",
        )
        zf.writestr("broken/config/keywords.md", "- fantasy\n- magie\n")
        zf.writestr("broken/config/styles.css", "body { color: black; }\n")
        zf.writestr("broken/config/todos.md", "- ship v1\n")
        zf.writestr("broken/config/voice-settings.yaml", "engine: edge\n")
        # Nested config/character-profile/ directory.
        for name in (
            "aida-ramic",
            "daryl-mensah",
            "elowen-cross",
            "liviana-stein",
            "marek-wolfe",
            "nilda-harkin",
            "raban-koehler",
            "tanis-voss",
        ):
            zf.writestr(
                f"broken/config/character-profile/{name}.md",
                f"# {name.replace('-', ' ').title()}\n\nProfile.\n",
            )
        # assets/
        zf.writestr(
            "broken/assets/author/draven-quantum-01.png",
            b"\x89PNG\r\n\x1a\n",
        )
        zf.writestr("broken/assets/covers/cover.png", b"\x89PNG\r\n\x1a\n")
        # Top-level chapter images.
        for i in range(1, 9):
            zf.writestr(
                f"broken/assets/chapter_{i:02d}_scene.jpg",
                b"\xff\xd8\xff\xe0",
            )
        zf.writestr("broken/assets/prolog_signal.jpg", b"\xff\xd8\xff\xe0")
        zf.writestr(
            "broken/assets/image_prompts.json",
            '[{"chapter": 1, "prompt": "a scene"}]',
        )
        # manuscript/ with front + chapters + back.
        zf.writestr(
            "broken/manuscript/front-matter/preface.md",
            "# Vorwort\n\nTo the reader.\n",
        )
        for i in range(1, 9):
            zf.writestr(
                f"broken/manuscript/chapters/{i:02d}-ch.md",
                f"# Kapitel {i}\n\nInhalt.\n",
            )
        zf.writestr(
            "broken/manuscript/back-matter/about-the-author.md",
            "# Ueber den Autor\n\nBio.\n",
        )
    path = tmp_dir / "broken.zip"
    path.write_bytes(buf.getvalue())
    return path


def _working_shape_zip(tmp_dir: Path) -> Path:
    """Baseline: the reported working-repo layout in minimal form."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "working/config/metadata.yaml",
            "title: Rueckkehr\nauthor: Stelio\nlang: de\n",
        )
        zf.writestr(
            "working/config/styles.css",
            "body { color: navy; }\n",
        )
        zf.writestr("working/assets/covers/cover.png", b"\x89PNG\r\n\x1a\n")
        zf.writestr(
            "working/assets/figures/diagrams/flow.png", b"\x89PNG\r\n\x1a\n"
        )
        zf.writestr(
            "working/manuscript/chapters/01.md", "# C1\n\nBody.\n"
        )
    path = tmp_dir / "working.zip"
    path.write_bytes(buf.getvalue())
    return path


def _execute_and_read(zip_path: Path) -> Book:
    Base.metadata.create_all(bind=engine)
    handler = WbtImportHandler()
    detected = handler.detect(str(zip_path))
    book_id = handler.execute(
        str(zip_path),
        detected,
        overrides={},
        duplicate_action="create",
    )
    with SessionLocal() as session:
        book = session.query(Book).filter(Book.id == book_id).one()
        session.expunge(book)
        return book


def test_broken_shape_still_imports_custom_css(tmp_path: Path) -> None:
    """REGRESSION: stray assets/*.jpg + config/character-profile/ sub-
    directory must not prevent config/styles.css from being read."""
    book = _execute_and_read(_broken_shape_zip(tmp_path))
    assert book.custom_css is not None, (
        "config/styles.css was not imported from the broken-shape WBT repo"
    )
    assert "color: black" in book.custom_css


def test_working_shape_still_imports_custom_css(tmp_path: Path) -> None:
    """Baseline: the reported working-shape repo still imports CSS
    after whatever fix was applied to handle the broken shape."""
    book = _execute_and_read(_working_shape_zip(tmp_path))
    assert book.custom_css is not None
    assert "color: navy" in book.custom_css


def test_broken_shape_detect_surfaces_custom_css_in_preview(
    tmp_path: Path,
) -> None:
    """DetectedProject.custom_css must carry the stylesheet content so
    the wizard preview can show it. Same root cause as the import-side
    bug."""
    zip_path = _broken_shape_zip(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.custom_css is not None
    assert "color: black" in detected.custom_css


def test_broken_shape_does_not_crash_on_stray_json(tmp_path: Path) -> None:
    """assets/image_prompts.json must not crash asset iteration - a
    failure here would be logged but the whole import would not skip
    the css-reading step downstream."""
    zip_path = _broken_shape_zip(tmp_path)
    detected = WbtImportHandler().detect(str(zip_path))
    # Stray JSON appears as an asset with purpose 'other'.
    json_assets = [
        a for a in detected.assets if a.filename == "image_prompts.json"
    ]
    assert len(json_assets) == 1
    assert json_assets[0].purpose == "other"


def test_backfill_custom_css_from_source_populates_null_column(
    tmp_path: Path,
) -> None:
    """Existing Book row with custom_css=None gets populated when the
    caller points the backfill helper at a source project root with a
    real stylesheet. Used to repair books imported before the
    partial-extraction fix shipped."""
    from app.services.backup.project_import import (
        backfill_custom_css_from_source,
    )

    # Create a fresh Book row without CSS.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        session.add(Book(id="backfill-test", title="T", author="A", language="de"))
        session.commit()

    # Extract a real WBT project to disk (skip the handler so no
    # partial-extraction protection interferes with the test setup).
    extracted = tmp_path / "extracted"
    extracted.mkdir()
    with zipfile.ZipFile(_broken_shape_zip(tmp_path), "r") as zf:
        zf.extractall(extracted)
    project_root = extracted / "broken"
    assert (project_root / "config" / "styles.css").exists()

    with SessionLocal() as session:
        changed = backfill_custom_css_from_source(
            session, "backfill-test", project_root
        )
        assert changed is True
        book = session.query(Book).filter(Book.id == "backfill-test").one()
        assert "color: black" in (book.custom_css or "")


def test_backfill_is_noop_when_book_already_has_css(tmp_path: Path) -> None:
    from app.services.backup.project_import import (
        backfill_custom_css_from_source,
    )

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        session.add(
            Book(
                id="backfill-noop",
                title="T",
                author="A",
                language="de",
                custom_css="body { color: black; }\n",
            )
        )
        session.commit()

    extracted = tmp_path / "extracted"
    extracted.mkdir()
    with zipfile.ZipFile(_broken_shape_zip(tmp_path), "r") as zf:
        zf.extractall(extracted)

    with SessionLocal() as session:
        changed = backfill_custom_css_from_source(
            session, "backfill-noop", extracted / "broken"
        )
        # Content already matches what would be read -> no-op.
        assert changed is False


def test_partial_extraction_cache_is_not_reused(tmp_path: Path) -> None:
    """Hazard: ``_extracted_root`` checks ``target.is_dir()`` only,
    not whether extraction completed. If a prior import crashed
    between ``mkdir`` and the end of ``extractall``, the cache dir
    exists but contains an incomplete tree, and subsequent detect
    calls skip re-extraction and see a broken project (missing CSS,
    missing metadata, empty manuscript/). Sentinel file guards this.
    """
    import hashlib

    zip_path = _broken_shape_zip(tmp_path)

    # Pre-create a partial cache with just a README and a
    # metadata.yaml - no styles.css, no chapters.
    # The handler writes extractions at zip_path.parent.parent, not
    # zip_path.parent.
    with open(zip_path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()[:16]
    import shutil

    partial = (
        zip_path.parent.parent / "wbt-extracted" / digest / "broken"
    )
    # The extracted-cache path lives under zip_path.parent.parent, which
    # is the pytest common tmp root (shared across tests), not the
    # per-test tmp_path. Clean up any sibling-test leftover so this
    # test sees a pristine partial cache.
    shutil.rmtree(partial.parent, ignore_errors=True)
    partial.mkdir(parents=True)
    (partial / "README.md").write_text("# partial\n", encoding="utf-8")
    (partial / "config").mkdir()
    (partial / "config" / "metadata.yaml").write_text(
        "title: Partial\n", encoding="utf-8"
    )
    # No styles.css, no manuscript/.

    detected = WbtImportHandler().detect(str(zip_path))
    assert detected.custom_css is not None, (
        "A partial cache from a prior crashed import must not block "
        "CSS detection on a fresh detect call."
    )
    assert "color: black" in detected.custom_css
