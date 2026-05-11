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

## 2026-04-24 — CIO-03 folder-upload wizard strings for DE, ES, FR, EL, PT, TR, JA

3 new keys per language added for the folder-upload UI shipped in
commit 896e7e6:

- `ui.import_wizard.step_1_pick_folder` (button label)
- `ui.import_wizard.error_folder_empty`
- `ui.import_wizard.error_folder_too_many`

Placeholders (`{count}`, `{max}`) preserved across all languages.
Machine-translated; native-speaker review welcome.

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

## 2026-05-09 — Medium-import frontend strings (PT, TR, JA)

46 keys under `ui.medium_import.*` for the new
`/articles/import/medium` page (drop zone, progress, result table,
settings card, pointer card, toast summaries). EN, DE authored
fully. ES, FR, EL produced idiomatically and are good for self-
validation. PT, TR, JA are machine-translated and need native-
speaker review.

| Key prefix | Languages |
|-----|-----------|
| `ui.medium_import.page_title` | PT, TR, JA |
| `ui.medium_import.nav_label` | PT, TR, JA |
| `ui.medium_import.back_to_articles` | PT, TR, JA |
| `ui.medium_import.intro` | PT, TR, JA |
| `ui.medium_import.upload.*` (10 keys) | PT, TR, JA |
| `ui.medium_import.progress.*` (3 keys) | PT, TR, JA |
| `ui.medium_import.result.*` (10 keys) | PT, TR, JA |
| `ui.medium_import.settings.*` (16 keys) | PT, TR, JA |
| `ui.medium_import.toast.*` (2 keys) | PT, TR, JA |

Technical terms left in English/Latin script per the existing
convention: Medium, ZIP, .zip, MB, CDN, URL.
Placeholders preserved: `{count}`, `{imported}`, `{skipped}`,
`{errored}`. The parity test enforces placeholder set equality.

## 2026-05-09 — Medium-import set_first_image_as_featured (PT, TR, JA)

2 new keys for the new "use first body image as featured image"
toggle in the Medium-import settings panel. EN, DE authored
fully. ES, FR, EL produced idiomatically and ready for self-
validation. PT, TR, JA machine-translated; need native-speaker
review.

| Key | Languages |
|-----|-----------|
| `ui.medium_import.settings.set_first_image_as_featured` | PT, TR, JA |
| `ui.medium_import.settings.set_first_image_as_featured_hint` | PT, TR, JA |

No placeholders. Technical term "Medium" left untranslated per
the existing convention.

## 2026-05-11 — Bulk-delete strings (PT, TR, JA)

26 new keys under `ui.bulk_delete.*` for the bulk-delete feature
(Articles + Books dashboards). EN, DE authored fully. ES, FR, EL
produced idiomatically and ready for self-validation. PT, TR, JA
machine-translated; need native-speaker review.

| Key prefix | Languages |
|-----|-----------|
| `ui.bulk_delete.delete_button` | PT, TR, JA |
| `ui.bulk_delete.disabled_min_two` | PT, TR, JA |
| `ui.bulk_delete.option_trash` | PT, TR, JA |
| `ui.bulk_delete.option_permanent` | PT, TR, JA |
| `ui.bulk_delete.confirm_permanent_title` | PT, TR, JA |
| `ui.bulk_delete.confirm_permanent_summary` | PT, TR, JA |
| `ui.bulk_delete.confirm_permanent_button` | PT, TR, JA |
| `ui.bulk_delete.filter_clause_label` | PT, TR, JA |
| `ui.bulk_delete.type_count_prompt` | PT, TR, JA |
| `ui.bulk_delete.type_count_mismatch` | PT, TR, JA |
| `ui.bulk_delete.generic_items` | PT, TR, JA |
| `ui.bulk_delete.items_articles` | PT, TR, JA |
| `ui.bulk_delete.items_books` | PT, TR, JA |
| `ui.bulk_delete.toast_trashed` | PT, TR, JA |
| `ui.bulk_delete.toast_deleted_permanent` | PT, TR, JA |
| `ui.bulk_delete.toast_undone` | PT, TR, JA |
| `ui.bulk_delete.toast_undo_failed` | PT, TR, JA |
| `ui.bulk_delete.toast_failed` | PT, TR, JA |
| `ui.bulk_delete.undo_label` | PT, TR, JA |
| `ui.bulk_delete.filter_search` | PT, TR, JA |
| `ui.bulk_delete.filter_status` | PT, TR, JA |
| `ui.bulk_delete.filter_topic` | PT, TR, JA |
| `ui.bulk_delete.filter_language` | PT, TR, JA |
| `ui.bulk_delete.filter_series` | PT, TR, JA |
| `ui.bulk_delete.filter_tag` | PT, TR, JA |
| `ui.bulk_delete.filter_genre` | PT, TR, JA |

Placeholders preserved: `{count}`, `{noun}`. Sentence punctuation
adapted to each locale (Japanese uses 。and 「」 conventions).
