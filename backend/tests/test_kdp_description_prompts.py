"""The AI prompts for the KDP description only name tags KDP accepts (#1119).

KDP's "Supported HTML" help lists b, br, em, h4-h6, i, li, ol, p, u, ul;
a description containing any other tag (strong, h1-h3) is rejected as a
whole. The prompts told the model to use h2, so a generated description
was refused the moment it was pasted. The frontend mirror of this list is
``KDP_DESCRIPTION_TAGS`` in ``frontend/src/lib/utils/content/kdpHtml.ts``.
"""

from __future__ import annotations

import re
from types import SimpleNamespace

from app.ai import book_template_prompts, template_factories

KDP_DESCRIPTION_TAGS = {"b", "br", "em", "h4", "h5", "h6", "i", "li", "ol", "p", "u", "ul"}
_ALLOWED = re.compile(r"Allowed tags:\s*([a-z0-9,\s]+?)\.", re.IGNORECASE)


def _allowed_tags(text: str) -> set[str]:
    match = _ALLOWED.search(" ".join(text.split()))
    assert match, f"no 'Allowed tags:' list in {text[:80]!r}"
    return {tag.strip().lower() for tag in match.group(1).split(",")}


def test_the_book_fill_prompt_names_only_kdp_tags() -> None:
    book = SimpleNamespace(
        title="T", subtitle=None, author=None, genre=None, series=None, language="de"
    )
    _, user = book_template_prompts.build_marketing_copy_prompt(book, "body")
    block = user[user.index("html_description") :]
    assert _allowed_tags(block) <= KDP_DESCRIPTION_TAGS


def test_the_template_field_spec_names_only_kdp_tags() -> None:
    template = template_factories.build_empty_book_template()
    description = template.model_dump()["html_description"]["description"]
    assert _allowed_tags(description) <= KDP_DESCRIPTION_TAGS


def test_the_parser_sees_a_rejected_tag() -> None:
    assert "h2" in _allowed_tags("Allowed tags: b, i, br, p, h2, ul, li. Hook")
