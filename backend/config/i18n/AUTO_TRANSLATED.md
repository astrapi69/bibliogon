# Auto-translated i18n keys

Keys in this list were machine-translated (via Claude) and need
native-speaker review. Once a translation is verified, remove its
row from the matching language column.

The parity test in [backend/tests/test_i18n_parity.py](../../tests/test_i18n_parity.py)
does not inspect this file; it is maintenance metadata only.

## 2026-04-22 — Git + SSH + export-dialog strings (ES, FR, EL, PT, TR, JA)

19 keys translated into 6 languages = 114 translation cells. All
stem from the v0.21.0 Git-backup, SSH-key and dry-run-export
features. The English placeholders had been left in place by a
prior fill pass; this commit replaces them with machine
translations so the i18n advisory check stops flagging them.

| Key | Languages |
|-----|-----------|
| `ui.audiobook.previews_empty` | ES, FR, EL, PT, TR, JA |
| `ui.export_dialog.dry_run_hint` | ES, FR, EL, PT, TR, JA |
| `ui.export_dialog.missing_images_hint` | ES, FR, EL, PT, TR, JA |
| `ui.git.auth_failed` | ES, FR, EL, PT, TR, JA |
| `ui.git.confirm_accept_local` | ES, FR, EL, PT, TR, JA |
| `ui.git.conflict_diverged_body` | ES, FR, EL, PT, TR, JA |
| `ui.git.conflict_push_rejected_body` | ES, FR, EL, PT, TR, JA |
| `ui.git.conflict_resolve_body` | ES, FR, EL, PT, TR, JA |
| `ui.git.diverged` | ES, FR, EL, PT, TR, JA |
| `ui.git.not_initialized` | ES, FR, EL, PT, TR, JA |
| `ui.git.nothing_to_commit` | ES, FR, EL, PT, TR, JA |
| `ui.git.pat_hint` | ES, FR, EL, PT, TR, JA |
| `ui.git.pull_no_changes` | ES, FR, EL, PT, TR, JA |
| `ui.git.push_rejected` | ES, FR, EL, PT, TR, JA |
| `ui.git.remote_pat_stored` | ES, FR, EL, PT, TR, JA |
| `ui.ssh.comment_hint` | ES, FR, EL, PT, TR, JA |
| `ui.ssh.confirm_delete` | ES, FR, EL, PT, TR, JA |
| `ui.ssh.confirm_overwrite` | ES, FR, EL, PT, TR, JA |
| `ui.ssh.intro` | ES, FR, EL, PT, TR, JA |

## 2026-04-23 — Import wizard (`ui.import_wizard.*`) strings for DE, ES, FR, EL, PT, TR, JA

46 keys under `ui.import_wizard.*` plus one `ui.dashboard.import_new`
added for the new CIO-01 import wizard (see
`docs/explorations/core-import-orchestrator.md`). EN is the source;
DE/ES/FR/EL/PT/TR/JA translations machine-generated with Claude,
need native-speaker review.

Technical terms left in English where the convention in each locale
usually keeps them: Import, .bgb, .md, .markdown, .txt, .zip, MB.
Placeholders (`{n}`, `{title}`, `{count}`, `{formats}`, `{size}`,
`{max}`, `{date}`) preserved across all languages.

### Review guidance for native speakers

- Technical terms (commit, push, pull, merge, force push, PAT,
  SSH, Ed25519, GitHub, GitLab, Gitea, repository, branch) stay
  in English where the language community usually keeps them
  that way. Adjust if the idiomatic usage in your locale prefers
  a native term.
- Placeholders (`{var}`) must match the English value's set.
  The parity test enforces this.
- Length should stay within ~1.3× the English value; the
  Dashboard buttons and dialog body copy have limited space.
- Where the English value uses an em-dash (—), translations
  retain it for consistency even though the coding standards
  discourage em-dashes in code. Changing this is a separate
  editorial pass.
