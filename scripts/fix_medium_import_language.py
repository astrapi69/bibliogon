"""One-time data fix: detect language for Medium-imported articles
that landed with the hardcoded ``"en"`` default.

Background
----------

Until commit bdf5c14 the importer wrote
``Article.language=default_language`` (hardcoded ``"en"``) for
every imported post regardless of body content. The walker did
no language detection at all. Distribution across the 209-post
production import: 207 English + 2 German (the 2 German rows
came from the user manually correcting them in the editor).

The walker now runs ``langdetect`` over the body text and
surfaces ``ParsedPost.detected_language``; the importer reads
it. This script applies the same detection to existing rows.

Properties
----------

- **Scoped via ArticleImportSource.** Only Medium-imported rows
  are read or written. Native Bibliogon articles are never
  touched.
- **Skips manually-corrected rows.** Only rows where
  ``Article.language == "en"`` (the historical default) are
  re-evaluated. Manually-corrected rows are left alone — the
  user's curation is preserved.
- **Confidence floor at 0.85** (matches the walker's threshold).
  Below that, the row is left at its current value.
- **Idempotent.** Re-running after a successful apply produces
  zero changes (rows already at the correct language no longer
  match the ``language == "en"`` gate, except the ones that
  legitimately are English).
- **Dry-run by default.** ``--apply`` to commit.

Usage
-----

    cat scripts/fix_medium_import_language.py | \\
        docker compose exec -T backend python -          # dry-run
    cat scripts/fix_medium_import_language.py | \\
        docker compose exec -T backend python - --apply  # write
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from typing import Any

from app.database import SessionLocal
from app.models import Article, ArticleImportSource

# Mirrors the walker's ``_LANG_CONFIDENCE_THRESHOLD`` so behavior is
# consistent between fresh imports and retro fixes.
_LANG_CONFIDENCE_THRESHOLD = 0.85
_DEFAULT_LANGUAGE = "en"


def _extract_body_text(content_json: str | None) -> str:
    if not content_json:
        return ""
    try:
        doc = json.loads(content_json) if isinstance(content_json, str) else content_json
    except json.JSONDecodeError:
        return ""
    bits: list[str] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "text":
                bits.append(str(node.get("text", "")))
            for child in node.get("content", []) or []:
                _walk(child)

    _walk(doc)
    return " ".join(b for b in bits if b.strip())


def _detect(text: str) -> str | None:
    """Return the ISO code or None when below the confidence floor."""
    if len(text) < 50:
        return None
    # Lazy import + seed: keeps the module importable without the dep
    # available during static analysis, and pins determinism.
    from langdetect import DetectorFactory, LangDetectException, detect_langs

    DetectorFactory.seed = 0
    try:
        candidates = detect_langs(text)
    except LangDetectException:
        return None
    if not candidates:
        return None
    top = candidates[0]
    if top.prob < _LANG_CONFIDENCE_THRESHOLD:
        return None
    return str(top.lang)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write detected languages back to the DB. Without "
        "this flag the script reports counts only.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = (
            db.query(Article)
            .join(ArticleImportSource, ArticleImportSource.article_id == Article.id)
            .all()
        )
        examined = 0
        skipped_manual = 0
        skipped_no_text = 0
        skipped_low_confidence = 0
        skipped_already_correct = 0
        rewrote = 0
        target_distribution: Counter[str] = Counter()

        for article in rows:
            examined += 1
            if article.language != _DEFAULT_LANGUAGE:
                # Manually corrected by the user (or imported with a
                # different default in some other code path); don't
                # touch.
                skipped_manual += 1
                continue
            text = _extract_body_text(article.content_json)
            if not text:
                skipped_no_text += 1
                continue
            detected = _detect(text)
            if detected is None:
                skipped_low_confidence += 1
                continue
            if detected == _DEFAULT_LANGUAGE:
                skipped_already_correct += 1
                continue
            rewrote += 1
            target_distribution[detected] += 1
            if args.apply:
                article.language = detected

        if args.apply:
            db.commit()
            print(f"\nApplied. Updated {rewrote} article(s); committed.")
        else:
            print(
                f"\nDry-run. Use --apply to write {rewrote} change(s) to the DB."
            )
        print(
            f"  Examined: {examined}\n"
            f"  Would update language: {rewrote}  (target distribution: {dict(target_distribution)})\n"
            f"  Skipped (manually corrected, language != 'en'): {skipped_manual}\n"
            f"  Skipped (already correctly 'en'): {skipped_already_correct}\n"
            f"  Skipped (body too short or unparseable): {skipped_no_text}\n"
            f"  Skipped (detection below {_LANG_CONFIDENCE_THRESHOLD} confidence): {skipped_low_confidence}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
