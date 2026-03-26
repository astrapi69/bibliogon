"""Tests for page layout engine."""

from bibliogon_kinderbuch.page_layout import PageLayout, create_pages_from_chapter


class TestPageLayout:

    def test_image_top_text_bottom(self) -> None:
        page = PageLayout(
            layout_type="image-top-text-bottom",
            image_path="images/cat.jpg",
            text="A cat sat on a mat.",
            page_number=1,
        )
        html = page.to_html()
        assert "kb-image" in html
        assert "images/cat.jpg" in html
        assert "A cat sat on a mat." in html
        assert 'data-page="1"' in html

    def test_image_left_text_right(self) -> None:
        page = PageLayout(
            layout_type="image-left-text-right",
            image_path="img.png",
            text="Hello",
        )
        html = page.to_html()
        assert "display:flex" in html

    def test_image_full_overlay(self) -> None:
        page = PageLayout(
            layout_type="image-full-text-overlay",
            image_path="bg.jpg",
            text="Overlay text",
        )
        html = page.to_html()
        assert "position:relative" in html
        assert "position:absolute" in html

    def test_text_only(self) -> None:
        page = PageLayout(layout_type="text-only", text="Just text")
        html = page.to_html()
        assert "Just text" in html
        assert "kb-image" not in html

    def test_to_markdown(self) -> None:
        page = PageLayout(
            image_path="pic.jpg",
            text="Story text",
            page_number=3,
        )
        md = page.to_markdown()
        assert "![Page 3](pic.jpg)" in md
        assert "Story text" in md
        assert "---" in md

    def test_custom_settings(self) -> None:
        page = PageLayout(
            text="Big text",
            settings={"default_font_size": 36, "page_background": "#f0f0f0"},
        )
        html = page.to_html()
        assert "font-size:36px" in html
        assert "#f0f0f0" in html


class TestCreatePages:

    def test_create_pages(self) -> None:
        content = [
            {"text": "Page one", "image": "img1.jpg"},
            {"text": "Page two", "image": "img2.jpg"},
            {"text": "Page three"},
        ]
        pages = create_pages_from_chapter(content)
        assert len(pages) == 3
        assert pages[0].page_number == 1
        assert pages[2].image_path is None

    def test_custom_template(self) -> None:
        content = [{"text": "Hello", "image": "pic.jpg"}]
        pages = create_pages_from_chapter(content, template="image-left-text-right")
        assert pages[0].layout_type == "image-left-text-right"
