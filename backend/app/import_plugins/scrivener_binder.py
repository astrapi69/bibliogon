"""Pure parser for the Scrivener ``.scrivx`` binder index.

SCRIVENER-PROJECT-IMPORT-01. A ``.scrivx`` file is the XML index of a
Scrivener project: a ``<Binder>`` tree of ``<BinderItem>`` nodes (folders
+ text documents) carrying titles and per-item UUIDs. This module turns
that tree into the ordered list of manuscript text documents Bibliogon
imports as chapters - no filesystem or Pandoc dependency, so it is fully
unit-testable on its own.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass

import defusedxml.ElementTree as DefusedET
from defusedxml.common import DefusedXmlException

# Folder item types whose contents are NOT manuscript chapters and must
# be skipped wholesale (research notes, the trash). The Draft / Manuscript
# folder (``DraftFolder``) and plain ``Folder`` dividers are descended
# into; only their ``Text`` descendants become chapters.
_SKIP_TYPES = frozenset({"TrashFolder", "ResearchFolder"})


@dataclass
class BinderEntry:
    """One manuscript text document from the binder, in reading order."""

    uuid: str
    title: str


def parse_binder(scrivx_xml: str) -> list[BinderEntry]:
    """Return the ordered ``Text`` documents in the manuscript binder.

    Depth-first walk of the ``<Binder>`` tree (which is document order),
    collecting ``Type="Text"`` items and skipping the trash / research
    folders. A malformed or binder-less project yields an empty list
    rather than raising, so the importer degrades to "nothing to import".
    """
    try:
        root = DefusedET.fromstring(scrivx_xml)
    except (ET.ParseError, DefusedXmlException):
        return []
    binder = root.find("Binder") if root.tag != "Binder" else root
    if binder is None:
        return []
    out: list[BinderEntry] = []
    _walk(binder, out)
    return out


def _walk(node: ET.Element, out: list[BinderEntry]) -> None:
    for item in node.findall("BinderItem"):
        item_type = item.get("Type", "")
        if item_type in _SKIP_TYPES:
            continue
        if item_type == "Text":
            out.append(BinderEntry(uuid=_item_uuid(item), title=_item_title(item)))
        children = item.find("Children")
        if children is not None:
            _walk(children, out)


def _item_title(item: ET.Element) -> str:
    title_el = item.find("Title")
    title = (title_el.text or "").strip() if title_el is not None else ""
    return title or "Untitled"


def _item_uuid(item: ET.Element) -> str:
    # Scrivener 3 uses the ``UUID`` attribute; Scrivener 2 uses ``ID``.
    return item.get("UUID") or item.get("ID") or ""
