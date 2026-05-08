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
    rewrite_image_urls,
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


def test_rewrite_image_urls_replaces_src_in_image_node() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "image",
                "attrs": {"src": "https://cdn-images-1.medium.com/foo.jpg", "alt": "x"},
            }
        ],
    }
    rewrites = {"https://cdn-images-1.medium.com/foo.jpg": "/api/articles/abc/assets/file/foo.jpg"}
    out = rewrite_image_urls(doc, rewrites)
    assert out["content"][0]["attrs"]["src"] == "/api/articles/abc/assets/file/foo.jpg"
    # alt preserved
    assert out["content"][0]["attrs"]["alt"] == "x"


def test_rewrite_image_urls_does_not_modify_input() -> None:
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "image",
                "attrs": {"src": "https://cdn-images-1.medium.com/foo.jpg"},
            }
        ],
    }
    rewrites = {"https://cdn-images-1.medium.com/foo.jpg": "/local/foo.jpg"}
    rewrite_image_urls(doc, rewrites)
    # Original doc unchanged
    assert doc["content"][0]["attrs"]["src"] == "https://cdn-images-1.medium.com/foo.jpg"


def test_rewrite_image_urls_walks_nested_content() -> None:
    """Images inside a blockquote / list / etc. must also be rewritten."""
    doc = {
        "type": "doc",
        "content": [
            {
                "type": "blockquote",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            {
                                "type": "image",
                                "attrs": {"src": "https://cdn-images-1.medium.com/x.jpg"},
                            }
                        ],
                    }
                ],
            }
        ],
    }
    rewrites = {"https://cdn-images-1.medium.com/x.jpg": "/local/x.jpg"}
    out = rewrite_image_urls(doc, rewrites)
    nested_img = out["content"][0]["content"][0]["content"][0]
    assert nested_img["attrs"]["src"] == "/local/x.jpg"


def test_rewrite_image_urls_leaves_unmapped_src_alone() -> None:
    doc = {
        "type": "doc",
        "content": [{"type": "image", "attrs": {"src": "https://example.com/external.jpg"}}],
    }
    out = rewrite_image_urls(doc, {"https://other.com/foo.jpg": "/local/foo.jpg"})
    assert out["content"][0]["attrs"]["src"] == "https://example.com/external.jpg"


def test_rewrite_image_urls_empty_rewrites_returns_input() -> None:
    doc = {"type": "doc", "content": []}
    out = rewrite_image_urls(doc, {})
    assert out is doc
