"""KDP metadata completeness checker.

Validates that all required fields for KDP publishing are filled
before export. Returns a list of missing/incomplete fields with
severity (error = blocks publishing, warning = recommended).
"""

from typing import Any


class MetadataIssue:
    """A single metadata completeness issue."""

    def __init__(self, field: str, message: str, severity: str = "error") -> None:
        self.field = field
        self.message = message
        self.severity = severity  # "error" or "warning"

    def to_dict(self) -> dict[str, str]:
        return {"field": self.field, "message": self.message, "severity": self.severity}


class MetadataCheckResult:
    """Result of a metadata completeness check."""

    def __init__(self) -> None:
        self.issues: list[MetadataIssue] = []

    @property
    def is_complete(self) -> bool:
        return not any(i.severity == "error" for i in self.issues)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    def to_dict(self) -> dict[str, Any]:
        return {
            "complete": self.is_complete,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "issues": [i.to_dict() for i in self.issues],
        }


def check_metadata_completeness(book: dict[str, Any]) -> MetadataCheckResult:
    """Check if a book has all required metadata for KDP publishing.

    Required fields (error if missing):
    - title
    - author
    - language
    - description (book blurb)

    Recommended fields (warning if missing):
    - subtitle
    - keywords (at least 1, ideally 7)
    - categories
    - isbn_ebook or isbn_paperback
    - cover_image
    - publisher
    - backpage_description
    """
    result = MetadataCheckResult()

    # Required fields (block publishing)
    if not book.get("title", "").strip():
        result.issues.append(MetadataIssue("title", "Title is required", "error"))

    if not book.get("author", "").strip():
        result.issues.append(MetadataIssue("author", "Author is required", "error"))

    if not book.get("language", "").strip():
        result.issues.append(MetadataIssue("language", "Language is required", "error"))

    desc = book.get("description", "") or book.get("html_description", "")
    if not desc or not desc.strip():
        result.issues.append(MetadataIssue(
            "description", "Book description is required for KDP listing", "error"
        ))

    # Recommended fields (warnings). ``keywords`` is now a list[str] from
    # the API layer but the legacy JSON-string form is still accepted so
    # callers that hand raw ORM data in keep working.
    keywords = book.get("keywords")
    kw_list: list[str] = []
    if isinstance(keywords, list):
        kw_list = [str(k) for k in keywords if str(k).strip()]
    elif isinstance(keywords, str) and keywords.strip():
        import json
        try:
            parsed = json.loads(keywords)
            if isinstance(parsed, list):
                kw_list = [str(k) for k in parsed if str(k).strip()]
        except (json.JSONDecodeError, TypeError):
            kw_list = []

    if not kw_list:
        result.issues.append(MetadataIssue(
            "keywords", "No keywords set. KDP allows up to 7 keywords for discoverability", "warning"
        ))
    elif len(kw_list) < 3:
        result.issues.append(MetadataIssue(
            "keywords",
            f"Only {len(kw_list)} keyword(s). KDP recommends 7 for best discoverability",
            "warning",
        ))

    if not book.get("cover_image"):
        result.issues.append(MetadataIssue(
            "cover_image", "No cover image assigned. A cover is required for KDP", "warning"
        ))

    if not book.get("isbn_ebook") and not book.get("isbn_paperback"):
        result.issues.append(MetadataIssue(
            "isbn", "No ISBN set. KDP can assign a free ISBN, or enter your own", "warning"
        ))

    if not book.get("publisher"):
        result.issues.append(MetadataIssue(
            "publisher", "No publisher set. Recommended for professional appearance", "warning"
        ))

    if not book.get("backpage_description"):
        result.issues.append(MetadataIssue(
            "backpage_description", "No back cover description. Useful for paperback editions", "warning"
        ))

    if not book.get("subtitle"):
        result.issues.append(MetadataIssue(
            "subtitle", "No subtitle. A subtitle can improve search visibility on KDP", "warning"
        ))

    # Chapter check
    chapters = book.get("chapters", [])
    if not chapters:
        result.issues.append(MetadataIssue(
            "chapters", "Book has no chapters", "error"
        ))

    return result
