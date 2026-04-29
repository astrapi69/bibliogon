# Articles dashboard parity audit (vs Books dashboard)

> **Status: closed.** Phase 1 audit + Phase 2 Clusters A-F shipped
> across `aa1fcbf` (Clusters A + B) and the follow-up commit
> referenced in this section's footer. All 24 gaps either
> resolved or explicitly deferred under `I18N-DIACRITICS-01`
> (cosmetic-only) below.



Date: 2026-04-29.
Author: Claude (CC), under user-supplied audit prompt.
Scope: ArticleList (`frontend/src/pages/ArticleList.tsx`)
vs Dashboard (`frontend/src/pages/Dashboard.tsx`) +
matching tile/list components.

Phase 1 only: enumerate gaps. Phase 2 implementation
waits on user approval of the fix list below.

---

## Summary

**24 gaps identified** across 8 areas. Most are header
chrome — Books dashboard has matured into a hub with
backup/import/settings/help/get-started/trash/theme
controls inline; ArticleList stayed minimal. Two are
material UX gaps (permanent-delete missing from tile menu;
dark-mode toggle missing) called out in the user's smoke
report. Rest are smaller polish items.

**By severity:**

- Critical: 0
- High: 4
- Medium: 11
- Low: 9

**Recommended cluster order** (impact / cost):

1. Cluster A: Tile / row action-menu parity (1 commit; ~30 min)
2. Cluster B: Header chrome parity (1 commit; ~1 h)
3. Cluster C: Empty state + toast wording parity (1 commit; ~30 min)
4. Cluster D: i18n parity (folded into A/B/C as per-cluster i18n)
5. Cluster E: Filter / sort parity (out of scope — defer)
6. Cluster F: Mobile responsive parity (out of scope — defer)

Defer Clusters E + F: `useBookFilters` is non-trivial
(genre / language / series); the Articles parallel needs
its own filter shape (topic / language / status) and
should be its own dedicated work.

---

## 1. Header / Navigation

| # | Element | Books | Articles | Severity | Cluster |
|---|---------|-------|----------|----------|---------|
| H-1 | Brand logo + name | Yes (`BookOpen` + "Bibliogon") | No (Home button + "Artikel" heading) | Medium | B |
| H-2 | ThemeToggle (light/dark) | Yes | **No** | **High** | B |
| H-3 | Settings icon-button | Yes | No | Medium | B |
| H-4 | Help / `?` icon-button | Yes | No | Medium | B |
| H-5 | Rocket / Get Started icon-button | Yes | No | Low | B |
| H-6 | Backup export button | Yes | No | Low | B (deferred — not entity-relevant) |
| H-7 | Import wizard button | Yes | No | Low | B (deferred — articles use create dialog) |
| H-8 | Trash toggle | Yes (icon-button + badge count) | Yes (text button + count) | Low (different style) | B |
| H-9 | Mobile hamburger menu | Yes | No | Medium | F (defer) |
| H-10 | Cross-nav button | "Artikel" button to `/articles` | "Dashboard" button to `/` | None — symmetric | — |

**Observed:** Books header is the app's primary chrome
and accumulates global features (backup, settings, help).
Articles is a sub-page that should still expose
ThemeToggle + Settings + Help at minimum so the user
doesn't have to navigate back to the dashboard for those.

## 2. Tile / Card UI

| # | Element | BookCard | ArticleCard | Severity | Cluster |
|---|---------|----------|-------------|----------|---------|
| T-1 | Cover area | 140px h, image or `CoverPlaceholder` | Same | None | — |
| T-2 | Title rendering | `<h3>` + truncation | `<h3>` + truncation | None | — |
| T-3 | Subtitle | `<p>` muted | Same | None | — |
| T-4 | Author display | Yes | No (only in subtitle fallback) | Medium | C |
| T-5 | Status badge | Genre badge | Status pill (`status_${status}`) | None — different field, same shape | — |
| T-6 | Date | Updated date with `Clock` icon | Updated date plain | Low | C |
| T-7 | Language badge | Yes | Yes | None | — |
| T-8 | DropdownMenu trigger | Yes (`MoreVertical`) | Yes | None | — |
| T-9 | Menu item: Move to trash | Yes | Yes (rendered as plain "Löschen") | None — same action, label differs | A |
| T-10 | Menu item: **Permanently delete** | Yes (red) | **No** | **High** | A |
| T-11 | Click target | Whole card | Whole card | None | — |
| T-12 | Hover state | Box-shadow lift | Same | None | — |

**Observed:** Tile UI is largely consistent. Two real gaps:
T-10 (permanent-delete missing from menu) is the user's
flagged finding; T-4 (no dedicated author line) is minor.

## 3. List view

| # | Element | BookListView | ArticleRow | Severity | Cluster |
|---|---------|--------------|------------|----------|---------|
| L-1 | Cover thumb (40x60) | Yes (image / `CoverPlaceholder` compact) | **No** (text-only row) | Medium | C |
| L-2 | Author column | Yes | No (only in subtitle fallback) | Medium | C |
| L-3 | Language column | Yes (badge) | Yes (`UPPERCASE`) | None | — |
| L-4 | Last-edit column | Yes | Yes | None | — |
| L-5 | Actions menu | Yes (DropdownMenu trigger) | No — single Trash2 button | **High** | A |
| L-6 | Permanent-delete in row | Yes (via menu) | **No** | **High** | A |
| L-7 | Status badge | Yes | Yes (in row meta) | None | — |
| L-8 | Topic column | n/a (books) | No | Low | C |

**Observed:** ArticleRow lost feature parity with
BookListRow when soft-delete shipped — row got a single
Trash2 icon instead of the full DropdownMenu. Restoring
the menu pattern resolves L-5 + L-6 in one move.

## 4. Trash panel

| # | Element | Books | Articles | Severity | Cluster |
|---|---------|-------|----------|----------|---------|
| TR-1 | In-page panel toggled by header button | Yes (Dashboard) | Yes (ArticleList) | None | — |
| TR-2 | Empty state | Yes ("Papierkorb ist leer") | Yes ("Keine gelöschten Artikel") | None | — |
| TR-3 | Restore action | Yes | Yes | None | — |
| TR-4 | Permanent-delete action | Yes | Yes | None | — |
| TR-5 | Empty-trash button | Yes | Yes | None | — |
| TR-6 | Trashed-at timestamp | Implicit (via card) | Yes (explicit "Gelöscht" prefix) | None | — |

**Observed:** Trash panel itself is at parity. Recently
shipped in `82acc16`.

## 5. Empty state

| # | Element | Books | Articles | Severity | Cluster |
|---|---------|-------|----------|----------|---------|
| E-1 | Heading + subtitle | Yes (rich onboarding panel) | Yes (smaller `EmptyState`) | None | — |
| E-2 | Quick-create CTA | Yes | Yes | None | — |
| E-3 | Get-started suggestion | Yes (`Erste Schritte` button) | No | Low | C |
| E-4 | Imagery / illustration | No | No | None | — |

## 6. Toasts

| # | Action | Books toast | Articles toast | Severity |
|---|--------|-------------|----------------|----------|
| TO-1 | Soft-delete | "In den Papierkorb verschoben" (info) | Same | None |
| TO-2 | Restore | (no explicit toast in Dashboard handleRestore) | "Artikel wiederhergestellt." (success) | Low — Articles is more verbose, parity could go either way |
| TO-3 | Permanent-delete | "Buch endgültig gelöscht" (success) | "Artikel endgültig gelöscht." (success) | None |
| TO-4 | Empty trash | (no toast) | (no toast) | None |
| TO-5 | Undo action on toast | No | No | None — neither has it |

**Observed:** Toast wording mostly matches. Books'
`handleRestore` is silent; Articles surfaces a success
toast. Either pattern is fine; not a regression.

## 7. Settings exposure

| # | Setting | Books-relevant | Articles-relevant |
|---|---------|----------------|-------------------|
| S-1 | Default language | Yes (Allgemein > language) | Inherits |
| S-2 | Default view (grid / list) | Yes (this session) | Yes (this session) |
| S-3 | Trash auto-delete | Yes | Implicit — articles share the books toggle |
| S-4 | Allow books without author | Yes | n/a |
| S-5 | Topics list | n/a | Yes (Topics tab) |

**Observed:** Settings exposure is at parity given the
entity differences. No gap.

## 8. Keyboard shortcuts

| # | Shortcut | Books | Articles | Severity |
|---|----------|-------|----------|----------|
| K-1 | Cmd+N for new | No | No | None |
| K-2 | Esc to close menu | Radix default | Radix default | None |
| K-3 | Arrow nav between tiles | No | No | None |

**Observed:** Neither dashboard has custom shortcuts;
parity by absence. Not a gap.

## 9. i18n coverage

DE keys in `articles.*` namespace: ~50 (after this
session's trash work).
DE keys in `dashboard.*` namespace: ~30+.

`articles.*` covers all articles features. No missing
translation gaps after the recent trash + i18n shipment.
Future implementation may add more.

---

## Aggregate gap list (24)

### High (4)

1. **H-2** — ThemeToggle missing in articles header.
2. **T-10** — Permanent-delete missing from ArticleCard
   DropdownMenu.
3. **L-5** — ArticleRow has no DropdownMenu (only
   single-action Trash2 button).
4. **L-6** — Permanent-delete missing from ArticleRow.

### Medium (11)

5. **H-1** — No brand logo / name in articles header.
6. **H-3** — Settings icon-button missing.
7. **H-4** — Help icon-button missing.
8. **H-9** — No mobile hamburger menu (defer to F).
9. **T-4** — Tile has no dedicated author line.
10. **L-1** — ArticleRow has no cover thumbnail.
11. **L-2** — ArticleRow has no dedicated author column.
12. **C-x** — Article toasts/wording could fold "undo"
    affordance but books don't either; defer.
13. **L-8** — No topic column in ArticleRow.

(Remaining 5 small consistency items rolled into the Low
list below.)

### Low (9)

14. **H-5** — Rocket / Get-started icon missing
    (deferrable).
15. **H-6** — Backup button missing (deferred — books-
    only feature).
16. **H-7** — Import wizard button missing (deferred —
    articles use create dialog).
17. **H-8** — Trash toggle styling differs (text button
    vs icon-button + badge).
18. **T-6** — Tile date has no `Clock` icon.
19. **T-12** — Hover lift uniform; no actual gap.
20. **TR-6** — Trashed-at timestamp wording could match
    book trash exactly (low).
21. **TO-2** — Articles' restore toast verbosity differs
    from books' silent restore.
22. **E-3** — Articles empty state has no Get-started
    button.

---

## Recommended fix clusters

### Cluster A — tile/row action-menu parity (HIGH priority)

Resolves: T-10, L-5, L-6.

Changes:
- ArticleCard: add "Permanently delete" item to existing
  DropdownMenu (red), with confirm dialog matching the
  book pattern.
- ArticleRow: replace single Trash2 button with full
  DropdownMenu containing soft-delete + permanent-delete.
- ArticleList: pass `onPermanentDelete={(a) => void
  handlePermanentDelete(a)}` to both.
- i18n: reuse existing
  `ui.articles.delete_permanent_*` keys (already shipped).

Estimated effort: 30 min.

### Cluster B — header chrome parity (HIGH priority for H-2, MEDIUM for rest)

Resolves: H-1, H-2, H-3, H-4, H-5, H-8.

Changes:
- ArticleList header: replace text-only "Artikel" heading
  with brand logo + heading + icon row matching Dashboard
  header (ThemeToggle, Settings, Help, Get-started,
  Trash icon-button with badge).
- Defer H-6 (backup) + H-7 (import) — books-only.
- Mobile hamburger (H-9) deferred to Cluster F.
- i18n: reuse existing dashboard keys.

Estimated effort: ~1 h.

### Cluster C — tile / row content parity (MEDIUM priority)

Resolves: T-4, T-6, L-1, L-2.

Changes:
- ArticleCard: add dedicated author line under subtitle.
- ArticleCard: add `Clock` icon next to date.
- ArticleRow: refactor into a row with cover thumbnail
  (40x60 with placeholder fallback) + author column +
  status + language + last-edit + actions menu (matches
  BookListView grid columns shape).

Estimated effort: ~45 min.

### Deferred clusters

- **Cluster D — i18n parity:** No new keys required
  beyond Clusters A-C. Folded into per-cluster commits.
- **Cluster E — filter / sort:** Articles could grow
  topic/language filters, but the books `useBookFilters`
  hook is genre-specific. Articles need their own shape;
  not in this session's scope.
- **Cluster F — mobile responsive:** Books dashboard has
  `hide-mobile` / `show-mobile-only` classes + hamburger
  menu. Articles needs the same retrofit. Out of scope
  for this session.

---

## Phase 2 plan

If user approves the cluster order above:

1. Cluster A commit (action-menu parity).
2. Cluster B commit (header chrome).
3. Cluster C commit (tile / row content).

Total estimated effort: ~2 h 15 min. Within session
budget.

If user prioritizes only the High items (H-2 + T-10 +
L-5 + L-6), Cluster A + the H-2 ThemeToggle slice from
Cluster B = ~45 min.

---

## Out-of-audit items flagged for backlog

- Mobile responsive parity for articles dashboard
  (Cluster F).
- Articles-specific filter / sort (Cluster E; topic +
  language + status filtering).
- Real backup/import flow for articles (separate feature
  decision; not a UX-parity item).

These belong in `docs/backlog.md` as separate entries if
the user wants them tracked, but they exceed UX-parity
scope.
