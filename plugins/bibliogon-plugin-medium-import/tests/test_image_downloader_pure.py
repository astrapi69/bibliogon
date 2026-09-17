"""Pure-function tests for the image downloader.

The DB-touching portion (actual download + ArticleAsset creation
+ TipTap doc rewrite end-to-end) lives in the backend test suite
under tests/test_medium_import_downloader.py so it can use the
shared db fixture; here we test only the bits that don't need
backend imports.
"""

from __future__ import annotations

from bibliogon_medium_import.image_downloader import (
    filename_for,
    localize_image_nodes,
)
from bibliogon_medium_import.walker import ImageRef


def test_filename_for_uses_data_image_id_when_available() -> None:
    image = ImageRef(
        src="https://cdn-images-1.medium.com/max/800/1*abc.jpeg",
        data_image_id="1*cDW3rymJIJxWKQ4asJx1gw.jpeg",
    )
    assert filename_for(image) == "1_cDW3rymJIJxWKQ4asJx1gw.jpeg"


def test_filename_for_falls_back_to_url_segment() -> None:
    image = ImageRef(
        src="https://cdn-images-1.medium.com/max/800/photo.png",
        data_image_id="",
    )
    assert filename_for(image) == "photo.png"


def test_filename_for_strips_query_string() -> None:
    image = ImageRef(
        src="https://cdn-images-1.medium.com/max/800/photo.png?source=fred",
        data_image_id="",
    )
    assert filename_for(image) == "photo.png"


def test_filename_for_appends_default_extension_when_missing() -> None:
    image = ImageRef(
        src="https://cdn-images-1.medium.com/max/800/no-ext-here",
        data_image_id="",
    )
    assert filename_for(image).endswith(".jpg")


def test_filename_for_sanitises_unsafe_characters() -> None:
    image = ImageRef(
        src="https://cdn-images-1.medium.com/max/800/file with spaces & co.png",
        data_image_id="",
    )
    name = filename_for(image)
    assert " " not in name
    assert "&" not in name
    assert name.endswith(".png")


def test_localize_image_nodes_rewrites_downloaded_and_drops_the_rest() -> None:
    """#882: after the download, no image node may keep a remote URL."""
    doc = {
        "type": "doc",
        "content": [
            {"type": "imageFigure", "attrs": {"src": "https://cdn/a.png", "alt": "A"}},
            {"type": "paragraph", "content": [{"type": "text", "text": "keep"}]},
            {"type": "imageFigure", "attrs": {"src": "https://cdn/failed.png"}},
            {"type": "image", "attrs": {"src": "https://cdn/b.png"}},
        ],
    }
    out = localize_image_nodes(
        doc,
        {"https://cdn/a.png": "/api/articles/x/assets/file/a.png", "https://cdn/b.png": "/local/b"},
    )
    assert [node["type"] for node in out["content"]] == ["imageFigure", "paragraph", "image"]
    assert out["content"][0]["attrs"] == {"src": "/api/articles/x/assets/file/a.png", "alt": "A"}
    assert "https://" not in str(out)
    assert doc["content"][2]["attrs"]["src"] == "https://cdn/failed.png"


def test_localize_image_nodes_walks_nested_content() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "blockquote",
                "content": [
                    {"type": "imageFigure", "attrs": {"src": "https://cdn/nested.png"}},
                    {"type": "imageFigure", "attrs": {"src": "https://cdn/gone.png"}},
                    {"type": "paragraph", "content": [{"type": "text", "text": "q"}]},
                ],
            }
        ],
    }
    out = localize_image_nodes(
        doc, {"https://cdn/nested.png": "/api/articles/a/assets/file/nested.png"}
    )
    inner = out["content"][0]["content"]
    assert [node["type"] for node in inner] == ["imageFigure", "paragraph"]
    assert inner[0]["attrs"]["src"] == "/api/articles/a/assets/file/nested.png"


def test_localize_image_nodes_with_no_downloads_removes_every_image_and_keeps_text() -> None:
    doc = {
        "type": "doc",
        "content": [
            {"type": "imageFigure", "attrs": {"src": "https://cdn-images-1.medium.com/a.jpg"}},
            {"type": "paragraph", "content": [{"type": "text", "text": "text stays"}]},
        ],
    }
    out = localize_image_nodes(doc, {})
    assert out == {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "text stays"}]}],
    }
    assert doc["content"][0]["type"] == "imageFigure"


def test_localize_image_nodes_leaves_a_doc_without_images_unchanged() -> None:
    doc = {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x"}]}],
    }
    assert localize_image_nodes(doc, {"https://cdn/a.png": "/local"}) == doc
