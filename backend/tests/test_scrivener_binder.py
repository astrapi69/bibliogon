"""Tests for the pure ``.scrivx`` binder parser (SCRIVENER-PROJECT-IMPORT-01).

No filesystem or Pandoc dependency: every case feeds raw ``.scrivx`` XML
and asserts on the ordered manuscript documents the parser returns.
"""

from __future__ import annotations

from app.import_plugins.scrivener_binder import BinderEntry, parse_binder

_SCRIV3 = """<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="D1" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="C1" Type="Text">
          <Title>Chapter One</Title>
        </BinderItem>
        <BinderItem UUID="F1" Type="Folder">
          <Title>Part Two</Title>
          <Children>
            <BinderItem UUID="C2" Type="Text">
              <Title>Chapter Two</Title>
            </BinderItem>
            <BinderItem UUID="C3" Type="Text">
              <Title>Chapter Three</Title>
            </BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="R1" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="N1" Type="Text">
          <Title>Notes - should be skipped</Title>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="T1" Type="TrashFolder">
      <Title>Trash</Title>
      <Children>
        <BinderItem UUID="D2" Type="Text">
          <Title>Deleted scene</Title>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>
"""


def test_parse_returns_text_documents_in_reading_order() -> None:
    entries = parse_binder(_SCRIV3)
    assert [e.title for e in entries] == ["Chapter One", "Chapter Two", "Chapter Three"]
    assert [e.uuid for e in entries] == ["C1", "C2", "C3"]


def test_parse_skips_research_and_trash_folders() -> None:
    titles = [e.title for e in parse_binder(_SCRIV3)]
    assert "Notes - should be skipped" not in titles
    assert "Deleted scene" not in titles


def test_parse_scrivener2_id_attribute() -> None:
    xml = """<?xml version="1.0"?>
    <Binder>
      <BinderItem ID="42" Type="Text">
        <Title>Legacy Chapter</Title>
      </BinderItem>
    </Binder>
    """
    entries = parse_binder(xml)
    assert entries == [BinderEntry(uuid="42", title="Legacy Chapter")]


def test_parse_missing_title_falls_back_to_untitled() -> None:
    xml = """<Binder>
      <BinderItem UUID="X1" Type="Text"></BinderItem>
    </Binder>"""
    entries = parse_binder(xml)
    assert entries == [BinderEntry(uuid="X1", title="Untitled")]


def test_parse_malformed_xml_yields_empty_list() -> None:
    assert parse_binder("<Binder><not closed") == []


def test_parse_no_binder_element_yields_empty_list() -> None:
    assert parse_binder("<ScrivenerProject></ScrivenerProject>") == []


def test_parse_binder_as_root_element() -> None:
    xml = """<Binder>
      <BinderItem UUID="A" Type="Text"><Title>Solo</Title></BinderItem>
    </Binder>"""
    assert [e.title for e in parse_binder(xml)] == ["Solo"]
