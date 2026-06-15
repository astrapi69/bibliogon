"""Rules-for-AI header blocks for Bibliogon AI templates.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

from app.ai.template_models import SCHEMA_VERSION

_RULES_BLOCK = """\
# RULES FOR AI ASSISTANTS:
#
# 1. Fill ONLY the `current_value` keys. Do not modify the
#    `description` or `example` keys - they are documentation
#    for you to read, not output to produce.
# 2. If `current_value` already has a value, leave it alone
#    unless the user explicitly asks for re-generation.
# 3. Return valid YAML. No commentary outside YAML comments.
# 4. Use real UTF-8 characters (ä ö ü ß umlauts, accents,
#    CJK characters). Do NOT escape them and do NOT substitute
#    ASCII transliterations like 'ae' for 'ä' or 'ss' for 'ß'.
# 5. Respond in the article's language. If `reference.language`
#    is set, use that. If only `language` at root is set (empty
#    new-idea template), use that. Default to English if
#    neither is present.
# 6. If you cannot generate a field with high confidence,
#    leave its `current_value` null. Do not invent.
# 7. Do not change `type`, `schema_version`, `reference`, or
#    `language` at root. They are file metadata, not content."""

ARTICLE_HEADER = f"""\
# ============================================================
# Bibliogon Article Template (schema v{SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Article and the
# metadata fields you can fill in for it.
#
{_RULES_BLOCK}
#
# ============================================================
"""

BOOK_HEADER = f"""\
# ============================================================
# Bibliogon Book Template (schema v{SCHEMA_VERSION})
# ============================================================
#
# Bibliogon is an open-source book and article authoring
# platform. This file describes one Bibliogon Book and the
# metadata fields you can fill in for it.
#
{_RULES_BLOCK}
#
# Note for Books: the `chapter_summaries` field is a list of
# objects, one per existing chapter. Match summaries to
# chapters by `chapter_id` (preferred) or `title`. Do not add
# new chapter entries; only fill the `summary` field of
# existing ones.
#
# ============================================================
"""


# ---------------------------------------------------------------------------
