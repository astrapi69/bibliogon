"""Convert TipTap JSON to Markdown."""

from typing import Any


def tiptap_to_markdown(doc: dict[str, Any]) -> str:
    """Convert a TipTap JSON document to Markdown.

    Args:
        doc: TipTap JSON document (with type "doc" and content list).

    Returns:
        Markdown string.
    """
    if not doc or doc.get("type") != "doc":
        return ""
    return _convert_nodes(doc.get("content", []))


def _convert_nodes(nodes: list[dict[str, Any]]) -> str:
    """Convert a list of TipTap nodes to Markdown."""
    parts: list[str] = []
    for node in nodes:
        result = _convert_node(node)
        if result is not None:
            parts.append(result)
    return "\n\n".join(parts)


def _convert_node(node: dict[str, Any]) -> str | None:
    """Convert a single TipTap node to Markdown."""
    node_type = node.get("type", "")

    if node_type == "paragraph":
        return _convert_inline(node.get("content", []))

    if node_type == "heading":
        level = node.get("attrs", {}).get("level", 1)
        text = _convert_inline(node.get("content", []))
        return f"{'#' * level} {text}"

    if node_type == "bulletList":
        return _convert_list(node, ordered=False)

    if node_type == "orderedList":
        return _convert_list(node, ordered=True)

    if node_type == "blockquote":
        inner = _convert_nodes(node.get("content", []))
        return "\n".join(f"> {line}" for line in inner.split("\n"))

    if node_type == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        code = _extract_text(node.get("content", []))
        return f"```{lang}\n{code}\n```"

    if node_type == "horizontalRule":
        return "---"

    if node_type == "hardBreak":
        return "  \n"

    if node_type == "image":
        attrs = node.get("attrs", {})
        src = attrs.get("src", "")
        alt = attrs.get("alt", "")
        title = attrs.get("title", "")
        if title:
            return f'![{alt}]({src} "{title}")'
        return f"![{alt}]({src})"

    # Fallback: extract text
    content = node.get("content")
    if content:
        return _convert_inline(content)

    return None


def _convert_list(node: dict[str, Any], ordered: bool) -> str:
    """Convert a bullet or ordered list."""
    items: list[str] = []
    for i, item in enumerate(node.get("content", [])):
        if item.get("type") != "listItem":
            continue
        text = _convert_nodes(item.get("content", []))
        prefix = f"{i + 1}. " if ordered else "- "
        # Indent continuation lines
        lines = text.split("\n")
        indented = [lines[0]] + ["  " + line for line in lines[1:]] if len(lines) > 1 else lines
        items.append(prefix + "\n".join(indented))
    return "\n".join(items)


def _convert_inline(content: list[dict[str, Any]]) -> str:
    """Convert inline content (text nodes with marks) to Markdown."""
    parts: list[str] = []
    for node in content:
        if node.get("type") == "text":
            text = node.get("text", "")
            marks = node.get("marks", [])
            text = _apply_marks(text, marks)
            parts.append(text)
        elif node.get("type") == "hardBreak":
            parts.append("  \n")
    return "".join(parts)


def _apply_marks(text: str, marks: list[dict[str, Any]]) -> str:
    """Apply TipTap marks (bold, italic, code, link) to text."""
    for mark in marks:
        mark_type = mark.get("type", "")
        if mark_type == "bold":
            text = f"**{text}**"
        elif mark_type == "italic":
            text = f"*{text}*"
        elif mark_type == "strike":
            text = f"~~{text}~~"
        elif mark_type == "code":
            text = f"`{text}`"
        elif mark_type == "link":
            href = mark.get("attrs", {}).get("href", "")
            text = f"[{text}]({href})"
    return text


def _extract_text(content: list[dict[str, Any]]) -> str:
    """Extract plain text from content nodes."""
    return "".join(node.get("text", "") for node in content)
