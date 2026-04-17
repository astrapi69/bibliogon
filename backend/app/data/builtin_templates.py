"""Builtin book templates shipped with Bibliogon.

``seed_builtin_templates`` is called once at startup. It is idempotent:
if any builtin templates already exist, it is a no-op. Non-builtin
(user-created) templates are never touched.

Using the existing ``ABOUT_AUTHOR = "about_author"`` enum value for the
"about the author" chapter type - we deliberately did not introduce a
second near-duplicate ``ABOUT_THE_AUTHOR``.
"""
from __future__ import annotations

import logging
from typing import TypedDict

from sqlalchemy.orm import Session

from app.models import BookTemplate, BookTemplateChapter, ChapterType

logger = logging.getLogger(__name__)


class _TemplateChapter(TypedDict):
    title: str
    chapter_type: str


class _Template(TypedDict):
    name: str
    description: str
    genre: str
    language: str
    chapters: list[_TemplateChapter]


def _ch(title: str, chapter_type: ChapterType) -> _TemplateChapter:
    return {"title": title, "chapter_type": chapter_type.value}


# --- Template definitions ---


_CHILDRENS_PICTURE_BOOK: _Template = {
    "name": "Children's Picture Book",
    "description": (
        "A short illustrated story for young readers. Front matter kept "
        "minimal, five story pages, and an about-the-author page."
    ),
    "genre": "children",
    "language": "en",
    "chapters": [
        _ch("Half Title", ChapterType.HALF_TITLE),
        _ch("Title Page", ChapterType.TITLE_PAGE),
        _ch("Copyright", ChapterType.COPYRIGHT),
        _ch("Dedication", ChapterType.DEDICATION),
        _ch("Page 1", ChapterType.CHAPTER),
        _ch("Page 2", ChapterType.CHAPTER),
        _ch("Page 3", ChapterType.CHAPTER),
        _ch("Page 4", ChapterType.CHAPTER),
        _ch("Page 5", ChapterType.CHAPTER),
        _ch("About the Author", ChapterType.ABOUT_AUTHOR),
    ],
}


_SCIFI_NOVEL: _Template = {
    "name": "Sci-Fi Novel",
    "description": (
        "A novel-length science fiction story with a prologue, ten "
        "chapters grouped under a single part, an epilogue, and "
        "standard back matter."
    ),
    "genre": "scifi",
    "language": "en",
    "chapters": [
        _ch("Title Page", ChapterType.TITLE_PAGE),
        _ch("Copyright", ChapterType.COPYRIGHT),
        _ch("Dedication", ChapterType.DEDICATION),
        _ch("Epigraph", ChapterType.EPIGRAPH),
        _ch("Prologue", ChapterType.PROLOGUE),
        _ch("Part One", ChapterType.PART),
        _ch("Chapter 1", ChapterType.CHAPTER),
        _ch("Chapter 2", ChapterType.CHAPTER),
        _ch("Chapter 3", ChapterType.CHAPTER),
        _ch("Chapter 4", ChapterType.CHAPTER),
        _ch("Chapter 5", ChapterType.CHAPTER),
        _ch("Chapter 6", ChapterType.CHAPTER),
        _ch("Chapter 7", ChapterType.CHAPTER),
        _ch("Chapter 8", ChapterType.CHAPTER),
        _ch("Chapter 9", ChapterType.CHAPTER),
        _ch("Chapter 10", ChapterType.CHAPTER),
        _ch("Epilogue", ChapterType.EPILOGUE),
        _ch("Acknowledgments", ChapterType.ACKNOWLEDGMENTS),
        _ch("About the Author", ChapterType.ABOUT_AUTHOR),
    ],
}


_NON_FICTION_HOWTO: _Template = {
    "name": "Non-Fiction / How-To",
    "description": (
        "A practical non-fiction guide with foreword, preface, "
        "introduction, eight content chapters, a conclusion, and "
        "reference back matter (appendix, bibliography, index)."
    ),
    "genre": "nonfiction",
    "language": "en",
    "chapters": [
        _ch("Title Page", ChapterType.TITLE_PAGE),
        _ch("Copyright", ChapterType.COPYRIGHT),
        _ch("Dedication", ChapterType.DEDICATION),
        _ch("Foreword", ChapterType.FOREWORD),
        _ch("Preface", ChapterType.PREFACE),
        _ch("Introduction", ChapterType.INTRODUCTION),
        _ch("Chapter 1", ChapterType.CHAPTER),
        _ch("Chapter 2", ChapterType.CHAPTER),
        _ch("Chapter 3", ChapterType.CHAPTER),
        _ch("Chapter 4", ChapterType.CHAPTER),
        _ch("Chapter 5", ChapterType.CHAPTER),
        _ch("Chapter 6", ChapterType.CHAPTER),
        _ch("Chapter 7", ChapterType.CHAPTER),
        _ch("Chapter 8", ChapterType.CHAPTER),
        _ch("Conclusion", ChapterType.CONCLUSION),
        _ch("Appendix", ChapterType.APPENDIX),
        _ch("Bibliography", ChapterType.BIBLIOGRAPHY),
        _ch("Index", ChapterType.INDEX),
        _ch("About the Author", ChapterType.ABOUT_AUTHOR),
    ],
}


_PHILOSOPHY: _Template = {
    "name": "Philosophy",
    "description": (
        "A philosophical work with preface, introduction, six numbered "
        "chapters, a conclusion, final thoughts, and a bibliography."
    ),
    "genre": "philosophy",
    "language": "en",
    "chapters": [
        _ch("Title Page", ChapterType.TITLE_PAGE),
        _ch("Copyright", ChapterType.COPYRIGHT),
        _ch("Dedication", ChapterType.DEDICATION),
        _ch("Epigraph", ChapterType.EPIGRAPH),
        _ch("Preface", ChapterType.PREFACE),
        _ch("Introduction", ChapterType.INTRODUCTION),
        _ch("Chapter 1", ChapterType.CHAPTER),
        _ch("Chapter 2", ChapterType.CHAPTER),
        _ch("Chapter 3", ChapterType.CHAPTER),
        _ch("Chapter 4", ChapterType.CHAPTER),
        _ch("Chapter 5", ChapterType.CHAPTER),
        _ch("Chapter 6", ChapterType.CHAPTER),
        _ch("Conclusion", ChapterType.CONCLUSION),
        _ch("Final Thoughts", ChapterType.FINAL_THOUGHTS),
        _ch("Bibliography", ChapterType.BIBLIOGRAPHY),
        _ch("About the Author", ChapterType.ABOUT_AUTHOR),
    ],
}


_MEMOIR: _Template = {
    "name": "Memoir",
    "description": (
        "A personal memoir framed by a prologue and epilogue, with "
        "ten narrative chapters, acknowledgments, and an author page."
    ),
    "genre": "memoir",
    "language": "en",
    "chapters": [
        _ch("Title Page", ChapterType.TITLE_PAGE),
        _ch("Copyright", ChapterType.COPYRIGHT),
        _ch("Dedication", ChapterType.DEDICATION),
        _ch("Epigraph", ChapterType.EPIGRAPH),
        _ch("Prologue", ChapterType.PROLOGUE),
        _ch("Chapter 1", ChapterType.CHAPTER),
        _ch("Chapter 2", ChapterType.CHAPTER),
        _ch("Chapter 3", ChapterType.CHAPTER),
        _ch("Chapter 4", ChapterType.CHAPTER),
        _ch("Chapter 5", ChapterType.CHAPTER),
        _ch("Chapter 6", ChapterType.CHAPTER),
        _ch("Chapter 7", ChapterType.CHAPTER),
        _ch("Chapter 8", ChapterType.CHAPTER),
        _ch("Chapter 9", ChapterType.CHAPTER),
        _ch("Chapter 10", ChapterType.CHAPTER),
        _ch("Epilogue", ChapterType.EPILOGUE),
        _ch("Acknowledgments", ChapterType.ACKNOWLEDGMENTS),
        _ch("About the Author", ChapterType.ABOUT_AUTHOR),
    ],
}


BUILTIN_TEMPLATES: list[_Template] = [
    _CHILDRENS_PICTURE_BOOK,
    _SCIFI_NOVEL,
    _NON_FICTION_HOWTO,
    _PHILOSOPHY,
    _MEMOIR,
]


def seed_builtin_templates(db: Session) -> int:
    """Insert builtin templates if none exist yet.

    Returns the number of templates inserted. Idempotent: running twice
    is a no-op on the second call because the first call creates the
    builtin rows and subsequent calls see ``is_builtin=True`` already.
    """
    existing = db.query(BookTemplate).filter(BookTemplate.is_builtin.is_(True)).count()
    if existing > 0:
        return 0

    for spec in BUILTIN_TEMPLATES:
        template = BookTemplate(
            name=spec["name"],
            description=spec["description"],
            genre=spec["genre"],
            language=spec["language"],
            is_builtin=True,
        )
        for position, chapter_spec in enumerate(spec["chapters"]):
            template.chapters.append(
                BookTemplateChapter(
                    position=position,
                    title=chapter_spec["title"],
                    chapter_type=chapter_spec["chapter_type"],
                )
            )
        db.add(template)

    db.commit()
    logger.info("Seeded %d builtin book templates", len(BUILTIN_TEMPLATES))
    return len(BUILTIN_TEMPLATES)
