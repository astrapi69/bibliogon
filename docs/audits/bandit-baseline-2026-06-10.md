# bandit Python SAST Baseline — 2026-06-10

First baseline for [bandit](https://github.com/PyCQA/bandit) code-level
static application security testing. Complements the dependency-level
`pip-audit` scan (#47) with source-code SAST. Issue #50.

## Tooling

- **bandit** `1.9.4` (backend dev group + pinned pre-commit rev + CI).
- **Config:** `[tool.bandit]` in `backend/pyproject.toml` (`exclude_dirs`
  only; tests / `__pycache__` / `.venv` / `node_modules` excluded).
- **Gate:** MEDIUM severity + MEDIUM confidence (LOW is too noisy to gate).
- **Targets:** `backend/app/`, `plugins/`, `scripts/`.
- **Invocation:** `make security-backend` (bandit + pip-audit), the
  `bandit` pre-commit hook, and the "Security analysis (bandit)" CI step
  all run the same gate.

## Run metrics

```
Total lines of code scanned: 45,447

By severity (gate = Medium + High):
  High:    0
  Medium:  0   (5 B108 findings accepted via #nosec, see below)
  Low:    33   (documented, below the gate; iterative cleanup)
```

The gate is **green**: 0 High and 0 un-accepted Medium findings.

## Accepted Medium findings (5x B108, `#nosec`-annotated)

All 5 Medium findings are `B108:hardcoded_tmp_directory` — argparse
`default=` values pointing at `/tmp/...` in developer-only umlaut tooling.
These defaults are user-overridable via their CLI flags and the exact
literal paths are part of the documented workflow in
`.claude/rules/lessons-learned.md` ("German content uses real umlauts").
They are not security-sensitive temp-file writes, so each is annotated
with a bare `# nosec B108` at the literal:

| File | Line | Flag |
|------|------|------|
| `scripts/build_in_scope_list.py` | `--output` default | `B108` |
| `scripts/discover_unknown_umlauts.py` | `--file-list` default | `B108` |
| `scripts/find_umlaut_candidates.py` | positional `file_list` default | `B108` |
| `scripts/find_umlaut_candidates.py` | `--output` default | `B108` |
| `scripts/replace_umlauts.py` | `--report` default | `B108` |

> Note: bandit prints a cosmetic `nosec encountered ... but no failed
> test` WARNING for these on a multi-line `add_argument(...)` call. It is
> a known bandit line-attribution quirk on stderr; it does not affect the
> exit code and the gate stays green.

## Low findings (33, below the gate — iterative cleanup)

Not gated; recorded here for iterative review. Breakdown by test:

| Test | Name | Count | Notes |
|------|------|------:|-------|
| `B110` | `try_except_pass` | 11 | swallowed exceptions; review against the error-handling rule |
| `B404` | `blacklist` (import subprocess) | 7 | subprocess import; benign where the call is controlled |
| `B603` | `subprocess_without_shell_equals_true` | 7 | no shell, args are lists; low risk |
| `B112` | `try_except_continue` | 4 | review for swallowed exceptions |
| `B607` | `start_process_with_partial_path` | 3 | e.g. `git`, `pandoc` on PATH; controlled |
| `B105` | `hardcoded_password_string` | 1 | **false positive** — `_AUTO_SECRET_FILENAME = "credentials.secret"` in `backend/app/credential_store.py:45` is a filename constant, not a secret |

No real hardcoded secrets, `eval`/`exec`, or SQL-injection findings were
detected at any severity. The `B110`/`B112` swallowed-exception findings
are the most worthwhile follow-up (they intersect the project's
"no bare `except`" error-handling rule); fix iteratively, do not mass-fix.

## Regenerating this baseline

```bash
make security-backend
# or, for the JSON breakdown used above:
cd backend && poetry run bandit -c pyproject.toml -r app ../plugins ../scripts -q -f json
```
