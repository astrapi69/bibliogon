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

    if node_type == "taskList":
        return _convert_task_list(node)

    if node_type == "table":
        return _convert_table(node)

    if node_type == "horizontalRule":
        return "---"

    if node_type == "hardBreak":
        return "  \n"

    if node_type in ("image", "imageFigure", "figure"):
        attrs = node.get("attrs", {})
        src = attrs.get("src", "")
        alt = attrs.get("alt", "")
        title = attrs.get("title", "")
        caption = _convert_inline(node.get("content", []))
        if title:
            md = f'![{alt}]({src} "{title}")'
        else:
            md = f"![{alt}]({src})"
        if caption:
            md += f"\n*{caption}*"
        return md

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
    """Apply TipTap marks (bold, italic, code, link, etc.) to text."""
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
        elif mark_type == "underline":
            text = f"<u>{text}</u>"
        elif mark_type == "subscript":
            text = f"<sub>{text}</sub>"
        elif mark_type == "superscript":
            text = f"<sup>{text}</sup>"
        elif mark_type == "highlight":
            text = f"<mark>{text}</mark>"
    return text


def _convert_task_list(node: dict[str, Any]) -> str:
    """Convert a task list to Markdown checkboxes."""
    items: list[str] = []
    for item in node.get("content", []):
        if item.get("type") != "taskItem":
            continue
        checked = item.get("attrs", {}).get("checked", False)
        checkbox = "[x]" if checked else "[ ]"
        text = _convert_nodes(item.get("content", []))
        items.append(f"- {checkbox} {text}")
    return "\n".join(items)


def _convert_table(node: dict[str, Any]) -> str:
    """Convert a table to Markdown (GFM) table format."""
    rows = node.get("content", [])
    if not rows:
        return ""

    md_rows: list[list[str]] = []
    is_header_row = True

    for row in rows:
        if row.get("type") != "tableRow":
            continue
        cells: list[str] = []
        for cell in row.get("content", []):
            cell_type = cell.get("type", "")
            if cell_type not in ("tableCell", "tableHeader"):
                continue
            text = _convert_nodes(cell.get("content", []))
            # Flatten multiline content to single line for table
            text = text.replace("\n", " ").strip()
            cells.append(text)
            if cell_type == "tableHeader":
                is_header_row = True
        md_rows.append(cells)

    if not md_rows:
        return ""

    # Determine column count
    col_count = max(len(r) for r in md_rows)

    # Pad rows to equal length
    for row in md_rows:
        while len(row) < col_count:
            row.append("")

    # Build markdown table
    lines: list[str] = []
    lines.append("| " + " | ".join(md_rows[0]) + " |")
    lines.append("| " + " | ".join("---" for _ in range(col_count)) + " |")
    for row in md_rows[1:]:
        lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def _extract_text(content: list[dict[str, Any]]) -> str:
    """Extract plain text from content nodes."""
    return "".join(node.get("text", "") for node in content)
