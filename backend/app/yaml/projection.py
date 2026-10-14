"""Projecting an untrusted YAML value onto a field of a declared type.

YAML types what it reads, and the files these values come from are written by
hand: ``date: 2026-03-01`` is a ``datetime.date``, ``edition: 2`` is an
``int``, an unquoted 13-digit ISBN is an ``int`` too, a key with nothing after
it is ``None``, and anything at all can be a list or a mapping. The field on
the far side declares one type.

``str(value)`` is the wrong default for that gap, and it cost three shipped
bugs before anyone wrote the contract down (#1108):

- #1086 - a bare key became the literal word ``"None"`` in the A+ package.
- #1091 - an unquoted date reached a ``str | None`` field and the detect
  endpoint answered **HTTP 500**.
- #1103 - a list became its Python repr, so ``title: [a, b]`` imported a book
  titled ``['a', 'b']`` - visible on the dashboard, in the editor header and
  in every export, which is quieter than a 500 and therefore worse.

Each was fixed where it was found. None of the three was a contract, and the
two sites sat in different packages (``app/services/backup`` and
``plugins/bibliogon-plugin-aplus``), so the same class was patched twice in
parallel. This module is the one contract both read.

The contract is stated per INPUT KIND, not per example, which is what makes
the three incidents instances rather than coincidences. See
``backend/tests/test_yaml_projection.py`` - the table there is the spec.

@example
    as_text(metadata.get("title"))          # str | None, for ProjectMetadata
    as_text(entry.get("heading"), absent="")  # str, for the A+ package model
    as_int(series.get("volume"))            # int | None
"""

from __future__ import annotations

import datetime
from typing import Any, overload

__all__ = ["as_int", "as_text"]

#: Values that are containers rather than scalars. A field declared as text
#: or as a number never wants one: the reader that DOES want a container
#: (``series``, ``isbn``, ``asin``, ``identifiers``, ``keywords``, ``author``)
#: indexes into it first and projects the leaf.
_CONTAINERS = (list, tuple, set, frozenset, dict)


@overload
def as_text(value: Any) -> str | None: ...


@overload
def as_text(value: Any, *, absent: str) -> str: ...


def as_text(value: Any, *, absent: str | None = None) -> str | None:
    """One YAML value as the text of a declared text field.

    Args:
        value: Whatever the YAML parser produced, including the ``None`` that
            ``dict.get`` returns for a key the author never wrote.
        absent: What "there is nothing here" renders as. ``None`` for a field
            declared ``str | None`` (``ProjectMetadata``); ``""`` for a field
            declared ``str`` (the A+ package model). One contract, two
            defaults - two functions would drift, which is how #1086 and
            #1091 came to be fixed twice.

    Returns:
        The text, or ``absent``.

    Per input kind:

    - missing key, ``None``, blank or whitespace-only string -> ``absent``.
    - ``str`` -> stripped.
    - ``int`` / ``float`` -> its digits. An author who writes an unquoted
      number means those digits; YAML merely typed them.
    - ``date`` / ``datetime`` -> ISO. That is what the author wrote and what
      the metadata round-trips back to. ``str()`` agrees for a date and
      disagrees for a datetime, which it renders with a space where ISO wants
      a ``T``.
    - ``list`` / ``tuple`` / ``set`` / ``dict`` -> ``absent``. A container is
      not text, and its repr is not a translation of one.
    - ``bool`` -> ``"True"`` / ``"False"``, deliberately unchanged. PyYAML
      follows YAML 1.1, where ``edition: yes`` is a boolean; dropping it would
      lose what the author typed and rendering it otherwise would invent
      something they did not write. #1103 left this as its own decision and so
      does this module.
    """
    if value is None:
        return absent
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, _CONTAINERS):
        return absent
    text = str(value).strip()
    return text or absent


def as_int(value: Any) -> int | None:
    """One YAML value as the number of a declared integer field.

    Per input kind:

    - missing key, ``None`` -> ``None``.
    - ``int`` -> itself.
    - ``float`` -> the int when it is integral, else ``None``. Half a volume
      is not a volume.
    - ``str`` -> parsed when it is digits, else ``None``. A volume written as
      a word ("volume: zwei") has to become ``None`` rather than break the
      response the way the untyped date did.
    - ``bool`` -> ``None``, and this one needs saying: ``isinstance(True, int)``
      is ``True`` in Python, so without the explicit check ``series_index: yes``
      would quietly become volume 1.
    - ``date`` / ``datetime``, ``list`` / ``tuple`` / ``set`` / ``dict``
      -> ``None``.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, (datetime.date, datetime.datetime, *_CONTAINERS)):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None
