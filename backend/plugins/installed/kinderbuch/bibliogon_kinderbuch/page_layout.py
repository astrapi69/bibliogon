"""Page layout engine for children's books.

Each page consists of an image and text arranged according to a template.
"""

from typing import Any


class PageLayout:
    """Represents a single page layout in a children's book."""

    def __init__(
        self,
        layout_type: str = "image-top-text-bottom",
        image_path: str | None = None,
        text: str = "",
        page_number: int = 1,
        settings: dict[str, Any] | None = None,
    ) -> None:
        self.layout_type = layout_type
        self.image_path = image_path
        self.text = text
        self.page_number = page_number
        self.settings = settings or {}

    def to_html(self) -> str:
        """Render this page as HTML for preview/export."""
        font_size = self.settings.get("default_font_size", 24)
        bg = self.settings.get("page_background", "#ffffff")

        image_html = ""
        if self.image_path:
            max_w = self.settings.get("max_image_width", 800)
            max_h = self.settings.get("max_image_height", 600)
            image_html = (
                f'<div class="kb-image">'
                f'<img src="{self.image_path}" '
                f'style="max-width:{max_w}px;max-height:{max_h}px;width:100%;height:auto;" '
                f'alt="Page {self.page_number}" />'
                f'</div>'
            )

        text_html = (
            f'<div class="kb-text" style="font-size:{font_size}px;">'
            f'{self.text}'
            f'</div>'
        )

        if self.layout_type == "image-top-text-bottom":
            content = f"{image_html}\n{text_html}"
        elif self.layout_type == "image-left-text-right":
            content = (
                f'<div style="display:flex;gap:20px;">'
                f'{image_html}{text_html}'
                f'</div>'
            )
        elif self.layout_type == "image-full-text-overlay":
            content = (
                f'<div style="position:relative;">'
                f'{image_html}'
                f'<div style="position:absolute;bottom:20px;left:20px;right:20px;'
                f'background:rgba(255,255,255,0.85);padding:16px;border-radius:8px;">'
                f'{text_html}'
                f'</div></div>'
            )
        else:  # text-only
            content = text_html

        return (
            f'<div class="kb-page" data-page="{self.page_number}" '
            f'style="background:{bg};padding:40px;page-break-after:always;">\n'
            f'{content}\n'
            f'</div>'
        )

    def to_markdown(self) -> str:
        """Render this page as Markdown for write-book-template export."""
        parts: list[str] = []

        if self.image_path:
            parts.append(f"![Page {self.page_number}]({self.image_path})")
            parts.append("")

        if self.text:
            parts.append(self.text)

        parts.append("")
        parts.append("---")  # page break
        return "\n".join(parts)


def create_pages_from_chapter(
    chapter_content: list[dict[str, Any]],
    template: str = "image-top-text-bottom",
    settings: dict[str, Any] | None = None,
) -> list[PageLayout]:
    """Create page layouts from a structured chapter content.

    Each item in chapter_content should have:
    - "text": str (the page text)
    - "image": str | None (path to the page image)
    """
    pages: list[PageLayout] = []
    for i, item in enumerate(chapter_content):
        page = PageLayout(
            layout_type=template,
            image_path=item.get("image"),
            text=item.get("text", ""),
            page_number=i + 1,
            settings=settings or {},
        )
        pages.append(page)
    return pages
