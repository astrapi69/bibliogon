#!/bin/bash
# Non-blocking pre-commit reminder.
#
# Triggers when the staged changes contain newly-added ``[x]`` items
# in docs/ROADMAP.md or docs/backlog.md and prints a one-shot hint
# pointing at the archive script. Always exits 0 so a deliberate
# defer (e.g. mid-merge) does not block the commit.
#
# Continuous-archival rule: closed tasks belong in
# docs/roadmap-archive/YYYY-MM.md, not in the active files.

set -e

if ! git diff --cached --name-only \
    | grep -qE "^docs/(ROADMAP|backlog)\.md$"; then
    exit 0
fi

new_done=$(git diff --cached docs/ROADMAP.md docs/backlog.md 2>/dev/null \
    | grep -cE "^\+\s*-\s*\[x\]" || true)

if [ "${new_done:-0}" -gt 0 ]; then
    echo ""
    echo "Reminder: ${new_done} task(s) marked [x] in this commit."
    echo "  Archive them with: make archive-task"
    echo "  (Reminder only - commit proceeds.)"
    echo ""
fi

exit 0
