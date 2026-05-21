# Trash-Card Permanent-Delete Re-Check (Phase 1)

Datum: 2026-04-30. Status: Re-diagnosis only, no code changes.

User reported the previous fix had no effect. This document
reproduces the cause from a clean slate.

---

## 1. Verify the previous "fix" was actually applied

```
$ git log --oneline -- frontend/src/pages/ArticleList.tsx | head -5
4f5e545 fix(articles-trash): header parity sweep — match books-trash chrome
e7266da fix(articles-trash): add ChevronLeft back-button matching books-trash
e1280a2 fix(articles-trash): TrashPanel respects viewMode (grid + list)
128ea16 fix(articles-dashboard): refresh on bfcache restore + visibility change
f9d127d fix(articles-dashboard): backup + import buttons + ViewToggle reposition (round 2)
```

```
$ git log --oneline -10
ebb90a8 docs(explorations): trash-card action-button parity audit (Phase 1)
4f5e545 fix(articles-trash): header parity sweep — match books-trash chrome
...
```

**The previous Phase 2 was never committed.** Commit `ebb90a8`
shipped only the audit document `docs/explorations/trash-card-parity-audit.md`.
No source change to `ArticleList.tsx` followed the audit. The
audit explicitly ended with "STOP. Wait for Go" and the
implementation never executed.

This is the actual root cause of the user-visible regression.
The fix the user verified as still broken is a fix that was
never made, not a fix that failed.

---

## 2. Current state of `layout.trashCard` (literal CSS)

[ArticleList.tsx:1313-1322](../../frontend/src/pages/ArticleList.tsx#L1313):

```ts
trashCard: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 16,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    height: "100%",
},
```

Same as the state described in the prior audit. No `flexWrap`,
no `justifyContent: "space-between"`. Buttons clip in narrow grid
columns exactly as documented.

## 3. Books-Trash-Card equivalent (literal CSS)

[Dashboard.tsx:593-598](../../frontend/src/pages/Dashboard.tsx#L593):

```ts
trashCard: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 12, padding: 16, background: "var(--bg-card)",
    border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
},
```

Has `flexWrap: "wrap"` and `justifyContent: "space-between"`.
Books wraps the action buttons under the title block when the card
is narrow. Articles does not.

## 4. CSS diff (Books → Articles)

```diff
 trashCard: {
-    display: "flex", alignItems: "center", justifyContent: "space-between",
-    flexWrap: "wrap" as const,
+    display: "flex",
     gap: 12,
+    alignItems: "flex-start",
     padding: 16,
     background: "var(--bg-card)",
     border: "1px solid var(--border)",
-    borderRadius: "var(--radius-md)",
+    borderRadius: 6,
+    height: "100%",
 },
```

Three layout deltas remain:
1. **Missing `flexWrap: "wrap"`** — primary cause of the clipped button.
2. Missing `justifyContent: "space-between"` — buttons cannot push to the right edge.
3. Cosmetic: `borderRadius` value vs `var(--radius-md)` token.

## 5. Second-clipping-cause check

- Single `TrashArticleCard` component, defined once at [ArticleList.tsx:765](../../frontend/src/pages/ArticleList.tsx#L765), used once at [ArticleList.tsx:704](../../frontend/src/pages/ArticleList.tsx#L704). No duplicate component to misedit.
- No `overflow: hidden` on the parent grid ([layout.grid:1302](../../frontend/src/pages/ArticleList.tsx#L1302)). Card content can overflow visually.
- Both buttons render unconditionally in JSX ([ArticleList.tsx:807-826](../../frontend/src/pages/ArticleList.tsx#L807)); no conditional gates them.
- No `display: none`, no `sr-only`, no `aria-hidden`.
- Card has `height: "100%"` (vertical, not horizontal). Not the cause.

The clipping is purely a flex-axis overflow caused by the missing
`flexWrap: "wrap"` on the card itself. The button is in the DOM
but pushed outside the card's painted box because:

1. Card is in a grid cell of width `~220px` (auto-fill minmax).
2. Card has `display: flex` with NO wrap; left content (`flex: 1`)
   plus right button group (`flexShrink: 0`) compete on the same row.
3. With two German labels (`Wiederherstellen` ≈ 145px, `Endgültig
   löschen` ≈ 145px) the right group is `~290px + gap`. Card width
   minus padding is `220 - 32 = 188px`. The right group overflows
   horizontally.
4. Without `overflow: hidden` on the card, the second button paints
   outside the card visually but is positioned past the card's
   right edge — visually obscured by the next grid cell or off-screen
   when the grid is at its right edge.

User perceives the second button as "missing".

## 6. Build / cache check

```
$ ls -la frontend/dist/
total 84
drwxrwxr-x 4 astrapi69 astrapi69  4096 Apr 25 13:55 .
...
```

`frontend/dist/` is from 25 April. Aster's `make dev` runs Vite in
dev mode (no `dist/` involved); the dev server reads source files
live. Stale `dist/` is not the cause when running `make dev`. If
Aster is testing against a built / Docker'd app instead, that would
matter, but the user did not indicate that.

## 7. Real root cause + fix plan

**Root cause**: the Phase 2 implementation was never committed.
The audit doc was committed and the conversation paused at "STOP.
Wait for Go". The user's "fix didn't work" actually means "fix
was never made".

**Fix plan**: do exactly what the prior audit (commit ebb90a8,
section 7, atomic commit 1) prescribed. One file change:

```ts
// frontend/src/pages/ArticleList.tsx layout.trashCard
trashCard: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 12, padding: 16,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    height: "100%",
},
```

Plus the visibility-asserting Vitest the prompt requires (DOM
presence is not sufficient — the previous test only checked
`getByTestId(article-trash-permanent-{id})` which always passed
because the button was always in the DOM).

For the visibility check, jsdom does not compute layout, so a
true `getBoundingClientRect()` test is unreliable. Use a structural
proxy: assert the card's computed style includes `flex-wrap: wrap`
or assert the button's parent element has the wrap style. Document
the limitation in a comment.

## 8. Manual smoke after Phase 2

1. `make dev`, hard-reload the browser at `/articles`.
2. Soft-delete an article, open trash, click view-toggle to grid.
3. With browser at 1280px width, narrow the window to <600px so a
   single grid column is ≤ 220px. Confirm both buttons render
   inside the card boundary; the danger button wraps below the
   title block.
4. Repeat at `/`, books trash, no regression.

## 9. Recommendation

Ship the one-file fix immediately (no scope creep into row styling
or books deleted_at meta — those were optional and the user is
blocked on the cards). Add the Vitest. One commit, narrow blast
radius.

## 10. STOP

Phase 1 done. Wait for Go.
