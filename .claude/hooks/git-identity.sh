#!/bin/bash
# Set a human git identity in the current repository when there is none
# or when it is an AI identity (#1137). The repo refuses commits by an AI
# author or committer (#786, the "Commit trailers" CI job), and a cloud
# container starts out as Claude <noreply@anthropic.com>.
#
# A human identity is never overwritten. Override the maintainer with
# BIBLIOGON_GIT_NAME / BIBLIOGON_GIT_EMAIL.
set -euo pipefail

name="${BIBLIOGON_GIT_NAME:-Asterios Raptis}"
email="${BIBLIOGON_GIT_EMAIL:-asterios.raptis@web.de}"

current_name="$(git config user.name || true)"
current_email="$(git config user.email || true)"

is_ai() {
    printf '%s %s' "$current_name" "$current_email" \
        | grep -qiE '(^| )claude( |$)|anthropic\.com|noreply@openai|copilot|\[bot\]'
}

if [ -n "$current_name" ] && [ -n "$current_email" ] && ! is_ai; then
    exit 0
fi

git config user.name "$name"
git config user.email "$email"
echo "git identity set to $name <$email> (was: ${current_name:-unset} <${current_email:-unset}>)"
