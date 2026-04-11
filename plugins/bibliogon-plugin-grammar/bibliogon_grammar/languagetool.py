"""LanguageTool API client."""

from typing import Any

import httpx


class GrammarMatch:
    """A single grammar/spelling issue found by LanguageTool."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.message: str = data.get("message", "")
        self.short_message: str = data.get("shortMessage", "")
        self.offset: int = data.get("offset", 0)
        self.length: int = data.get("length", 0)
        self.replacements: list[str] = [
            r["value"] for r in data.get("replacements", [])[:5]
        ]
        self.rule_id: str = data.get("rule", {}).get("id", "")
        self.rule_category: str = data.get("rule", {}).get("category", {}).get("id", "")
        self.context_text: str = data.get("context", {}).get("text", "")
        self.context_offset: int = data.get("context", {}).get("offset", 0)
        self.context_length: int = data.get("context", {}).get("length", 0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "short_message": self.short_message,
            "offset": self.offset,
            "length": self.length,
            "replacements": self.replacements,
            "rule_id": self.rule_id,
            "rule_category": self.rule_category,
            "context": {
                "text": self.context_text,
                "offset": self.context_offset,
                "length": self.context_length,
            },
        }


class CheckResult:
    """Result of a grammar check."""

    def __init__(self, matches: list[GrammarMatch], language: str) -> None:
        self.matches = matches
        self.language = language

    @property
    def has_issues(self) -> bool:
        return len(self.matches) > 0

    @property
    def issue_count(self) -> int:
        return len(self.matches)

    def to_dict(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "issue_count": self.issue_count,
            "matches": [m.to_dict() for m in self.matches],
        }


class LanguageToolClient:
    """Client for the LanguageTool API.

    Premium accounts authenticate via ``username`` + ``api_key`` form
    fields per LanguageTool Plus docs. Both must be set together; if
    either is missing the request goes out as anonymous (free quota).
    """

    def __init__(
        self,
        base_url: str = "https://api.languagetoolplus.com/v2",
        default_language: str = "auto",
        disabled_rules: list[str] | None = None,
        disabled_categories: list[str] | None = None,
        max_chunk_chars: int | None = None,
        username: str = "",
        api_key: str = "",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.default_language = default_language
        self.disabled_rules = disabled_rules or []
        self.disabled_categories = disabled_categories or []
        self.max_chunk_chars = max_chunk_chars or self.DEFAULT_MAX_CHUNK_CHARS
        self.username = username
        self.api_key = api_key

    # The free LanguageTool public API has a very low payload limit
    # (~1000 chars). Self-hosted instances and premium accounts allow
    # much more, so the limit is configurable via the constructor.
    # We split long texts into chunks at sentence boundaries and
    # merge the results, adjusting offsets so they point into the
    # original text.
    DEFAULT_MAX_CHUNK_CHARS = 900

    async def check(self, text: str, language: str | None = None) -> CheckResult:
        """Check text for grammar and spelling issues.

        Long texts are automatically split into chunks so the free
        LanguageTool API does not return 413 Payload Too Large.

        Args:
            text: The text to check.
            language: Language code (e.g. "de-DE", "en-US") or "auto".

        Returns:
            CheckResult with all found issues.
        """
        if len(text) <= self.max_chunk_chars:
            return await self._check_single(text, language)

        # Split into chunks at paragraph boundaries
        chunks = self._split_into_chunks(text)
        all_matches: list[GrammarMatch] = []
        detected_lang = language or self.default_language

        offset = 0
        for chunk in chunks:
            result = await self._check_single(chunk, language)
            detected_lang = result.language
            for match in result.matches:
                # Adjust offset to point into the original text
                match.offset += offset
                all_matches.append(match)
            offset += len(chunk)

        return CheckResult(matches=all_matches, language=detected_lang)

    def _split_into_chunks(self, text: str) -> list[str]:
        """Split text into chunks at sentence boundaries.

        Prefers splitting at sentence-ending punctuation (.!?) so each
        chunk is a self-contained piece of text that LanguageTool can
        analyse without context loss at the boundary.
        """
        import re
        # Split into sentences first
        sentences = re.split(r'(?<=[.!?])\s+', text)

        chunks: list[str] = []
        current = ""

        for sentence in sentences:
            candidate = (current + " " + sentence) if current else sentence
            if len(candidate) > self.max_chunk_chars and current:
                chunks.append(current)
                current = sentence
            else:
                current = candidate

        if current:
            chunks.append(current)

        return chunks if chunks else [text]

    async def _check_single(self, text: str, language: str | None = None) -> CheckResult:
        """Send a single check request to the LanguageTool API."""
        lang = language or self.default_language
        data: dict[str, str] = {
            "text": text,
            "language": lang,
        }
        if self.disabled_rules:
            data["disabledRules"] = ",".join(self.disabled_rules)
        if self.disabled_categories:
            data["disabledCategories"] = ",".join(self.disabled_categories)
        if self.username and self.api_key:
            data["username"] = self.username
            data["apiKey"] = self.api_key

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/check",
                data=data,
                timeout=30.0,
            )
            response.raise_for_status()
            result = response.json()

        detected_lang = result.get("language", {}).get("code", lang)
        matches = [GrammarMatch(m) for m in result.get("matches", [])]
        return CheckResult(matches=matches, language=detected_lang)

    async def languages(self) -> list[dict[str, str]]:
        """Get list of supported languages."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/languages",
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()
