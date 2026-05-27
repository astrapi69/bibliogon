# Auto-translated i18n keys

Keys in this list were machine-translated (via Claude) and need
native-speaker review. Once a translation is verified, remove its
row from the matching language column.

The parity test in [backend/tests/test_i18n_parity.py](../../tests/test_i18n_parity.py)
does not inspect this file; it is maintenance metadata only.

## 2026-05-27 — Image-row Tier 1+2 sections for image_top + image_left (ES, FR, EL, PT, TR, JA)

52 keys translated into 6 languages = 312 translation cells.
All stem from PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 2
C1+C2+C5 (Tier Visual-Style + Typography sections for
image_top_text_bottom + image_left_text_right; same 26-key
shape as the Session 1 C9 overlay_text + speech_bubble.tier1/2).

| Key prefix | Keys | Languages |
|---|---|---|
| `ui.page_editor.config.image_top_text.tier1.*` | 13 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.image_top_text.tier2.*` | 13 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.image_left_text.tier1.*` | 13 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.image_left_text.tier2.*` | 13 | ES, FR, EL, PT, TR, JA |

DE canonical (real umlauts: Visueller Stil / Schriftgröße /
etc.), EN direct-translation authored.

The image_top_text + image_left_text Tier translations REUSE
the same overlay_text + speech_bubble translations verbatim
per language — they're the same fields (Border color, Font
size, etc.) applied to a different container, so the user
sees consistent terminology across all Tier surfaces.

## 2026-05-27 — Overlay text Tier 1+2 + width/height (ES, FR, EL, PT, TR, JA)

29 keys translated into 6 languages = 174 translation cells.
All stem from PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C5+C7+C9 (Tier
Visual-Style + Typography sections for image_full_text_overlay
+ Bug D text_container_width / text_container_height sliders).

| Key prefix | Keys | Languages |
|---|---|---|
| `ui.page_editor.config.text_container_width` | 1 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.text_container_height` | 1 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.text_container_height_auto` | 1 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.overlay_text.tier1.*` | 13 | ES, FR, EL, PT, TR, JA |
| `ui.page_editor.config.overlay_text.tier2.*` | 13 | ES, FR, EL, PT, TR, JA |

DE canonical (real umlauts: Visueller Stil / Hintergrundfarbe /
Schriftgröße / etc.), EN direct-translation authored. The
overlay_text Tier 1+2 translations REUSE the existing
speech_bubble Tier 1+2 translations verbatim per language —
they're the same fields (Background color, Border color, Font
size, etc.) just applied to a different container, so the user
sees consistent terminology across all Tier surfaces (bubble +
overlay + future comic-panel).

## 2026-05-27 — Storyboard annotations: notes / beat / mood / act-group (ES, FR, EL, PT, TR, JA)

18 keys translated into 6 languages = 108 translation cells.
All stem from PICTURE-BOOK-STORYBOARD-VIEW-01 Session 2 C5
(annotation strings for the C1 NotesEditor + C2 BeatSelector +
C3 MoodColorPicker + C4 ActGroupInput components).

| Key | Languages |
|-----|-----------|
| `ui.storyboard.notes_label` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.notes_placeholder` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat_label` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat_none` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood_label` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood_clear` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.act_group_label` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.act_group_placeholder` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.sunny` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.passionate` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.calm` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.dreamy` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.peaceful` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.adventurous` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.tender` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.somber` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.mysterious` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.mood.gentle` | ES, FR, EL, PT, TR, JA |

DE canonical (real umlauts: Verträumt, Düster, etc.), EN
direct-translation authored.

## 2026-05-27 — Storyboard-View (ES, FR, EL, PT, TR, JA)

16 keys translated into 6 languages = 96 translation cells. All
stem from PICTURE-BOOK-STORYBOARD-VIEW-01 Session 1 C7 (new
``ui.storyboard.*`` namespace + ``ui.page_editor.show_storyboard``
button label).

| Key | Languages |
|-----|-----------|
| `ui.page_editor.show_storyboard` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.title` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.back` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.pages_unit` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.empty` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.loading` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.load_error` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.open_page` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.card_no_text` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.drag_handle` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.setup` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.inciting` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.rising` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.climax` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.falling` | ES, FR, EL, PT, TR, JA |
| `ui.storyboard.beat.resolution` | ES, FR, EL, PT, TR, JA |

DE canonical (real umlauts per the German-content rule), EN
direct-translation authored. "Storyboard" itself is kept as a
loanword across ES/FR/PT/TR (widely-understood industry term);
EL + JA use phonetic/native equivalents (Στόρυμπορντ +
ストーリーボード).

## 2026-05-26 — Article-Dashboard import-chevron tooltip (ES, FR, EL, PT, TR, JA)

1 key translated into 6 languages = 6 translation cells. Stems
from the Article Dashboard top-nav alignment fix (the standalone
"Aus Medium importieren" button collapsed into an Importieren
split-button so the top-nav doesn't widen the Article view past
the Book Dashboard width).

| Key | Languages |
|-----|-----------|
| `ui.articles.import_more_tooltip` | ES, FR, EL, PT, TR, JA |

DE canonical, EN direct-translation authored.

## 2026-05-26 — Settings-sidebar group labels (ES, FR, EL, PT, TR, JA)

5 keys translated into 6 languages = 30 translation cells. All
stem from SETT-L-1 C4 (Settings page replaced its horizontal tab
bar with a left-sidebar nav; the group headers + nav landmark
need user-visible strings).

| Key | Languages |
|-----|-----------|
| `ui.settings.sidebar_nav` | ES, FR, EL, PT, TR, JA |
| `ui.settings.group_darstellung` | ES, FR, EL, PT, TR, JA |
| `ui.settings.group_inhalt` | ES, FR, EL, PT, TR, JA |
| `ui.settings.group_system` | ES, FR, EL, PT, TR, JA |
| `ui.settings.group_info` | ES, FR, EL, PT, TR, JA |

DE is canonical (Asterios-authored); EN is direct-translation
authored.

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

## 2026-05-22 — KDP Phase 2 wizard strings (ES, FR, EL, PT, TR, JA)

35 keys for the KDP Publishing Wizard Phase 2 (C8-C11):
pricing step + ARC step + conflict banner. EN passthrough
shipped pending native-speaker review.

| Key | Languages |
|-----|-----------|
| `ui.kdp_publishing_wizard.step_pricing` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.step_arc` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_hint` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_royalty_plan` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_royalty_35_hint` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_royalty_70_hint` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_options` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_kdp_select` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_expanded_distribution` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_ebook_prices` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_region` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_list_price` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_royalty` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_paperback` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_page_count` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_print_cost` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_paperback_royalty` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.pricing_70_ineligible` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_hint` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_name_placeholder` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_email_placeholder` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_add` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_empty` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_loading` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_load_failed` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_status_invited` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_status_sent` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_status_received` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_status_reviewed` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_status_declined` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_mailto_subject` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.arc_send_mail` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.conflict_banner` | ES, FR, EL, PT, TR, JA |
| `ui.kdp_publishing_wizard.conflict_dismiss` | ES, FR, EL, PT, TR, JA |
