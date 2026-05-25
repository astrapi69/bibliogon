#!/usr/bin/env python3
"""archive_completed_task.py — move completed [x] tasks out of the
active ROADMAP / backlog files into the monthly archive bucket.

The active files (``docs/ROADMAP.md`` + ``docs/backlog.md``) hold
ONLY open work per the ai-workflow.md "Continuous archival rule".
A task marked ``- [x] **ID**: ...`` is fair game: this script
identifies the block, asks for confirmation, then moves it into
``docs/archive/roadmap/YYYY-MM.md`` (the current month, UTC) under
a ``## Archived YYYY-MM-DD`` section.

Modes
-----
- Default (interactive): scans both active files, prompts per task,
  archives confirmed ones, leaves the rest.
- ``--dry-run``: shows what would change, writes nothing.
- ``--id <TASK_ID>``: archives a single ID without prompting (for
  scripted use). Errors out if the ID is not a [x] item.

The script is stdlib-only (pathlib + re + datetime + argparse).

Workflow
--------
1. Run ``make archive-task`` after marking ``[x]``.
2. Confirm each candidate.
3. Stage all touched files together:
   ``git add docs/ROADMAP.md docs/backlog.md docs/archive/roadmap/``
4. Commit with the same change that closes the task.

Never edit a previously-archived ID. Stable IDs across the archive
boundary mean single-word prompts like "implement T-01" still
resolve from the history.
"""

from __future__ import annotations

import argparse
import datetime
import re
import sys
from pathlib import Path
from typing import Iterator

REPO_ROOT = Path(__file__).resolve().parent.parent
ROADMAP = REPO_ROOT / "docs" / "ROADMAP.md"
BACKLOG = REPO_ROOT / "docs" / "backlog.md"
ARCHIVE_DIR = REPO_ROOT / "docs" / "archive" / "roadmap"

# ``- [x] **TASK-ID**: description``  (the optional colon + space matches both
# styles seen in the wild; the ID prefix mirrors the project's naming
# convention.)
DONE_RE = re.compile(
    r"^(\s*)-\s*\[x\]\s*\*\*([A-Z]+-[0-9]+[a-z]*)\*\*:?\s*(.*)$"
)
SECTION_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


class TaskBlock:
    """One ``[x]`` task plus surrounding context."""

    def __init__(
        self,
        source: Path,
        section: str,
        start_idx: int,
        end_idx: int,
        task_id: str,
        first_line_text: str,
        lines: list[str],
    ) -> None:
        self.source = source
        self.section = section
        self.start_idx = start_idx
        self.end_idx = end_idx  # exclusive
        self.task_id = task_id
        self.first_line_text = first_line_text
        self.lines = lines

    @property
    def sub_count(self) -> int:
        # Lines after the first, ignoring trailing blanks.
        body = self.lines[1:]
        while body and body[-1].strip() == "":
            body.pop()
        return len(body)


def scan_file(path: Path) -> list[TaskBlock]:
    """Return every ``[x]`` task block found in ``path``.

    A block is the matched line plus any immediately-following lines
    that are either indented deeper than the bullet or blank-then-
    indented (Markdown's continuation rules). Stops at the next
    same-or-shallower bullet or any heading.
    """
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    blocks: list[TaskBlock] = []
    current_section = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if (heading := SECTION_RE.match(line)) is not None:
            current_section = f"{heading.group(1)} {heading.group(2)}"
        if (m := DONE_RE.match(line)) is not None:
            indent_len = len(m.group(1))
            task_id = m.group(2)
            first_text = m.group(3).rstrip()
            block_lines = [line]
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                stripped = nxt.lstrip()
                # Blank line: peek one more; if next is indented deeper,
                # blank belongs to the block. Otherwise stop.
                if stripped == "":
                    if j + 1 < len(lines):
                        nxt2 = lines[j + 1]
                        nxt2_indent = len(nxt2) - len(nxt2.lstrip())
                        if nxt2.lstrip() and nxt2_indent > indent_len:
                            block_lines.append(nxt)
                            j += 1
                            continue
                    break
                # Heading -> stop.
                if SECTION_RE.match(nxt):
                    break
                nxt_indent = len(nxt) - len(stripped)
                if nxt_indent <= indent_len:
                    break
                block_lines.append(nxt)
                j += 1
            blocks.append(
                TaskBlock(
                    source=path,
                    section=current_section,
                    start_idx=i,
                    end_idx=j,
                    task_id=task_id,
                    first_line_text=first_text,
                    lines=block_lines,
                )
            )
            i = j
            continue
        i += 1
    return blocks


def archive_path_for(today: datetime.date) -> Path:
    """Monthly bucket: ``docs/archive/roadmap/YYYY-MM.md``."""
    return ARCHIVE_DIR / f"{today.strftime('%Y-%m')}.md"


def ensure_archive_file(path: Path, today: datetime.date) -> str:
    """Return the file's current text, creating it if absent.

    A new file is seeded with a top header + one ``## Archived
    YYYY-MM-DD`` section so the first append has a target.
    """
    if path.exists():
        return path.read_text(encoding="utf-8")
    month_label = today.strftime("%B %Y")
    return (
        f"# Archive: {month_label}\n"
        f"\n"
        f"Continuous-archival sink. Each session that closes a "
        f"task moves the closing block here so the active "
        f"ROADMAP / backlog stay free of completed work. New "
        f"entries land at the top of the matching ``## Archived "
        f"YYYY-MM-DD`` section.\n"
        f"\n"
    )


def insert_into_archive(
    archive_text: str, today: datetime.date, block: TaskBlock
) -> str:
    """Append ``block`` to today's section in ``archive_text``.

    If today's ``## Archived YYYY-MM-DD`` section is absent, prepend
    one above any existing day sections (newest day first).
    """
    today_header = f"## Archived {today.isoformat()}"
    section_marker = f"\n{today_header}\n"
    block_text = "".join(block.lines)
    if not block_text.endswith("\n"):
        block_text += "\n"
    block_with_meta = (
        f"{block_text}"
        f"  - _Archived from {block.source.name}"
        f"{(' / ' + block.section) if block.section else ''}_\n"
    )
    if today_header in archive_text:
        # Insert immediately after the today header (and its trailing
        # blank line, if any).
        idx = archive_text.index(today_header)
        end_of_header = archive_text.index("\n", idx) + 1
        if archive_text[end_of_header : end_of_header + 1] == "\n":
            end_of_header += 1
        return (
            archive_text[:end_of_header]
            + block_with_meta
            + "\n"
            + archive_text[end_of_header:]
        )
    # Prepend a new day section above the first existing ``## Archived``
    # section (or after the file header if no day sections yet).
    first_day = re.search(r"^## Archived ", archive_text, re.MULTILINE)
    insertion = f"{section_marker}\n{block_with_meta}\n"
    if first_day is None:
        if archive_text and not archive_text.endswith("\n"):
            archive_text += "\n"
        return archive_text + insertion
    return (
        archive_text[: first_day.start()]
        + insertion
        + archive_text[first_day.start() :]
    )


def remove_block_from_text(text: str, block: TaskBlock) -> str:
    """Remove ``block.lines`` from ``text`` based on its line indices."""
    lines = text.splitlines(keepends=True)
    del lines[block.start_idx : block.end_idx]
    # Collapse a run of >1 trailing blank lines that the deletion may
    # leave behind; preserves at most one blank between elements.
    cleaned: list[str] = []
    for ln in lines:
        if (
            cleaned
            and cleaned[-1].strip() == ""
            and ln.strip() == ""
        ):
            continue
        cleaned.append(ln)
    return "".join(cleaned)


def remove_backlog_pointer(backlog_text: str, task_id: str) -> str:
    """Drop a one-line backlog pointer for ``task_id``.

    The backlog-as-pointer convention writes
    ``- **ID** ...`` (no checkbox) lines that point at the ROADMAP
    canonical entry. When the canonical entry leaves the active
    files, the pointer goes with it.
    """
    pattern = re.compile(
        rf"^\s*-\s*\*\*{re.escape(task_id)}\*\*[^\n]*\n",
        re.MULTILINE,
    )
    return pattern.sub("", backlog_text)


def prompt_user(block: TaskBlock) -> str:
    """Ask y / n / s. Return one of those characters."""
    desc = block.first_line_text or "(no description)"
    print()
    print(f"Found: {block.task_id} in {block.source.name}")
    if block.section:
        print(f"  Section:     {block.section}")
    print(f"  Description: {desc[:120]}{'...' if len(desc) > 120 else ''}")
    if block.sub_count:
        print(f"  Sub-items:   {block.sub_count} indented line(s)")
    while True:
        ans = input("Archive this task? [y]es / [n]o / [s]kip-all: ").strip().lower()
        if ans in {"y", "n", "s", ""}:
            return ans or "n"


def iter_all_blocks() -> Iterator[TaskBlock]:
    yield from scan_file(ROADMAP)
    yield from scan_file(BACKLOG)


def apply_archival(
    block: TaskBlock,
    today: datetime.date,
    in_memory: dict[Path, str],
) -> Path:
    """Move ``block`` from its source into today's archive bucket.

    ``in_memory`` accumulates pending writes per file so multi-block
    runs see consistent state before any disk write happens.
    """
    archive_p = archive_path_for(today)
    archive_text = in_memory.get(
        archive_p, ensure_archive_file(archive_p, today)
    )
    archive_text = insert_into_archive(archive_text, today, block)
    in_memory[archive_p] = archive_text

    src_text = in_memory.get(block.source, block.source.read_text(encoding="utf-8"))
    src_text = remove_block_from_text(src_text, block)
    in_memory[block.source] = src_text

    # Backlog pointer cleanup runs against the latest in-memory backlog
    # text, not the on-disk one — a multi-block run that already mutated
    # backlog must see those edits.
    if block.source != BACKLOG:
        bl_text = in_memory.get(BACKLOG, BACKLOG.read_text(encoding="utf-8"))
        new_bl = remove_backlog_pointer(bl_text, block.task_id)
        if new_bl != bl_text:
            in_memory[BACKLOG] = new_bl

    return archive_p


def write_all(in_memory: dict[Path, str]) -> None:
    for path, text in in_memory.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def rescan_after_edit(
    target_id: str | None, in_memory: dict[Path, str]
) -> list[TaskBlock]:
    """Re-scan in-memory state to pick up offset shifts after edits."""
    blocks: list[TaskBlock] = []
    for path in (ROADMAP, BACKLOG):
        text = in_memory.get(
            path,
            path.read_text(encoding="utf-8") if path.exists() else "",
        )
        # Cheap shim: write through a temp BlockScanner that takes text.
        blocks.extend(_scan_text(text, path))
    if target_id is not None:
        blocks = [b for b in blocks if b.task_id == target_id]
    return blocks


def _scan_text(text: str, source: Path) -> list[TaskBlock]:
    """Scan a text buffer for [x] blocks (in-memory variant of scan_file)."""
    lines = text.splitlines(keepends=True)
    blocks: list[TaskBlock] = []
    current_section = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if (heading := SECTION_RE.match(line)) is not None:
            current_section = f"{heading.group(1)} {heading.group(2)}"
        if (m := DONE_RE.match(line)) is not None:
            indent_len = len(m.group(1))
            task_id = m.group(2)
            first_text = m.group(3).rstrip()
            block_lines = [line]
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                stripped = nxt.lstrip()
                if stripped == "":
                    if j + 1 < len(lines):
                        nxt2 = lines[j + 1]
                        nxt2_indent = len(nxt2) - len(nxt2.lstrip())
                        if nxt2.lstrip() and nxt2_indent > indent_len:
                            block_lines.append(nxt)
                            j += 1
                            continue
                    break
                if SECTION_RE.match(nxt):
                    break
                nxt_indent = len(nxt) - len(stripped)
                if nxt_indent <= indent_len:
                    break
                block_lines.append(nxt)
                j += 1
            blocks.append(
                TaskBlock(
                    source=source,
                    section=current_section,
                    start_idx=i,
                    end_idx=j,
                    task_id=task_id,
                    first_line_text=first_text,
                    lines=block_lines,
                )
            )
            i = j
            continue
        i += 1
    return blocks


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Move completed [x] tasks out of docs/ROADMAP.md + "
            "docs/backlog.md into docs/archive/roadmap/YYYY-MM.md."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing.",
    )
    parser.add_argument(
        "--id",
        metavar="TASK_ID",
        help=(
            "Archive a single task ID without prompting. Errors out "
            "when the ID is not currently marked [x]."
        ),
    )
    args = parser.parse_args()

    today = datetime.datetime.now(tz=datetime.UTC).date()
    in_memory: dict[Path, str] = {}

    blocks = list(iter_all_blocks())
    if args.id:
        blocks = [b for b in blocks if b.task_id == args.id]
        if not blocks:
            print(
                f"error: no [x] task with id {args.id!r} found in active files",
                file=sys.stderr,
            )
            return 2

    if not blocks:
        print("No [x] tasks found in active files. Nothing to archive.")
        return 0

    archived: list[str] = []
    skipped: list[str] = []
    affected: set[Path] = set()

    for block in blocks:
        if args.id is not None:
            print()
            print(f"Found: {block.task_id} in {block.source.name}")
            if block.section:
                print(f"  Section: {block.section}")
            if block.first_line_text:
                print(
                    f"  Description: {block.first_line_text[:120]}"
                    f"{'...' if len(block.first_line_text) > 120 else ''}"
                )
            decision = "y"
        else:
            decision = prompt_user(block)
        if decision == "s":
            print("Stopped. Remaining tasks left in place.")
            break
        if decision == "n":
            skipped.append(block.task_id)
            continue
        # Re-scan from in-memory state to pick up index shifts after
        # earlier edits.
        re_scanned = _scan_text(
            in_memory.get(block.source, block.source.read_text(encoding="utf-8")),
            block.source,
        )
        match = next((b for b in re_scanned if b.task_id == block.task_id), None)
        if match is None:
            # Already removed in this run (duplicate hit). Skip.
            continue
        archive_p = apply_archival(match, today, in_memory)
        archived.append(block.task_id)
        affected.add(block.source)
        affected.add(archive_p)
        if BACKLOG in in_memory and BACKLOG not in affected:
            affected.add(BACKLOG)

    if args.dry_run:
        print()
        print("--- DRY RUN: no files written ---")
        for path in sorted(affected, key=lambda p: str(p)):
            print(f"would update: {path.relative_to(REPO_ROOT)}")
    else:
        write_all(in_memory)

    print()
    print(
        f"Archived: {len(archived)} task(s) "
        f"({', '.join(archived) if archived else 'none'})"
    )
    if skipped:
        print(f"Skipped:  {len(skipped)} task(s) ({', '.join(skipped)})")
    if affected and not args.dry_run:
        print("Files modified:")
        for path in sorted(affected, key=lambda p: str(p)):
            print(f"  {path.relative_to(REPO_ROOT)}")
        print()
        print("Next steps:")
        print(
            "  git add docs/ROADMAP.md docs/backlog.md docs/archive/roadmap/"
        )
        print("  git diff --cached")
        print("  git commit")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
