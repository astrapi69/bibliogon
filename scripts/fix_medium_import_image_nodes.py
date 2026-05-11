"""One-time data fix for Medium-import articles whose ``content_json``
contains ``"type": "image"`` ProseMirror nodes.

Background: bibliogon-plugin-medium-import v1 emitted plain ``image``
nodes per the documented TipTap convention. Bibliogon's editor uses
@pentestpad/tiptap-extension-figure which registers its node as
``imageFigure``; no @tiptap/extension-image is loaded. ProseMirror's
strict schema rejects the unknown type and renders the entire doc
empty.

The walker has been fixed (commit cfd8b57). Articles imported
before that fix still carry the old node type and need an in-place
rewrite. This script does that rewrite.

Scope:
- Only Medium-imported articles are touched (filtered via the
  ``ArticleImportSource`` table; native articles are never read or
  modified).
- Idempotent: rows already free of ``"type": "image"`` are skipped
  with no write.
- Dry-run by default. ``--apply`` is required to write.

Usage (Docker dev environment):

    # See what would change
    docker compose exec backend python scripts/fix_medium_import_image_nodes.py

    # Actually apply the rewrite
    docker compose exec backend python scripts/fix_medium_import_image_nodes.py --apply

Pure stdlib + SQLAlchemy ORM (already a backend dependency); no
additional deps. Uses simple ``json.loads`` + recursive walk rather
than a string-replace so the change is targeted at the node-type
key only and cannot accidentally rewrite the literal substring
``"image"`` appearing in alt text or URLs.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

# Imports from app.* must succeed when the script runs from the
# backend's working directory (as in `docker compose exec backend`).
from app.database import SessionLocal
from app.models import Article, ArticleImportSource


def _rewrite(node: Any) -> int:
    """Recursively walk the TipTap doc and rename ``image`` to
    ``imageFigure``. Returns the number of nodes renamed.
    """
    if not isinstance(node, dict):
        return 0
    renamed = 0
    if node.get("type") == "image":
        node["type"] = "imageFigure"
        renamed += 1
    for child in node.get("content", []) or []:
        renamed += _rewrite(child)
    # Marks can also be node-shaped; walk them defensively even though
    # marks named "image" are not part of any known schema.
    for mark in node.get("marks", []) or []:
        renamed += _rewrite(mark)
    return renamed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the rewritten content_json back to the DB. "
        "Without this flag the script reports counts only.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        # ArticleImportSource is the authoritative provenance table
        # for imports. Joining via article_id ensures we never touch
        # an article that was authored natively in Bibliogon.
        rows = (
            db.query(Article)
            .join(ArticleImportSource, ArticleImportSource.article_id == Article.id)
            .all()
        )
        examined = 0
        skipped_no_change = 0
        rewrote = 0
        nodes_renamed = 0
        skipped_unparseable = 0

        for article in rows:
            examined += 1
            raw = article.content_json
            if not raw:
                skipped_no_change += 1
                continue
            try:
                doc = json.loads(raw) if isinstance(raw, str) else raw
            except json.JSONDecodeError as exc:
                print(
                    f"  SKIP {article.id} ({article.title!r}): "
                    f"content_json is not valid JSON ({exc})",
                    file=sys.stderr,
                )
                skipped_unparseable += 1
                continue
            count_for_doc = _rewrite(doc)
            if count_for_doc == 0:
                skipped_no_change += 1
                continue
            rewrote += 1
            nodes_renamed += count_for_doc
            if args.apply:
                article.content_json = json.dumps(doc, ensure_ascii=False)

        if args.apply:
            db.commit()
            print(f"\nApplied. Rewrote {rewrote} article(s); committed.")
        else:
            print(
                f"\nDry-run. Use --apply to write {rewrote} change(s) to the DB."
            )
        print(
            f"  Examined: {examined}\n"
            f"  Rewrote:  {rewrote}  (would rename {nodes_renamed} image node(s) total)\n"
            f"  Skipped (already correct or empty): {skipped_no_change}\n"
            f"  Skipped (content_json unparseable): {skipped_unparseable}"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
