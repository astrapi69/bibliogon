# UX Convention Document for Bibliogon

## Context

Bibliogon has grown organically. UI patterns have emerged
inconsistently: some buttons disabled when unavailable, some
hidden, some left visible-but-broken. Empty states sometimes
show "No data" plain text, sometimes show a Call-to-Action,
sometimes nothing at all. Error handling varies between
components.

User wants a single source of truth: UX conventions that
- guide future UI work
- can be referenced in code reviews
- inform plugin authors
- become a Claude Code reference for UI prompts

This session: write the convention document. No code changes.
Implementation against the conventions happens in follow-up
sessions.

---

## Scope

Single commit:
`docs/ux-conventions.md`

Target: 60-90 minutes. ~400-600 lines.

Document is opinionated, prescriptive, and includes Bibliogon-
specific examples. Not a generic UX guide.

---

## Document structure

### Section 1: Header

```markdown
# Bibliogon UX Conventions

Last updated: <today>
Status: Living document — update when patterns evolve.
Audience: Bibliogon contributors, plugin authors, AI assistants
          generating Bibliogon UI code.
```

### Section 2: Core principles (the Why)

State 4-6 principles that everything else derives from.
Examples to refine:

- **Honest UI:** never show interactive elements that lie about
  what they do. Disabled-with-reason or hidden, never "looks
  clickable but does nothing."
- **Action paths over walls:** when a feature isn't usable
  yet, surface what the user CAN do to make it usable, not
  just the absence.
- **Author-perspective prioritization:** Bibliogon is for
  authors and self-publishers, not developers. UX trades off
  in favor of writing flow.
- **Local-first transparency:** users own their data. Show what
  Bibliogon stores, where, and what's pending sync.
- **Reversibility:** destructive actions confirmable; preferred
  to be undoable.
- **Predictable consistency:** same action looks and behaves
  the same across surfaces (book editor, settings, plugins).

### Section 3: Buttons and Actions

#### 3.1 Button states

When to use each:

**Enabled:** action is currently available.

**Disabled:** action is structurally available, currently not
satisfiable. Examples:
- "Save" with no unsaved changes
- "Submit form" with required fields empty

Use disabled when:
- The user just learned the feature exists
- The blocker is short-term (next interaction unblocks)
- A tooltip can clearly explain "why not now"

**Hidden:** action is structurally unavailable in this
context. Examples:
- "Restore Backup" when no backups exist
- "Push to Remote" when no remote is configured
- "Delete Cover" when no cover is set

Use hidden when:
- Showing the button would teach the user nothing useful
- An alternative call-to-action is more relevant
  (e.g., "Create First Backup" instead of disabled "Restore")
- The action makes no sense without prerequisite state

**Decision rule:** if the user can act in this session to
unblock the disabled button, prefer disabled. If they need to
do something else first, prefer hidden + relevant CTA.

#### 3.2 Tooltips on disabled buttons

Disabled buttons MUST have a tooltip explaining the blocker.
"Save (no changes to save)" not just grayed-out "Save."

#### 3.3 Destructive actions

Red color on the button itself (or icon). Confirmation dialog
required for:
- Delete book / delete chapter / delete asset
- Overwrite on import
- Reset settings
- Discard unsaved changes
- Push --force

Confirmation dialog format:
- Title: clear action name
- Body: explicit consequence
- Two buttons: "Cancel" (secondary) and "<Action>" (red)
- Default focus: Cancel
- Escape closes; default closes via Cancel

#### 3.4 Loading state

Buttons that trigger async actions:
- Show spinner inside the button while pending
- Disable the button during action (prevents double-click)
- Don't change button text mid-action

### Section 4: Empty States

When a list, panel, or container has no data:

**Pattern:** Empty State Card

Components:
- Illustration or icon (not required, but can help)
- One-line headline ("No backups yet")
- Optional sub-line explaining context
- Primary CTA button if there's a relevant first action

Bad pattern:
```
[Empty]
```

Good pattern:
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

#### 4.1 When NOT to show CTA in empty state

- The user can't take action here (e.g., a search result is
  empty — the action is "change your query," not a button)
- The empty state is informational and adding CTA would be
  noise

### Section 5: Loading States

#### 5.1 Page-level loading

Skeleton placeholders match the eventual layout. Don't show
spinner-in-the-middle; users see the shape of what's coming.

#### 5.2 Inline loading

Spinner within the affected element. Surrounding UI stays
interactive.

#### 5.3 Long operations

If an operation takes > 3 seconds:
- Show progress (percentage if known, indeterminate
  otherwise)
- Allow cancel where possible
- Show what's happening ("Cloning repository", "Importing
  chapter 3 of 10")

#### 5.4 Optimistic UI

For high-confidence operations (e.g., adding a tag):
- Show the change immediately
- Sync in background
- Roll back on failure with clear message

For low-confidence operations (e.g., publishing to KDP):
- Show pending state
- Don't update UI until confirmed

### Section 6: Error States

#### 6.1 Inline errors

Field-level errors next to the field. Red color, error icon,
description. Don't pop a dialog for form validation.

#### 6.2 Toast notifications

Used for:
- Successful action confirmation (low-attention)
- Non-blocking errors that don't require user action
- Background operation completion

NOT used for:
- Critical errors that need user decision
- Errors that block further work

#### 6.3 Error dialogs

Used for:
- Operations that completely failed and need user choice
- Errors that destroy unsaved work
- Errors that need explanation longer than a toast

Format:
- Title: clear error category ("Import failed")
- Body: what happened + why (not technical stack trace by
  default)
- Optional: "Show details" disclosure for technical info
- "Report Issue" button if user can't recover (already
  exists in Bibliogon — keep)
- Recovery actions if available ("Retry", "Skip", "Cancel")

### Section 7: Confirmations

Don't confirm everything. Only:
- Destructive actions (delete, overwrite)
- Costly actions (large network operation, expensive API call)
- Irreversible actions (publish, push --force)

Don't confirm:
- "Save" (that's the user's intent)
- "Cancel" of a non-destructive action
- Standard navigation

#### 7.1 Confirmation dialog text

- Title: imperative, names action ("Delete chapter")
- Body: what, where, consequence ("This will permanently
  delete chapter 3. This cannot be undone.")
- Affirmative button: matches title verb in red
- Negative button: "Cancel" (default focus)

### Section 8: Forms and Inputs

#### 8.1 Field validation

- Validate on blur (after user finishes typing)
- Don't validate on every keystroke (annoying for typing
  flow)
- Submit-time validation for fields that interact

#### 8.2 Required fields

Mark with asterisk OR by NOT showing optional indicator on
others. Pick one approach, stick with it.

User decided (recent: import wizard): Title + Author are
required, others optional. Convention: required fields are
mandatory but not visually marked with asterisk; the import/
save button is disabled with tooltip when required fields
are empty.

This is a Bibliogon-specific choice; document it.

#### 8.3 Placeholders

Placeholders show example or format, NOT instructions or
labels. The label is separate.

Bad: `<input placeholder="Your name">`
Good: `<input aria-label="Author name" placeholder="e.g. Jane Doe">`

### Section 9: Modal Dialogs

#### 9.1 When to use modal

- Multi-step process inappropriate for inline (e.g., import
  wizard)
- Critical decision blocking other work
- Detail view that doesn't warrant new page

#### 9.2 When NOT to use modal

- Simple confirmation (use confirmation dialog, smaller)
- Something the user might want to reference while working
  elsewhere (use side panel or new tab)
- Brief feedback (use toast)

#### 9.3 Modal behavior

- Click outside: closes if non-destructive, prompts if user
  has unsaved data
- Escape key: same as click-outside
- Focus management: focus moves to first interactive element
  on open, returns to trigger on close
- Stack: avoid modal-on-modal; if unavoidable, top stays in
  focus

### Section 10: Navigation and Information Architecture

#### 10.1 Tabs

For panels with related but distinct content:
- Tab labels: short, action-oriented or category names
- Active tab visually distinct
- Tab order persists across reloads (where it makes sense)

User specified preference for the metadata editor: tabs over
single long form. Document this.

#### 10.2 Breadcrumbs

Used in deep hierarchies (book > chapter > scene). Each
segment clickable, last segment current and not a link.

#### 10.3 Back navigation

Browser back should always work. Don't hijack history without
strong reason.

### Section 11: Feedback and Status Indicators

#### 11.1 Saved state

- Unsaved: visual indicator on the save button or in the
  title bar (e.g., asterisk in title)
- Saved: brief feedback ("Saved" toast or button text flash)
- Saving: spinner or "Saving..." text

Auto-save:
- If implemented, indicate auto-save status in a low-key
  area (footer, status bar)
- User should be able to see when last saved

#### 11.2 Sync state (git)

For features that sync to remote (git push/pull):
- Show whether local matches remote
- Show diverged state clearly
- Don't auto-sync without user awareness

### Section 12: Color and Severity

Color coding for status:

- Red: errors, destructive actions, critical warnings
- Yellow/Amber: cautions, warnings, attention required
- Green: success, completed, healthy state
- Blue: information, actions, links
- Gray: disabled, inactive, secondary

Don't use color alone for meaning. Always pair with icon or
text (accessibility).

### Section 13: Accessibility Baseline

- Keyboard navigation works for all interactive elements
- Focus visible (don't `outline: none` without replacement)
- ARIA labels for icon-only buttons
- Color contrast meets WCAG AA minimum
- Forms work without JavaScript for basic operations
- Screen reader announces state changes (via live regions)

### Section 14: Bibliogon-Specific Patterns

#### 14.1 Themes and dark mode

Bibliogon has 6 theme variants. All UI must work in all of
them. New components: tested in all themes before merge.

#### 14.2 i18n

Every user-facing string goes through translation. 8
languages. New strings get machine-translated initially,
reviewed by natives over time.

#### 14.3 Plugin UI

Plugins extend Bibliogon UI in three ways:
- Settings panels
- Book metadata editor sections
- Wizard steps

Plugins must follow these UX conventions. Plugin author
documentation should reference this document.

### Section 15: Anti-patterns

Things to avoid:

- Modal-on-modal stacks
- Tooltips on enabled actions (only on disabled)
- Confirmation dialogs for non-destructive actions
- Auto-submit on field blur for risky fields
- Indefinite spinners (always provide context)
- Hidden interactive elements that the user can't discover
- Custom scrollbars that break expected behavior
- Disabled buttons without tooltips
- Empty states with just "No data"
- Color-only meaning conveyors

### Section 16: Application checklist

For any new UI work, check:

- [ ] Disabled vs hidden choice deliberate
- [ ] Empty state has CTA where appropriate
- [ ] Errors are inline (form) or dialog (action) not toast
- [ ] Destructive actions confirmed
- [ ] Loading states informative
- [ ] All themes tested
- [ ] Keyboard navigation works
- [ ] All strings i18n-keyed
- [ ] No color-only meaning

### Section 17: Open items

Conventions to define later (flag don't decide):

- Mobile-specific patterns (Bibliogon is desktop-first today)
- Onboarding flow patterns
- In-app help/tooltips guidance
- Drag-and-drop conventions

---

## Out of scope

- Code changes
- ROADMAP additions
- Refactoring existing UI to match conventions
- Plugin author documentation update
- New illustrations or visual examples (text only)

---

## Stop conditions

- Existing UX guidance already exists in another doc — STOP,
  consolidate or extend
- Document drifts past 800 lines — trim or split
- Convention contradicts a recent intentional Bibliogon
  decision (e.g., multi-tab metadata editor) — flag and
  resolve before committing

---

## Closing checklist

- [ ] All 17 sections present
- [ ] Bibliogon-specific examples used (not generic)
- [ ] User's recent decisions reflected (mandatory fields,
  tabs, etc.)
- [ ] Anti-patterns explicit
- [ ] Application checklist actionable
- [ ] Single commit
- [ ] No code changes
- [ ] `make test` untouched

Report:
- Document length (lines)
- Major decisions documented
- Sections that needed Bibliogon-specific clarification (vs
  generic patterns)
- Commit hash
