# Bibliogon UX Conventions

Last updated: 2026-04-27
Status: Living document — update when patterns evolve.
Audience: Bibliogon contributors, plugin authors, AI assistants
generating Bibliogon UI code.

This document is opinionated and prescriptive. Every section
takes a position and gives a Bibliogon-specific reason. When a
new feature surfaces a UX question this doc does not answer,
extend the doc in the same PR that resolves it — do not let
inconsistency accumulate.

For the architectural rules these conventions sit on top of see
`.claude/rules/architecture.md` (UI strategy, theming, state
management). For coding-level rules see
`.claude/rules/coding-standards.md`.

---

## 1. Core principles

Six principles. Everything else in this doc derives from them.

1. **Honest UI.** Never show interactive elements that lie about
   what they do. Disabled-with-reason or hidden, never
   "looks clickable but does nothing." A grayed-out button
   without a tooltip is a lie of omission.
2. **Action paths over walls.** When a feature isn't usable yet,
   surface what the user CAN do to make it usable. "No backups
   yet" is a wall; "No backups yet — [Create First Backup]" is
   a path.
3. **Author-perspective prioritization.** Bibliogon is for
   authors and self-publishers, not developers. UX trades off
   in favor of writing flow: fewer modals during drafting,
   shorter forms during creation, defer optional fields.
4. **Local-first transparency.** Users own their data. Show
   what Bibliogon stores, where, and what's pending sync. A
   user who cannot point at "where my book lives on disk" is
   one we have failed.
5. **Reversibility.** Destructive actions confirmable;
   preferred to be undoable. Trash with auto-purge over
   immediate-delete. Soft-delete + restore over hard-delete +
   sympathy.
6. **Predictable consistency.** Same action looks and behaves
   the same across surfaces (book editor, settings, plugins).
   A user who learns "click the trash icon to remove a chapter"
   should not have to re-learn it for cover assets.

When two principles conflict, the higher-numbered loses. (Honesty
beats consistency: an honest disabled state is better than a
fake-enabled one for parity with another surface.)

---

## 2. Buttons and Actions

### 2.1 Button states

**Enabled** — action is currently available. Default state.

**Disabled** — action is structurally available but currently
unsatisfiable. Use disabled when:

- The blocker is short-term and the user can clear it in this
  session (Save with no unsaved changes; Submit form with empty
  required fields).
- The action makes sense in this context but cannot fire right
  now (Push when no remote changes exist).
- A tooltip can clearly explain "why not now" in one short
  sentence.

**Hidden** — action is structurally unavailable in this context.
Use hidden when:

- Showing the button would teach the user nothing useful (Restore
  Backup when no backups exist).
- An alternative call-to-action is more relevant ("Create First
  Backup" instead of disabled "Restore").
- The action makes no sense without prerequisite state (Push
  when no remote is configured — show "Configure Remote" instead).

**Decision rule.** If the user can act in this session to unblock
the disabled button, prefer disabled. If they need to do
something else first to even make the button relevant, prefer
hidden + relevant CTA.

**Examples in current Bibliogon.**

| Surface | State | Why |
|---------|-------|-----|
| `Save chapter` button when content unchanged | Disabled | Short-term blocker; next keystroke unblocks. |
| `Restore` in backup list when list is empty | Hidden | No backups means no restore makes sense. CTA: "Create First Backup". |
| `Push to Remote` in GitSyncDialog when no remote configured | Hidden | Different action ("Configure Remote") is the relevant first step. |
| `Take Repo` button in GitSyncDiffDialog when row is unchanged | Hidden | Whole row is hidden; nothing to resolve. |

### 2.2 Tooltips on disabled buttons

Disabled buttons MUST have a tooltip explaining the blocker.
"Save (no changes to save)" not just grayed-out "Save."

The tooltip text answers exactly one question: why is this not
clickable right now? Not what the action would do if enabled.

```tsx
<button
  disabled={!hasUnsavedChanges}
  title={hasUnsavedChanges ? undefined : t("ui.editor.save_no_changes_tooltip", "Keine Änderungen zu speichern")}
>
  {t("ui.editor.save", "Speichern")}
</button>
```

Enabled buttons do NOT need tooltips for their primary action —
the label says it.

### 2.3 Destructive actions

Visual signal: red text or red icon on the button itself.
Confirmation dialog required for:

- Delete book / delete chapter / delete asset (even with trash
  fallback — the user expects the prompt).
- Overwrite on import (Section 7).
- Reset settings to defaults.
- Discard unsaved changes (e.g. closing a wizard mid-step).
- Push --force (in GitSyncDialog).

Confirmation dialog format covered in Section 7.

### 2.4 Async / loading state

Buttons that trigger async actions:

- Show spinner inside the button while pending (Lucide
  `Loader2` with the `className="spin"` rule).
- Disable the button during the action (prevents double-click
  → double-fire).
- Don't change the button's primary label mid-action — swap an
  icon, not the verb.
- Re-enable on completion (success or failure).

```tsx
<button onClick={handleCommit} disabled={committing}>
  {committing ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
  {t("ui.git_sync.commit_button", "Commit erstellen")}
</button>
```

Anti-pattern: a button that says "Saving..." while disabled. The
shape changes width, the verb stops being a verb, and the user
loses the visual anchor.

---

## 3. Empty States

When a list, panel, or container has no data, render an Empty
State Card. Never render bare `(empty)` or `[]`.

**Components of an Empty State Card.**

- Icon (Lucide). Contextual to the missing thing — folder for
  empty books list, cloud for missing backups, sparkles for
  missing AI config.
- One-line headline ("No backups yet").
- Optional sub-line explaining context ("Create one to enable
  history.").
- Primary CTA button if there's a relevant first action, with
  the icon repeated on the button.

**Bad pattern.**

```
[Empty]
```

**Good pattern.**

```
┌─────────────────────────────────┐
│  [icon]                         │
│                                 │
│  No backups yet                 │
│  Create one to enable history.  │
│                                 │
│  [Create First Backup]          │
└─────────────────────────────────┘
```

### 3.1 When NOT to show a CTA

- **The user cannot take action here.** A search result is empty
  → the action is "change your query," not a button. Headline
  + sub-line only.
- **The empty state is informational.** Read-only diagnostic
  panels (e.g. "No errors found in this chapter").
- **The CTA would duplicate the page's primary CTA.** Don't add
  a second "New Book" button below the page-header "New Book"
  button.

---

## 4. Loading States

### 4.1 Page-level loading

Skeleton placeholders matched to the eventual layout. Don't
show a spinner-in-the-middle; users see the shape of what's
coming and judge whether the wait is worth it.

Implementation: gray-block divs sized to match the real
content. Re-use the Tailwind-equivalent class via inline style
+ CSS variable `var(--bg-card)` so it works in all 6 themes.

### 4.2 Inline loading

Spinner within the affected element. The surrounding UI stays
interactive — the user can navigate to a different chapter
while the current one loads.

### 4.3 Long operations (> 3 seconds)

If an operation can take more than 3 seconds:

- **Show progress.** Percentage if known, indeterminate
  otherwise. Audiobook export is the canonical example: chapter
  N of M, plus an SSE-driven progress bar.
- **Allow cancel where possible.** Long imports, long exports,
  long git clones. The cancel button is a separate icon,
  explicitly testid-tagged.
- **Show what's happening.** "Cloning repository", "Importing
  chapter 3 of 10", "Generating EPUB". Not a generic
  "Loading...". The user is judging whether to walk away or
  watch.

### 4.4 Optimistic UI

For high-confidence operations (e.g. adding a tag, toggling a
checkbox in settings):

- Show the change immediately.
- Sync in background.
- Roll back on failure with clear toast: "Couldn't save: <reason>.
  Reverted."

For low-confidence operations (e.g. publishing, push to remote):

- Show pending state explicitly.
- Don't update local UI until the server confirms.
- Failure stays in-place; user sees the operation didn't go
  through and can retry.

Decision rule: if the operation can fail because of NETWORK,
treat as low-confidence. If it can only fail because of
LOGIC the client already knows, optimistic is fine.

---

## 5. Error States

### 5.1 Inline errors (form fields)

Field-level errors rendered next to the field. Red text below
the input, red icon if space allows, description in plain
language. Error message replaces the helper-text slot — don't
double-up.

Don't pop a dialog for form validation. Don't toast for form
validation either. The error belongs at the field.

### 5.2 Toast notifications

Toasts (via `react-toastify`, Bibliogon's `notify` helper) are
used for:

- Successful action confirmation, low-attention ("Commit
  erstellt").
- Non-blocking errors that don't require user action ("Save
  failed temporarily; retried").
- Background operation completion, when the user already moved
  on.

Toasts are NOT used for:

- Critical errors that need user decision — use Section 5.3
  dialog.
- Errors that block further work in this surface — use inline
  + dialog combined.
- Form validation — see Section 5.1.

Toast tier mapping (PGS-05 sets the precedent and the rest of
the app should match):

| Outcome | Tier | Style |
|---------|------|-------|
| Both subsystems succeed | success | green |
| Partial success | warning | amber |
| Hard failure / 503 | error | red |
| 409 nothing-to-commit | warning | amber |

### 5.3 Error dialogs

Used for:

- Operations that completely failed and need a user choice
  ("Retry", "Skip", "Cancel").
- Errors that destroyed unsaved work and need acknowledgement.
- Errors that need explanation longer than a toast can hold.

Format:

- **Title:** clear error category ("Import failed", not
  "ApiError(500)").
- **Body:** what happened + why, in plain language. Don't show
  a stack trace by default.
- **Optional:** "Show details" disclosure for technical info
  (stack trace, exception class, request ID). Enabled when
  `BIBLIOGON_DEBUG=true` automatically; collapsible on
  user request otherwise.
- **"Report Issue" button** if the user can't recover. Bibliogon
  already wires this through `ApiError.toGitHubIssueUrl(...)`;
  reuse it. Pre-populates a GitHub issue with stacktrace,
  browser, app version.
- **Recovery actions** if available, in priority order: Retry,
  Skip, Cancel. Default focus on the safest option.

### 5.4 Error message style

- Lead with what happened, not who's at fault.
- One sentence first; details below.
- Never show raw exception class names to the user. The
  developer-facing detail belongs behind "Show details" or in
  the GitHub issue body.
- Surface `ApiError.detail` verbatim — that's the backend's
  user-facing string. Don't re-translate it client-side.

---

## 6. Confirmations

Don't confirm everything. Confirmation fatigue erodes the
signal. Confirm only:

- **Destructive actions** (delete, overwrite, force-push).
- **Costly actions** (large network operation, paid API call —
  audiobook regeneration with ElevenLabs is the canonical
  example).
- **Irreversible actions** (publish to a hosting provider, push
  --force to a shared remote).

Don't confirm:

- "Save" (that's the user's intent — they clicked save).
- "Cancel" of a non-destructive action (the cancel itself is the
  recovery).
- Standard navigation (browser back, click another book).
- Toggling settings (toggle is its own confirmation).

### 6.1 Confirmation dialog text

- **Title:** imperative, names the action ("Delete chapter").
- **Body:** what + where + consequence ("This will permanently
  delete chapter 3. This cannot be undone."). For trashable
  items: "...will move to trash for 90 days, then auto-purge."
- **Affirmative button:** matches title verb, in red for
  destructive. ("Delete", not "OK".)
- **Negative button:** "Cancel" (default focus).
- **Escape closes via Cancel.** Click-outside closes via Cancel.
  The destructive action requires explicit click on the red
  button.

### 6.2 Special: Discard unsaved changes

When closing a wizard or modal mid-edit:

- Title: "Discard unsaved changes?"
- Body: list what will be lost in concrete terms ("You have
  changes in 2 chapters that haven't been saved.").
- Affirmative: "Discard" (red).
- Negative: "Keep editing" (default focus).

---

## 7. Forms and Inputs

### 7.1 Field validation

- **Validate on blur**, after the user finishes typing in a
  field. Don't validate on every keystroke — blocks the typing
  flow.
- **Validate on submit** for fields whose validity depends on
  other fields (e.g. ISBN format vs language).
- **Don't auto-submit on blur** for risky fields (publish, push,
  delete-by-id input).

### 7.2 Required fields

Bibliogon convention (set during the import wizard work,
documented here for the rest of the app):

- **Required fields are NOT visually marked with an asterisk.**
- The submit button is **disabled** when required fields are
  empty, with a tooltip explaining what's still missing.
- Currently in scope: title + author on book creation. Author
  may be deferred via the `Allow books without author` setting
  (false by default).

This is a deliberate choice for author flow: no asterisk noise
on a long form, the disabled button is the canonical "you're
not done yet" signal.

When other forms add required fields, follow this rule. Don't
mix with asterisk style on adjacent forms — the inconsistency
is worse than either choice.

### 7.3 Optional fields

- Don't visually mark optional fields either (per 7.2 — pick
  one approach).
- Default to collapsed groups for non-essentials in creation
  flows ("More details" → expandable section). The
  `CreateBookModal` step 1 vs step 2 split is the canonical
  precedent.

### 7.4 Placeholders

Placeholders show example or format, NOT instructions or
labels. The label is separate.

```tsx
// Bad - placeholder used as label
<input placeholder="Your name" />

// Good - explicit label, placeholder is example
<label htmlFor="author">{t("ui.metadata.author", "Autor")}</label>
<input id="author" placeholder="z.B. Jane Doe" />
```

### 7.5 Defaults

Pre-fill what the user is overwhelmingly likely to want.
Examples:

- New book language: same as last-created book (or app
  language).
- Series field: blank (not "no series" — blank).
- Audiobook engine: last-used engine.
- Export format: EPUB (most common for indie publishing).

Defaults are not commitments. The user should always be able
to change them and the change should persist for the next time.

---

## 8. Modal Dialogs

### 8.1 When to use a modal

- Multi-step process inappropriate for inline (import wizard,
  create-from-template).
- Critical decision blocking other work (409 conflict
  resolution).
- Detail view that doesn't warrant a new page (chapter version
  history, asset preview).

### 8.2 When NOT to use a modal

- **Simple confirmation** → use the smaller confirmation dialog
  pattern (Section 6).
- **Something the user might want to reference while working
  elsewhere** → use a side panel or a separate page. (TipTap
  side panels for AI review are this pattern.)
- **Brief feedback** → use a toast.
- **Long content the user might want to copy out of** → modals
  shouldn't trap selection across resize; a side panel does
  this better.

### 8.3 Modal behavior

- **Click outside:** closes if non-destructive; prompts if the
  user has unsaved data. Implementation:
  `onPointerDownOutside={(e) => unsaved && e.preventDefault()}`.
- **Escape key:** same as click-outside.
- **Focus management:**
  - On open: focus moves to the first interactive element (or
    a `data-autofocus` element if specified).
  - On close: focus returns to the trigger.
- **Stack:** avoid modal-on-modal. If unavoidable (e.g.
  confirmation dialog from inside a wizard), the top stays in
  focus and Escape unwinds one level at a time, not all
  levels.
- **Sticky footer:** action buttons stick to the bottom when
  body scrolls. v0.22.0 covered the wizard + 13 dialog modals;
  any new modal follows the same pattern.

---

## 9. Navigation and Information Architecture

### 9.1 Tabs

For panels with related but distinct content, prefer tabs over
one long form.

- Tab labels: short, action-oriented or category names. "Allgemein /
  Verlag / ISBN / Marketing" not "General Information / Publisher
  Information / ISBN Information / Marketing Information".
- Active tab visually distinct (background, underline, color).
- Tab order persists across reloads where it makes sense (e.g.
  metadata editor remembers last tab per book; settings doesn't,
  always opens to "Allgemein").

**User-decided convention:** the metadata editor uses tabs (7
tabs as of v0.23.0: Allgemein, Verlag, ISBN, Marketing, Design,
Audiobook, Qualität). Don't fold these back into one long form.

### 9.2 Breadcrumbs

Used in deep hierarchies. Each segment clickable, last segment
shown but not a link (current page).

Bibliogon doesn't have a deep hierarchy yet. The book editor is
2 levels (Book → Chapter) and uses sidebar-driven navigation,
not breadcrumbs. When a future feature lands more than 2 levels
deep, switch to breadcrumbs.

### 9.3 Back navigation

Browser back should always work. Never hijack history without a
strong reason. Multi-step wizards are an exception: the wizard
manages its own back/forward (via `wizardMachine` events), and
the browser back closes the modal.

---

## 10. Feedback and Status Indicators

### 10.1 Saved state

- **Unsaved:** asterisk in the title bar (`* My Book`), or a
  prominent indicator on the save button.
- **Saved:** brief feedback — toast ("Saved"), button text
  flash, or status-bar timestamp.
- **Saving:** spinner inside the save button + disabled state.

Auto-save (the editor uses it):

- Indicate auto-save status in a low-key area — footer, status
  bar. Not a toast (toast for every keystroke is noise).
- User should see "last saved 2s ago" without having to look
  hard.

### 10.2 Sync state (git)

For features that sync to a remote (git push/pull, plugin-git-sync):

- Show whether local matches remote at a glance. Sidebar
  `SyncBadge` is the canonical placement.
- Show diverged state clearly. A red dot on the sidebar button +
  warning state in the dialog.
- Don't auto-sync without user awareness. Manual push/pull buttons
  always; auto-pull only with an explicit setting + visible
  indicator.

### 10.3 Activity log

Long-running background operations (audiobook generation, exports,
git pushes) write to a per-book activity area. The user can come
back to see what happened while they were elsewhere.

---

## 11. Color and Severity

Color coding for status:

- **Red** (`var(--error, #b91c1c)`): errors, destructive actions,
  critical warnings.
- **Yellow / Amber** (`var(--warning, #b45309)`): cautions,
  warnings, attention required.
- **Green** (`var(--success, #16a34a)`): success, completed,
  healthy state.
- **Blue / Accent** (`var(--accent)`): primary information,
  primary actions, links.
- **Gray** (`var(--text-muted)`): disabled, inactive, secondary.

**Never use color alone for meaning.** Always pair color with
icon or text. A red dot is invisible to colorblind users and
inaudible to screen readers.

```tsx
// Bad
<span style={{ color: "red" }}>{count}</span>

// Good
<span style={{ color: "var(--error)" }}>
  <AlertCircle size={12} aria-hidden /> {count}
</span>
```

Themes: all 6 variants must work for any new component.
`global.css` defines the CSS variables; never hardcode hex
values inline.

---

## 12. Accessibility Baseline

WCAG 2.1 AA is the floor (PS-05 audit pinned this).

- **Keyboard navigation works for every interactive element.**
  Tab order matches visual order. No `tabindex > 0`.
- **Focus visible.** Don't `outline: none` without a replacement
  focus style.
- **ARIA labels** for icon-only buttons. `aria-label="Close"`
  on the X button. The label is i18n-keyed.
- **Color contrast** meets WCAG AA minimum (4.5:1 for normal
  text, 3:1 for large text or non-text indicators).
- **Forms work without JavaScript** for basic operations where
  reasonable. Submit-via-Enter, submit-via-button both work.
- **Screen reader state changes** via live regions
  (`aria-live="polite"` for low-priority,
  `aria-live="assertive"` for errors).

The `radix-ui` primitives bake most of this in. Custom components
must match the bar.

---

## 13. Bibliogon-Specific Patterns

### 13.1 Themes and dark mode

Bibliogon ships 6 theme variants (Warm Literary / Cool Modern /
Nord, each in light + dark). All UI must work in all of them.
New components: tested in all 6 themes before merge.

How to test fast: theme picker in Settings. Click through all 6
once for each new component before opening the PR.

### 13.2 i18n

Every user-facing string goes through translation. 8 languages:
DE, EN, ES, FR, EL, PT, TR, JA.

Convention:

- New strings get keyed in DE first (DE is the source of truth
  for tone), then propagated to the other 7 with sensible
  translations or English fallback.
- Component code passes `t("ui.namespace.key", "Default fallback")`
  with the fallback in the developer's most natural language
  (typically DE in Bibliogon, EN when written by an external
  contributor).
- Keys are dotted, scoped: `ui.git_sync.commit_button`. New
  scopes are namespace-only — match existing keys.

Plugins follow the same i18n keying. Plugin-shipped strings live
in the plugin's own YAML; i18n loader merges them in.

### 13.3 Plugin UI

Plugins extend Bibliogon UI in three ways (see the plugin
developer guide for the slot list):

- Settings panels.
- Book metadata editor sections.
- Wizard steps.

Plugins MUST follow these UX conventions. The plugin developer
guide (`docs/help/{de,en}/developers/plugins.md`) references this
document as authoritative on UX behaviour.

### 13.4 Editor flow

The TipTap editor is Bibliogon's central surface. UX trade-offs
favor uninterrupted writing:

- Modals stay out of the editor unless the user explicitly
  triggers one.
- Auto-save runs in the background; the user shouldn't have to
  think about it.
- Quality-tab findings + AI review surface as side-panel
  navigations, not as in-line interruptions.
- The 409 conflict dialog is the exception — it's the rare
  case where blocking is correct (data safety beats writing
  flow).

---

## 14. Anti-patterns

Things to avoid. If you find one in the codebase, the fix is in
scope for the next PR that touches that surface.

- **Modal-on-modal stacks** more than 2 deep. The user gets
  lost.
- **Tooltips on enabled actions** explaining what they do.
  The label says it.
- **Confirmation dialogs for non-destructive actions.** "Are
  you sure you want to save?" is patronising.
- **Auto-submit on field blur for risky fields.** The user
  expects to review before submitting.
- **Indefinite spinners** without context. "Loading..." for >
  1 second without a label is a wall.
- **Hidden interactive elements** that the user can't
  discover. Hover-to-reveal must have a discoverability
  fallback (kebab menu, settings).
- **Custom scrollbars** that break expected behavior. The OS
  scrollbar is the contract.
- **Disabled buttons without tooltips.** Section 2.2.
- **Empty states with just "No data".** Section 3.
- **Color-only meaning conveyors.** Section 11.
- **Translated strings hardcoded in component source.** Always
  i18n-keyed.
- **`window.alert / confirm / prompt`** for any user-facing
  flow. Bibliogon uses Radix dialogs + react-toastify
  exclusively.

---

## 15. Application checklist

For any new UI work, run this checklist before opening the PR:

- [ ] Disabled vs hidden choice was deliberate (Section 2.1).
- [ ] Disabled buttons have tooltips (Section 2.2).
- [ ] Empty states have CTA where appropriate (Section 3).
- [ ] Errors are inline (form) or dialog (action), not toast,
      for blocking cases (Section 5).
- [ ] Destructive actions have confirmation dialogs (Section 6).
- [ ] Loading states are informative (Section 4).
- [ ] Tested in all 6 themes (Section 13.1).
- [ ] Keyboard navigation works for every interactive element
      (Section 12).
- [ ] All strings i18n-keyed in 8 languages (Section 13.2).
- [ ] No color-only meaning (Section 11).
- [ ] Modal closes via Escape and click-outside; sticky footer
      if scrollable (Section 8.3).

---

## 16. Open items

Conventions to define later. Flag, don't decide:

- **Mobile-specific patterns.** Bibliogon is desktop-first today.
  Mobile responsive behaviour (TipTap on touch devices, sidebar
  collapse, asset upload) needs its own pass before "mobile" is
  a supported audience.
- **Onboarding flow patterns.** First-run wizard exists (PS-02);
  conventions around tour overlays, tooltips, "what's new"
  banners are not codified.
- **In-app help guidance.** Help panel + slug deep-linking
  exists; conventions around where to surface a `<HelpLink/>`
  vs an inline tooltip vs a longer help page are not codified.
- **Drag-and-drop conventions.** Chapter sidebar uses @dnd-kit;
  asset upload uses native drop targets. A common pattern for
  drop indicators, drag previews, and accessibility fallback
  for keyboard users isn't written down.
- **Plugin-supplied component conventions.** Plugin-shipped Web
  Components must match these conventions but the contract for
  enforcing it (lint rule? style tokens? runtime check?) is open.

When one of these blocks a PR, resolve it in this doc first,
then implement.

---

## 17. Living-document protocol

This file is intended to evolve. When a new feature surfaces a
UX question this doc does not answer:

1. Take a position in the PR that introduces the question.
2. Update this doc in the same PR or in an immediate follow-up.
3. Cite the section in the PR description.
4. If the position contradicts an existing section, update both
   the section and add an explicit changelog line at the bottom
   of this file noting the reversal + the date.

The doc loses its value the moment it falls out of sync with
shipped Bibliogon. Re-read on every release; flag drift.

---

## Changelog

- **2026-04-27** — Initial version. 17 sections covering buttons,
  empty states, loading, errors, confirmations, forms, modals,
  navigation, feedback, color, accessibility, Bibliogon-specific
  patterns, anti-patterns, checklist, open items, and the
  living-document protocol.
