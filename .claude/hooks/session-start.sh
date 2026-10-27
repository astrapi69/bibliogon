#!/bin/bash
# SessionStart hook for Claude Code cloud sessions (#1137).
#
# A cloud container starts with no backend venv, no node_modules and an
# AI git identity the repo refuses. This makes a targeted test, a lint
# and a commit work from the first prompt. Local sessions are left alone:
# a workstation has its own setup, and heavy work there is the owner's
# call (.claude/rules/ci-only-heavy-tests.md).
#
# Idempotent: re-running syncs what changed and skips what is current,
# so the cached container state is reused.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
hooks_dir="$(pwd)/.claude/hooks"

bash "$hooks_dir/git-identity.sh"

echo "backend: poetry sync (backend + every plugin as a path dependency)"
(cd backend && poetry sync --no-interaction --no-ansi)

if [ ! -d frontend/node_modules ] \
    || [ frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]; then
    echo "frontend: npm ci"
    (cd frontend && npm ci --no-audit --no-fund)
else
    echo "frontend: node_modules current"
fi

make install-hooks >/dev/null
echo "git hooks installed"
echo "plugin tests use the backend venv:" \
    'cd plugins/<name> && "$(poetry -C ../../backend env info -p)/bin/pytest" tests/<file>'
