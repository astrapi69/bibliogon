#!/usr/bin/env python3
"""audit_notify_error_calls.py — classify every ``notify.error(...)``
call in ``frontend/src/`` and enforce that error-handler callsites
pass the caught error as the second argument.

Why this exists
---------------
``frontend/src/utils/notify.ts`` exports ``notify.error(message,
apiError?)``. When the second argument is an ``ApiError``, the
toast renders a "Issue melden" button that opens an
``ErrorReportDialog`` prefilled with endpoint, status, stacktrace,
and environment context — the load-bearing piece of Bibliogon's
"every error must be actionable as a GitHub issue" promise
from ``.claude/rules/code-hygiene.md`` "Error reporting".

A callsite that drops the caught error (passes only a string)
silently degrades the user experience: the toast still renders,
but the rich Issue-Melden affordance is missing because there
is no ``ApiError`` to feed the dialog.

This script catches that pattern. Filed by
NOTIFY-ERROR-APIERROR-COVERAGE-01 (2026-05-15).

Classification
--------------
For each ``notify.error(...)`` call:

- **A_OK**: already passes >= 2 arguments. ✓
- **C_VALIDATION**: 1 argument, NOT inside a catch / .catch handler.
  These are correct validation messages (e.g. "Please pick a file")
  where no error exists.
- **B_FIXABLE**: 1 argument, inside a ``catch (err) { ... }`` block,
  and the catch variable is NOT mentioned in the args. Always a
  cleanup target.
- **A_HAS_VAR**: 1 argument, the catch variable name appears
  *inside* the args (e.g. ``notify.error(describeError(err))``),
  but is not passed as the dedicated 2nd argument. Also a cleanup
  target — passing ``err`` alongside the message means the toast
  can show the rich error UI even if the message was extracted
  via a helper.

Usage
-----
::

    python3 scripts/audit_notify_error_calls.py
        # prints class breakdown + lists fixable sites; exit 0

    python3 scripts/audit_notify_error_calls.py --enforce
        # exits 1 if any B_FIXABLE / A_HAS_VAR sites exist.
        # Suitable for pre-commit / CI.

Heuristics + limitations
------------------------
- Catch detection looks for both ``} catch (err)`` (sync) and
  ``.catch((err) =>`` / ``.catch(err =>`` (Promise-callback) shapes.
- The catch scope is computed by counting braces from the catch
  block's opening brace; close-bracket goes through the brace
  count. String literals and template strings are skipped so a
  ``"}"`` inside a string never breaks balance.
- ``.test.`` files are excluded from production-callsite counts.
- The audit's classifier deliberately ignores the value of the
  arg expression beyond grepping for the catch-variable name.
  This is sufficient for the current cleanup; future false
  positives (e.g. someone shadows ``err`` deliberately) require
  inspection.

Stdlib-only (re + pathlib + argparse).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

NOTIFY_ERROR_RE = re.compile(r"notify\.error\(")
CATCH_RE = re.compile(r"\}\s*catch\s*\(\s*(\w+)\s*[):]")  # "} catch (err)"
ARROW_CATCH_RE = re.compile(r"\.catch\(\s*\(?\s*(\w+)\s*\)?\s*=>")  # ".catch(err =>" or ".catch((err) =>"


def find_callsite_end(text: str, start: int) -> int:
    """Return index of the closing ``)`` that matches the opening
    ``(`` at ``start``. Returns -1 on imbalance (truncated source
    or syntax error)."""
    depth = 0
    i = start
    in_str: str | None = None
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in '"\'`':
            in_str = ch
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def classify_file(path: Path) -> list[tuple[int, str, str]]:
    """Return a list of ``(line_no, class, snippet)`` for each
    ``notify.error`` callsite in the file."""
    text = path.read_text(encoding="utf-8")
    results: list[tuple[int, str, str]] = []
    for m in NOTIFY_ERROR_RE.finditer(text):
        call_start = m.end()
        end = find_callsite_end(text, m.end() - 1)
        if end < 0:
            continue
        args_text = text[call_start:end]
        line_no = text[: m.start()].count("\n") + 1

        depth = 0
        in_str: str | None = None
        comma_count = 0
        for ch in args_text:
            if in_str:
                if ch == "\\":
                    continue
                if ch == in_str:
                    in_str = None
                continue
            if ch in '"\'`':
                in_str = ch
                continue
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            elif ch == "," and depth == 0:
                comma_count += 1
        arg_count = 1 + comma_count
        if arg_count >= 2:
            results.append((line_no, "A_OK", _snippet(args_text)))
            continue

        prefix = text[: m.start()]
        candidates: list[tuple[int, str]] = []
        for cm in CATCH_RE.finditer(prefix):
            candidates.append((cm.start(), cm.group(1)))
        for am in ARROW_CATCH_RE.finditer(prefix):
            candidates.append((am.start(), am.group(1)))
        candidates.sort()

        catch_var: str | None = None
        for start_pos, var in reversed(candidates):
            i = start_pos
            while i < m.start() and text[i] != "{":
                i += 1
            if i >= m.start():
                continue
            depth = 1
            j = i + 1
            in_str = None
            scope_end = -1
            while j < len(text) and depth > 0:
                ch = text[j]
                if in_str:
                    if ch == "\\":
                        j += 2
                        continue
                    if ch == in_str:
                        in_str = None
                elif ch in '"\'`':
                    in_str = ch
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        scope_end = j
                        break
                j += 1
            if scope_end >= m.start():
                catch_var = var
                break

        if catch_var:
            if re.search(r"\b" + re.escape(catch_var) + r"\b", args_text):
                results.append((line_no, "A_HAS_VAR", _snippet(args_text)))
            else:
                results.append((line_no, "B_FIXABLE", _snippet(args_text)))
        else:
            results.append((line_no, "C_VALIDATION", _snippet(args_text)))
    return results


def _snippet(args_text: str) -> str:
    return args_text[:80].replace("\n", " ").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="exit 1 if any B_FIXABLE / A_HAS_VAR sites are found",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress class breakdown summary; only print fixable sites",
    )
    args = parser.parse_args()

    if not FRONTEND_SRC.exists():
        print(f"error: {FRONTEND_SRC} not found", file=sys.stderr)
        return 2

    files = sorted(
        list(FRONTEND_SRC.glob("**/*.ts")) + list(FRONTEND_SRC.glob("**/*.tsx"))
    )
    classes: dict[str, int] = {}
    fixable: list[tuple[Path, int, str, str]] = []
    for path in files:
        if ".test." in path.name:
            continue
        try:
            r = classify_file(path)
        except Exception as e:
            print(f"!! {path}: {e}", file=sys.stderr)
            continue
        for line, cls, snippet in r:
            classes[cls] = classes.get(cls, 0) + 1
            if cls in ("B_FIXABLE", "A_HAS_VAR"):
                fixable.append((path, line, cls, snippet))

    if not args.quiet:
        print(f"notify.error callsites by class: {classes}")

    if fixable:
        print()
        print("Fixable sites (missing 2nd-arg error pass-through):")
        for path, line, cls, snippet in fixable:
            rel = path.relative_to(REPO_ROOT)
            print(f"  {rel}:{line}\t{cls}\t{snippet}")
        print()
        print(
            "Fix: pass the caught error as the second argument, e.g.\n"
            '    notify.error(t("..."), err)\n'
            "The wrapper checks ``err instanceof ApiError`` internally\n"
            "and renders the rich Issue-Melden affordance when applicable."
        )
        if args.enforce:
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
