"""One-time data fix: set ``genre = "Kinderbuch"`` on the nine children's books (#854).

Why
---
plugin-aplus escalates soft words to hard errors for children's books. That
escalation reads ``Book.genre`` first and only falls back to a text heuristic
over the description. ``genre`` is NULL on all 44 books, so today the
escalation rests entirely on that heuristic - which #839 showed catches only
4 of the 9 real children's books, and which stops working as soon as a
description is reworded. Filling ``genre`` makes it deterministic.

What it does NOT do
-------------------
It never touches ``book_type``. All nine are ``prose``; switching them to
``picture_book`` would flip the content model from chapters to pages and make
"Das lachende Pferd" (10 chapters) unreachable in the editor.

Safety
------
- **Dry-run by default.** ``--apply`` writes.
- **Idempotent.** A book already set to the target genre is reported as
  unchanged; re-running after a successful apply writes nothing.
- **Wrong-database guard.** Books are matched by id, and each id's title must
  match the expected one. Any missing id or title mismatch aborts before a
  single write, so pointing this at the wrong data dir cannot corrupt it.
- **Refuses to overwrite.** A book that already has some OTHER genre is left
  alone and reported; this script only fills empty values.

Usage
-----
Against the agent copy first (see .claude/rules/dev-db-isolation.md)::

    BIBLIOGON_DATA_DIR=<repo>/.agent-data poetry run python ../scripts/set_kinderbuch_genre.py
    BIBLIOGON_DATA_DIR=<repo>/.agent-data poetry run python ../scripts/set_kinderbuch_genre.py --apply

Then, after a fresh snapshot, against the live data dir.
"""

from __future__ import annotations

import argparse
import sys

from app.database import SessionLocal
from app.models import Book

TARGET_GENRE = "Kinderbuch"

#: ``book id -> expected title``. The title is a guard, not a selector: if an
#: id resolves to a different title the database is not the one this fix was
#: written for, and the run aborts.
TARGETS: dict[str, str] = {
    "745a55c67c0c42c0b3fbc8155d5fcde4": "Die Abenteuer von Fips",
    "d2527a4c498941958d674c590a83a76a": "The Adventures of Fips",
    "3998b88558ea45368fde16702eab16ef": "Las aventuras de Fips",
    "bdc3a9cd45454741ad7aa55f52bc4f4c": "Les aventures de Fips",
    "b969f3f8a3844fcabd0cd9364b17b6c8": "Das lachende Pferd",
    "5323e638cb064f2385809b219755fa2b": "The Laughing Horse – A Greek Tale for Kids",
    "b0e560db1e3e4089a4d88f5daa1c9041": "El caballo que se reía",
    "479b17026a204264bf90889fa9aaab17": "Le cheval qui riait",
    "7e9d52ac55ca40e0be983c6c799f676d": "Timmy und der Meister des Nasenbohrens",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the genre to the DB. Without this flag the script reports only.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = db.query(Book).filter(Book.id.in_(list(TARGETS))).all()
        by_id = {row.id: row for row in rows}

        problems: list[str] = []
        for book_id, expected_title in TARGETS.items():
            row = by_id.get(book_id)
            if row is None:
                problems.append(f"  missing: {book_id} ({expected_title})")
            elif (row.title or "") != expected_title:
                problems.append(
                    f"  title mismatch for {book_id}:\n"
                    f"      expected {expected_title!r}\n"
                    f"      found    {row.title!r}"
                )
        if problems:
            print("Refusing to run - this does not look like the intended database:")
            print("\n".join(problems))
            return 2

        to_change: list[Book] = []
        already: list[Book] = []
        conflicting: list[Book] = []
        for book_id in TARGETS:
            row = by_id[book_id]
            current = (row.genre or "").strip()
            if current == TARGET_GENRE:
                already.append(row)
            elif current:
                conflicting.append(row)
            else:
                to_change.append(row)

        verb = "Setting" if args.apply else "Would set"
        print(f"{verb} genre={TARGET_GENRE!r} on {len(to_change)} book(s):")
        for row in to_change:
            print(f"  [{row.language}] {row.title}  (genre {row.genre!r} -> {TARGET_GENRE!r})")

        if already:
            print(f"\nAlready {TARGET_GENRE!r}, unchanged ({len(already)}):")
            for row in already:
                print(f"  [{row.language}] {row.title}")

        if conflicting:
            print(f"\nLeft alone - already carry a different genre ({len(conflicting)}):")
            for row in conflicting:
                print(f"  [{row.language}] {row.title}  (genre={row.genre!r})")

        print(f"\nbook_type untouched for all {len(TARGETS)} books.")

        if not args.apply:
            print("\nDry run. Re-run with --apply to write.")
            return 0

        if not to_change:
            print("\nNothing to write.")
            return 0

        for row in to_change:
            row.genre = TARGET_GENRE
        db.commit()
        print(f"\nWrote {len(to_change)} row(s).")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
