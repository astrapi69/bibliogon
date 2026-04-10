"""Tests for LanguageTool client data structures."""

from bibliogon_grammar.languagetool import CheckResult, GrammarMatch, LanguageToolClient


class TestGrammarMatch:

    def test_from_dict(self) -> None:
        data = {
            "message": "Possible spelling mistake found.",
            "shortMessage": "Spelling",
            "offset": 10,
            "length": 5,
            "replacements": [{"value": "their"}, {"value": "there"}],
            "rule": {
                "id": "MORFOLOGIK_RULE_EN_US",
                "category": {"id": "TYPOS"},
            },
            "context": {
                "text": "This is thier test.",
                "offset": 8,
                "length": 5,
            },
        }
        match = GrammarMatch(data)
        assert match.message == "Possible spelling mistake found."
        assert match.offset == 10
        assert match.length == 5
        assert match.replacements == ["their", "there"]
        assert match.rule_id == "MORFOLOGIK_RULE_EN_US"
        assert match.rule_category == "TYPOS"

    def test_to_dict_roundtrip(self) -> None:
        data = {
            "message": "Error",
            "shortMessage": "Err",
            "offset": 0,
            "length": 3,
            "replacements": [{"value": "fix"}],
            "rule": {"id": "RULE1", "category": {"id": "CAT1"}},
            "context": {"text": "ctx", "offset": 0, "length": 3},
        }
        match = GrammarMatch(data)
        result = match.to_dict()
        assert result["message"] == "Error"
        assert result["replacements"] == ["fix"]
        assert result["context"]["text"] == "ctx"

    def test_max_5_replacements(self) -> None:
        data = {
            "message": "Test",
            "replacements": [{"value": str(i)} for i in range(10)],
            "rule": {},
            "context": {},
        }
        match = GrammarMatch(data)
        assert len(match.replacements) == 5

    def test_empty_data(self) -> None:
        match = GrammarMatch({})
        assert match.message == ""
        assert match.offset == 0
        assert match.replacements == []


class TestCheckResult:

    def test_no_issues(self) -> None:
        result = CheckResult(matches=[], language="de-DE")
        assert not result.has_issues
        assert result.issue_count == 0

    def test_with_issues(self) -> None:
        m = GrammarMatch({"message": "Error", "rule": {}, "context": {}})
        result = CheckResult(matches=[m], language="en-US")
        assert result.has_issues
        assert result.issue_count == 1

    def test_to_dict(self) -> None:
        m = GrammarMatch({"message": "Test", "rule": {}, "context": {}})
        result = CheckResult(matches=[m], language="de")
        d = result.to_dict()
        assert d["language"] == "de"
        assert d["issue_count"] == 1
        assert len(d["matches"]) == 1


# --- Chunking ---


def test_split_into_chunks_short_text():
    """Short text should not be split."""
    client = LanguageToolClient()
    text = "Dies ist ein kurzer Text."
    chunks = client._split_into_chunks(text)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_split_into_chunks_long_text():
    """Text over MAX_CHUNK_CHARS should be split at paragraph boundaries."""
    client = LanguageToolClient()
    # Create text with multiple paragraphs that exceeds the limit
    para = "Ein Absatz mit einigem Text. " * 100  # ~2900 chars per para
    text = "\n\n".join([para] * 10)  # ~29000 chars total
    assert len(text) > client.MAX_CHUNK_CHARS
    chunks = client._split_into_chunks(text)
    assert len(chunks) > 1
    # All chunks should be within limit (or close, if a single para is huge)
    for chunk in chunks:
        assert len(chunk) <= client.MAX_CHUNK_CHARS + 5000  # some tolerance
    # Rejoined text should match original
    assert "\n\n".join(chunks) == text or "".join(chunks) == text.replace("\n\n", "")
