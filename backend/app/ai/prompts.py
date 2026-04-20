"""Review prompt building + language/focus/chapter-type dictionaries.

Split out of routes.py so the dictionaries can be reused by the
async review worker, tested in isolation, and extended without
touching HTTP route code.
"""

from __future__ import annotations

# All 8 Bibliogon UI languages. Single source for review + marketing
# prompt builders. See docs/explorations/ai-review-extension.md 3.12.
LANG_MAP: dict[str, str] = {
    "de": "German",
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "el": "Greek",
    "pt": "Portuguese",
    "tr": "Turkish",
    "ja": "Japanese",
}


# Focus area descriptions injected into the review system prompt.
# Existing values kept for back-compat; `consistency` and `beta_reader`
# are new as of v0.20.x. See ai-review-extension.md 3.4 and 3.6.
FOCUS_DESCRIPTIONS: dict[str, str] = {
    "style": (
        "writing style (word choice, sentence variety, readability, voice consistency)"
    ),
    "coherence": (
        "coherence and structure (logical flow, paragraph transitions, argument clarity)"
    ),
    "pacing": (
        "pacing (scene length balance, tension curve, slow or rushed sections)"
    ),
    "dialogue": (
        "dialogue quality (natural speech, character voice distinction, said-bookisms)"
    ),
    "tension": (
        "narrative tension (stakes, conflict escalation, reader engagement)"
    ),
    "consistency": (
        "internal consistency within the chapter (contradictions in facts, timing, "
        "character traits, locations, object descriptions)"
    ),
    "beta_reader": (
        "open-ended simulated beta-reader feedback (first-read reactions, confusing "
        "passages, what engages, what drags, questions left in the reader's mind)"
    ),
}


# Per-chapter-type guidance prepended to the review system prompt so
# the LLM tailors feedback to the section. Covers all 31 ChapterType
# values from backend/app/models/__init__.py. Unknown values fall back
# to generic prose guidance. Token cost: ~30-50 extra per call.
CHAPTER_TYPE_GUIDANCE: dict[str, str] = {
    "chapter": "narrative prose, standard review criteria apply",
    "preface": "author's framing of the book; brief, personal, purpose-driven",
    "foreword": "typically written by someone other than the author; endorses or "
    "contextualizes the book",
    "acknowledgments": "thank-you list; keep feedback minimal and tone-focused",
    "about_author": "third-person bio; concise, professional, factual",
    "appendix": "supplementary reference material, not narrative prose",
    "bibliography": "reference list, not narrative prose; skip prose review",
    "glossary": "definitional, alphabetical; clarity and consistency of terms",
    "epilogue": "closes the narrative after the main plot; tonal payoff",
    "imprint": "legal/publisher info, not narrative prose; skip prose review",
    "next_in_series": "teaser for the next book; hook, brevity, no spoilers",
    "part": "part-divider page; title and epigraph only if any, not prose",
    "part_intro": "short framing for a part; sets expectations for upcoming chapters",
    "interlude": "short break between chapters; tonal shift or breather",
    "toc": "table of contents, not narrative prose; skip prose review",
    "dedication": "brief, personal; keep feedback minimal and tone-focused",
    "prologue": "opens the narrative before the main plot; hooks reader",
    "introduction": "contextualizes the book's content; informative, not narrative",
    "afterword": "author's reflection after the narrative; personal tone",
    "final_thoughts": "closing author remarks; brief, reflective",
    "index": "reference index, not narrative prose; skip prose review",
    "epigraph": "short quotation; no prose review needed",
    "endnotes": "reference notes, not narrative prose; skip prose review",
    "also_by_author": "list of other works; not narrative prose",
    "excerpt": "sample chapter from another book; evaluate as a standalone hook",
    "call_to_action": "marketing text asking for reviews or engagement; evaluate "
    "persuasiveness, brevity",
    "half_title": "single page with just the book title; not prose",
    "title_page": "book title + author page; not prose",
    "copyright": "legal copyright notice; not prose",
    "section": "section divider within a part; title only",
    "conclusion": "synthesizes the book's argument (non-fiction); clarity and "
    "closure",
}


# Non-prose chapter types. Frontend shows an inline warning above the
# review button because the review output may be limited for these.
# See ai-review-extension.md 3.11.
NON_PROSE_TYPES: set[str] = {
    "title_page",
    "copyright",
    "toc",
    "imprint",
    "index",
    "half_title",
    "also_by_author",
    "next_in_series",
    "call_to_action",
    "endnotes",
    "bibliography",
    "glossary",
}


def build_review_system_prompt(
    language: str,
    focus: list[str],
    genre: str = "",
    chapter_type: str = "chapter",
) -> str:
    """Build the system prompt for chapter review.

    Includes language instruction (all 8 supported), per-focus
    descriptions, optional genre guidance, and chapter-type specific
    guidance. Unknown language codes fall through to a generic
    instruction. Unknown chapter types fall back to generic prose.
    """
    focus_list = "\n".join(
        f"- {FOCUS_DESCRIPTIONS[f]}" for f in focus if f in FOCUS_DESCRIPTIONS
    )

    lang_name = LANG_MAP.get(language)
    if lang_name:
        lang_instruction = (
            f"The chapter is in {lang_name}. Write your review in {lang_name}."
        )
    else:
        lang_instruction = (
            f"The chapter is in language '{language}'. "
            "Write your review in that language."
        )

    genre_instruction = ""
    if genre:
        genre_instruction = (
            f"\nThe book's genre is {genre}. Tailor your feedback to the "
            "conventions and reader expectations of this genre."
        )

    chapter_type_instruction = ""
    guidance = CHAPTER_TYPE_GUIDANCE.get(chapter_type)
    if guidance:
        chapter_type_instruction = (
            f"\nYou are reviewing a '{chapter_type}' section: {guidance}."
        )
    elif chapter_type and chapter_type != "chapter":
        chapter_type_instruction = (
            f"\nYou are reviewing a '{chapter_type}' section. "
            "Apply standard prose review criteria."
        )

    return f"""You are a professional book editor reviewing a chapter manuscript.

{lang_instruction}{genre_instruction}{chapter_type_instruction}

Analyze the chapter for these aspects:
{focus_list}

Structure your review as follows:
1. **Summary**: One sentence summarizing the chapter's content.
2. **Strengths**: 2-3 specific things done well (with brief quotes or references).
3. **Suggestions**: 3-5 concrete, actionable improvements. For each suggestion:
   - State what the issue is
   - Explain why it matters
   - Suggest how to fix it
4. **Overall**: One sentence overall assessment.

Be constructive and specific. Refer to actual passages in the text. Avoid generic advice like "show don't tell" without pointing to a specific instance. Do not rewrite the chapter - give editorial feedback the author can act on."""
