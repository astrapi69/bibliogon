"""The projection contract for a YAML value reaching a typed field (#1108).

Three shipped bugs had one cause: a YAML value of arbitrary type projected
into a field of a declared type, with no stated contract for what each input
type does. ``str(value)`` is right for an int and wrong for None (#1086), for
a date (#1091, HTTP 500) and for a container (#1103, a Python repr in the
book title). Each was fixed where it was found; none of the three fixes was
a contract.

This file is the contract. The table in ``TestAsTextContract`` is not a set
of examples - it is one case per input KIND, which is what makes the three
incidents instances rather than coincidences.
"""

from __future__ import annotations

import ast
import datetime
import types
from pathlib import Path
from typing import Any, Union, get_args, get_origin, get_type_hints

import pytest
import yaml

from app.yaml.projection import as_int, as_text

MISSING: dict[str, Any] = {}


class TestAsTextContract:
    """One case per input kind, for a field declared ``str | None``."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            pytest.param(MISSING.get("absent"), None, id="missing-key"),
            pytest.param(None, None, id="none"),
            pytest.param("Der Kater", "Der Kater", id="str"),
            pytest.param("  Der Kater  ", "Der Kater", id="str-padded"),
            pytest.param("", None, id="str-empty"),
            pytest.param("   ", None, id="str-whitespace"),
            pytest.param("\n\t ", None, id="str-whitespace-mixed"),
            pytest.param(2, "2", id="int"),
            pytest.param(9783000000010, "9783000000010", id="int-isbn"),
            pytest.param(0, "0", id="int-zero"),
            pytest.param(1.5, "1.5", id="float"),
            pytest.param(datetime.date(2026, 3, 1), "2026-03-01", id="date"),
            pytest.param(
                datetime.datetime(2026, 3, 1, 9, 30),
                "2026-03-01T09:30:00",
                id="datetime",
            ),
            pytest.param(["a", "b"], None, id="list"),
            pytest.param(("a", "b"), None, id="tuple"),
            pytest.param({"a", "b"}, None, id="set"),
            pytest.param({"name": "X"}, None, id="mapping"),
            pytest.param([], None, id="list-empty"),
            pytest.param({}, None, id="mapping-empty"),
        ],
    )
    def test_contract(self, value: Any, expected: str | None) -> None:
        assert as_text(value) == expected

    def test_every_result_is_str_or_none(self) -> None:
        """The declared return type holds for every input kind above."""
        for value in [
            None,
            "x",
            "  ",
            2,
            1.5,
            datetime.date(2026, 3, 1),
            datetime.datetime(2026, 3, 1),
            ["a"],
            {"a": 1},
            {"a"},
            ("a",),
        ]:
            assert as_text(value) is None or isinstance(as_text(value), str)

    def test_absent_is_the_callers_choice(self) -> None:
        """A field declared ``str`` wants "" where ``str | None`` wants None.

        The A+ package model declares ``str``; ProjectMetadata declares
        ``str | None``. One contract, two defaults - not two functions that
        drift apart, which is how #1086 and #1091 came to be fixed twice.
        """
        assert as_text(None, absent="") == ""
        assert as_text("   ", absent="") == ""
        assert as_text(["a"], absent="") == ""
        assert as_text("keep", absent="") == "keep"

    def test_a_bool_is_deliberately_not_in_the_table(self) -> None:
        """#1103 left the YAML-1.1 bool word as its own decision.

        ``edition: yes`` is a boolean to PyYAML and renders as the English
        word. Dropping it would lose what the author typed; rendering it
        differently would invent something they did not. Pinned as unchanged
        so a later reader sees it was considered, not missed.
        """
        assert as_text(True) == "True"
        assert as_text(False) == "False"


class TestAsIntContract:
    """The same table for a field declared ``int | None``."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            pytest.param(MISSING.get("absent"), None, id="missing-key"),
            pytest.param(None, None, id="none"),
            pytest.param(3, 3, id="int"),
            pytest.param(0, 0, id="int-zero"),
            pytest.param(-2, -2, id="int-negative"),
            pytest.param("3", 3, id="str-digits"),
            pytest.param("  3  ", 3, id="str-padded"),
            pytest.param("zwei", None, id="str-word"),
            pytest.param("", None, id="str-empty"),
            pytest.param(3.0, 3, id="float-integral"),
            pytest.param(3.5, None, id="float-fractional"),
            pytest.param(True, None, id="bool-true"),
            pytest.param(False, None, id="bool-false"),
            pytest.param(datetime.date(2026, 3, 1), None, id="date"),
            pytest.param([3], None, id="list"),
            pytest.param({"volume": 3}, None, id="mapping"),
        ],
    )
    def test_contract(self, value: Any, expected: int | None) -> None:
        assert as_int(value) == expected

    def test_every_result_is_int_or_none(self) -> None:
        for value in [None, 3, "3", "zwei", 3.5, True, datetime.date(2026, 3, 1), [3], {"a": 1}]:
            assert as_int(value) is None or isinstance(as_int(value), int)

    def test_a_bool_is_not_an_int_here(self) -> None:
        """``isinstance(True, int)`` is True in Python, which is exactly the
        trap: ``series_index: yes`` would otherwise become volume 1."""
        assert as_int(True) is None
        assert as_int(False) is None


#: Every input kind the contract names, as one list both consumers face.
CONTRACT_INPUTS: list[Any] = [
    None,
    "",
    "   ",
    "Der Kater",
    "  padded  ",
    0,
    2,
    9783000000010,
    1.5,
    True,
    False,
    datetime.date(2026, 3, 1),
    datetime.datetime(2026, 3, 1, 9, 30),
    [],
    ["a", "b"],
    ("a",),
    {"a"},
    {},
    {"name": "X"},
]


class TestTheAplusCopyAgreesWithTheContract:
    """The A+ generator implements the contract rather than calling it.

    Its standalone test matrix installs only the plugin's own lockfile - no
    backend - and ``generator`` is one of the modules those tests import, so
    an ``app.yaml.projection`` import there would turn that matrix red (the
    "two installation paths diverge" lesson). The backend owns the contract;
    this test is what makes the plugin's three-line copy a reading of it
    rather than a second opinion. The backend venv path-installs every plugin,
    so both are importable here.

    If this goes red, the fix is to change the copy - not to relax the test.
    """

    def test_every_input_kind_agrees(self) -> None:
        from bibliogon_aplus.generator import _text

        for value in CONTRACT_INPUTS:
            assert _text(value) == as_text(value, absent=""), (
                f"aplus _text and as_text disagree on {value!r}"
            )

    def test_the_plugin_copy_never_returns_none(self) -> None:
        """Its model declares ``str``; ``None`` there is the #1086 shape in
        a different costume."""
        from bibliogon_aplus.generator import _text

        for value in CONTRACT_INPUTS:
            assert isinstance(_text(value), str)


def _annotation_allows(annotation: Any, value: Any) -> bool:
    """True when ``value`` satisfies a dataclass field's annotation."""
    origin = get_origin(annotation)
    if origin is Union or isinstance(annotation, types.UnionType):
        return any(_annotation_allows(arg, value) for arg in get_args(annotation))
    if annotation is Any:
        return True
    if annotation is type(None):
        return value is None
    # A subscripted generic (dict[str, Any]) is not an isinstance target;
    # its origin is.
    return isinstance(value, origin or annotation)


def _metadata_yaml_literals() -> list[tuple[str, dict[str, Any]]]:
    """Every metadata.yaml-shaped fixture the test suite carries.

    Discovered, not listed. Each test module is parsed with ``ast`` and every
    string constant in it is tried as YAML; a mapping carrying at least one
    key the project parser reads counts as a fixture. That keeps the sweep
    honest as the corpus moves: a fixture file added later (or merged from a
    branch) joins it with no edit here, which is the whole point of sweeping
    the corpus instead of pinning three inputs.

    A string that merely looks like metadata costs nothing - the assertions
    below hold for ANY input by construction, which is what a total contract
    means.
    """
    known_keys = {
        "title",
        "subtitle",
        "author",
        "lang",
        "language",
        "series",
        "series_index",
        "description",
        "edition",
        "publisher",
        "publisher_city",
        "date",
        "isbn",
        "asin",
        "identifiers",
        "keywords",
        "cover-image",
        "cover_image",
        "cover",
    }
    found: list[tuple[str, dict[str, Any]]] = []
    for module in sorted(Path(__file__).parent.glob("*.py")):
        try:
            tree = ast.parse(module.read_text(encoding="utf-8"))
        except SyntaxError:  # pragma: no cover - a test module that cannot parse
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            text = node.value
            if ":" not in text or not any(f"{k}:" in text for k in known_keys):
                continue
            try:
                documents = [d for d in yaml.safe_load_all(text) if d]
            except yaml.YAMLError:
                continue
            if not documents or not isinstance(documents[0], dict):
                continue
            if not known_keys & set(documents[0]):
                continue
            found.append((f"{module.name}:{node.lineno}", documents[0]))
    return found


class TestEveryFixtureValueMatchesItsDeclaredType:
    """The whole fixture corpus through the projection, not three pins.

    The contract tables above cover the input KINDS exhaustively; this covers
    what the project actually meets, so the two together answer both "is the
    rule complete" and "is the rule right about real files".
    """

    def test_the_corpus_is_actually_a_corpus(self) -> None:
        # A discovery sweep that silently finds nothing is the vacuous-pin
        # shape: green, and measuring no input at all.
        fixtures = _metadata_yaml_literals()
        assert len(fixtures) >= 10, f"only {len(fixtures)} metadata fixtures discovered"
        total_keys = sum(len(metadata) for _, metadata in fixtures)
        assert total_keys >= 40, f"only {total_keys} keys across the corpus"

    def test_every_value_projects_within_its_declared_return_type(self) -> None:
        for where, metadata in _metadata_yaml_literals():
            for key, value in metadata.items():
                text = as_text(value)
                assert text is None or isinstance(text, str), f"{where} {key}"
                number = as_int(value)
                assert number is None or isinstance(number, int), f"{where} {key}"
                # The #1091 shape was a RAISE, not a wrong value, so the call
                # completing is half the assertion.
                assert as_text(value, absent="") is not None, f"{where} {key}"

    def test_the_parsed_result_matches_every_declared_field_type(self) -> None:
        from app.services.backup.project_metadata_parser import (
            ProjectMetadata,
            _parse_project_metadata,
        )

        hints = get_type_hints(ProjectMetadata)
        for where, metadata in _metadata_yaml_literals():
            parsed = _parse_project_metadata(metadata, _FakeRoot(where))
            for name, annotation in hints.items():
                value = getattr(parsed, name)
                assert _annotation_allows(annotation, value), (
                    f"{where}: {name} = {value!r} does not match {annotation}"
                )


class _FakeRoot:
    """A project root with a name and no files on disk.

    The sweep is about the projection, not the sidecars, so the stylesheet and
    back-page readers find nothing and return None - itself one of the shapes
    they are declared to produce.
    """

    def __init__(self, name: str) -> None:
        self.name = name

    def __truediv__(self, _other: str) -> _FakeRoot:
        return self

    def is_dir(self) -> bool:
        return False

    def exists(self) -> bool:
        return False

    def iterdir(self) -> list[_FakeRoot]:
        return []

    def rglob(self, _pattern: str) -> list[_FakeRoot]:
        return []
