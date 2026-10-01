"""Block/inline boundaries in the TipTap flattener (#929).

``_flatten_tiptap`` joined a node's children with ``"\\n"`` for ``doc`` /
``paragraph`` / ``heading*`` and with ``" "`` for everything else. Both
are wrong about what a paragraph's children are: they are INLINE, and
ProseMirror splits a paragraph into one text node per mark run.

So a paragraph reading ``sehr <strong>wichtig</strong> fuer die Szene``
is three text nodes, and the newline branch turned one paragraph into
three lines. The space branch has the mirror-image problem - ProseMirror
keeps the whitespace INSIDE the text node (``"sehr "``, then
``"wichtig"``), so joining inline siblings with a space doubles the
spaces that exist and invents ones that do not.

``count_words`` whitespace-splits, which is why this survived: word
counts never changed. It bit the consumer that needs real lines, the
version-history diff, where a bolded word made one paragraph show up as
three changed lines.

Every expectation here is the output of the corrected frontend
implementation (`frontend/src/lib/utils/content/tiptapText.ts`, #849) on
the same node, so the two stay byte-identical.
"""

from __future__ import annotations

import json

from app.services.chapter_snapshots import snapshot_plain_text
from app.services.writing_stats import _flatten_tiptap, count_words


def para(*children: dict) -> dict:
    return {"type": "paragraph", "content": list(children)}


def text(value: str, *marks: str) -> dict:
    node: dict = {"type": "text", "text": value}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node


def doc(*blocks: dict) -> dict:
    return {"type": "doc", "content": list(blocks)}


class TestInlineSiblings:
    def test_a_mark_run_does_not_split_the_paragraph_into_lines(self) -> None:
        node = doc(para(text("sehr "), text("wichtig", "bold"), text(" fuer die Szene")))
        assert _flatten_tiptap(node) == "sehr wichtig fuer die Szene"

    def test_adjacent_marks_are_not_separated_by_an_invented_space(self) -> None:
        """`<em>Hallo</em><strong>Welt</strong>` renders as HalloWelt."""
        node = doc(para(text("Hallo", "italic"), text("Welt", "bold")))
        assert _flatten_tiptap(node) == "HalloWelt"

    def test_blocks_still_end_a_line(self) -> None:
        node = doc(para(text("Erster")), para(text("Zweiter")))
        assert _flatten_tiptap(node) == "Erster\nZweiter"

    def test_a_heading_ends_a_line(self) -> None:
        node = doc(
            {"type": "heading", "attrs": {"level": 2}, "content": [text("Kapitel 1")]},
            para(text("Text")),
        )
        assert _flatten_tiptap(node) == "Kapitel 1\nText"


class TestHardBreak:
    def test_a_hard_break_becomes_a_newline(self) -> None:
        node = doc(para(text("Zeile1"), {"type": "hardBreak"}, text("Zeile2")))
        assert _flatten_tiptap(node) == "Zeile1\nZeile2"

    def test_consecutive_hard_breaks_each_break(self) -> None:
        node = doc(para(text("A"), {"type": "hardBreak"}, {"type": "hardBreak"}, text("B")))
        assert _flatten_tiptap(node) == "A\n\nB"


class TestLists:
    def test_each_list_item_is_its_own_line(self) -> None:
        node = doc(
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [para(text("Eins"))]},
                    {"type": "listItem", "content": [para(text("Zwei"))]},
                ],
            }
        )
        assert _flatten_tiptap(node) == "Eins\nZwei"

    def test_a_list_adds_no_blank_line_per_entry(self) -> None:
        """`listItem` stays out of the block set - the paragraph inside
        already ends the line, and adding it yields a blank line each."""
        node = doc(
            {
                "type": "bulletList",
                "content": [{"type": "listItem", "content": [para(text("Nur eins"))]}],
            }
        )
        assert "\n\n" not in _flatten_tiptap(node)


class TestEdges:
    def test_a_non_node_flattens_to_empty(self) -> None:
        assert _flatten_tiptap("nope") == ""
        assert _flatten_tiptap(None) == ""
        assert _flatten_tiptap(42) == ""

    def test_an_empty_document_flattens_to_empty(self) -> None:
        assert _flatten_tiptap(doc()) == ""

    def test_an_empty_paragraph_does_not_leave_a_trailing_newline(self) -> None:
        assert _flatten_tiptap(doc(para(), para(text("Text")))) == "\nText"


class TestConsumers:
    def test_word_count_is_unchanged_by_the_fix(self) -> None:
        """The reason this survived: whitespace-splitting hides it."""
        node = doc(para(text("sehr "), text("wichtig", "bold"), text(" fuer die Szene")))
        assert count_words(json.dumps(node)) == 5

    def test_a_bolded_word_no_longer_splits_the_diff_into_three_lines(self) -> None:
        node = doc(para(text("sehr "), text("wichtig", "bold"), text(" fuer die Szene")))
        assert snapshot_plain_text(json.dumps(node)) == "sehr wichtig fuer die Szene"
