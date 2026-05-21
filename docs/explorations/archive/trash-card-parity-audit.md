# Trash-Card Action-Button Parity Audit (Phase 1)

Datum: 2026-04-30. Status: Audit only, no code changes.

Aster reported: Articles-Trash card view appears to be missing the
Permanent-Delete button. Books-Trash card view has it. Yesterday's
header-chrome sweep did not cover card-level action surfaces.

This audit checks the claim, traces the cause, and inventories any
other asymmetries between trash cards and trash rows on both sides.

---

## 1. Component file map

Trash uses inline / locally-defined components on both sides — no
dedicated shared `TrashCard`. Live cards (`BookCard`, `ArticleCard`)
are NOT reused for trash because the live cards click-to-edit and
expose a dropdown menu that's not appropriate when the row is
already in the trash.

| Side | Card | Row | File |
|------|------|-----|------|
| Books | inline JSX block at [Dashboard.tsx:301-330](../../frontend/src/pages/Dashboard.tsx#L301) | inline JSX at [Dashboard.tsx:335-358](../../frontend/src/pages/Dashboard.tsx#L335) | [Dashboard.tsx](../../frontend/src/pages/Dashboard.tsx) |
| Articles | `TrashArticleCard` local component at [ArticleList.tsx:765](../../frontend/src/pages/ArticleList.tsx#L765) | inline `<li>` at [ArticleList.tsx:711-754](../../frontend/src/pages/ArticleList.tsx#L711) | [ArticleList.tsx](../../frontend/src/pages/ArticleList.tsx) |

---

## 2. Action surface — trash CARDS

| Action | Books-Trash-Card | Articles-Trash-Card |
|--------|------------------|---------------------|
| Restore | yes — `btn btn-primary btn-sm`, RotateCcw icon, testid `trash-restore-{id}` | yes — `btn btn-primary btn-sm`, RotateCcw icon, testid `article-trash-restore-{id}` |
| Permanent-Delete | yes — `btn btn-danger btn-sm`, Trash icon, testid `trash-delete-permanent-{id}` | **rendered in JSX but visually clipped** — `btn btn-danger btn-sm`, Trash2 icon, testid `article-trash-permanent-{id}` |
| DropdownMenu | no | no |
| Open / Preview | no | no |
| Click-card-to-edit | no (deliberate; same pattern in articles) | no (commented at [ArticleList.tsx:760-764](../../frontend/src/pages/ArticleList.tsx#L760)) |

So **both cards have both buttons in JSX**. The user-reported bug is real but the root cause is layout, not a missing element.

---

## 3. Action surface — trash ROWS (sanity check)

| Action | Books-Trash-Row | Articles-Trash-Row |
|--------|-----------------|---------------------|
| Restore | yes — same shape as card | yes — `btn btn-sm btn-ghost`, RotateCcw, testid `article-trash-restore-{id}` |
| Permanent-Delete | yes — `btn btn-danger btn-sm` Trash | yes — `btn btn-sm btn-ghost`, Trash2, danger color via inline style, testid `article-trash-permanent-{id}` |

**Row asymmetry found**:
- Books rows use `btn-primary` (restore) and `btn-danger` (permanent).
- Articles rows use `btn-ghost` for both, with `color: var(--danger)` inline for permanent.

Visual weight differs even though both rows are functional. The buttons all click and do the right thing; this is purely a styling-parity gap.

---

## 4. Root cause for the user-reported symptom

Both buttons are in the JSX and click correctly. The Permanent-Delete button is **not rendering off-screen entirely** — it is visible if you scroll horizontally inside the card, or if the grid column width is wide enough. The user perceives it as missing because at the default `repeat(auto-fill, minmax(220px, 1fr))` grid spec, two side-by-side buttons with German labels overflow the card horizontally and clip outside the card boundary.

**File + line**: [ArticleList.tsx:1281-1290](../../frontend/src/pages/ArticleList.tsx#L1281) — `layout.trashCard`:

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

Compare with [Dashboard.tsx:593-598](../../frontend/src/pages/Dashboard.tsx#L593) — `styles.trashCard`:

```ts
trashCard: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap" as const,
    gap: 12, padding: 16, background: "var(--bg-card)",
    border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
},
```

Three differences responsible for the "missing button" perception:

1. **`flexWrap: "wrap"` is missing on articles**. Books wraps the action buttons under the title block when the card is narrow. Articles keeps both buttons on the same axis as the title and pushes them off-screen horizontally.
2. `alignItems: "center"` vs `alignItems: "flex-start"` (cosmetic).
3. `justifyContent: "space-between"` is missing on articles, so when the card IS wide enough, the buttons do not sit at the right edge.

**Diagnosis**: button JSX correct, layout misconfigured. Fix is one CSS property (`flexWrap: "wrap"`) plus optional alignment matching.

---

## 5. Other asymmetries found

### 5a. Card outer chrome
- Books `borderRadius: var(--radius-md)`, articles `borderRadius: 6`. Books uses CSS variable; articles hardcodes a value. Aligning to var keeps theme-token consistency.

### 5b. Title-block markup
- Books: `<strong>{title}</strong> <p>{author}</p>` (no `display: block` on strong, both inline-block).
- Articles: `<strong style={{ display: "block" }}>` + author + `<p>{deleted_at}</p>` extra meta line.

Articles shows the trashed-at timestamp on the card; books does not. **Articles has the richer card content here**. This is an asymmetry but in articles' favor — information is useful. Recommendation: bring the same `deleted_at` meta to the books card too (or leave both as-is for minimal churn).

### 5c. Button-row container
- Books: container has `flexShrink: 0`, no further alignment hints; relies on outer wrap.
- Articles: container has `flexShrink: 0` too, but inside a card that does not wrap.

### 5d. Row button styling
- Documented in section 3.

---

## 6. i18n key reuse

No new keys needed for any fix below. Reuse existing keys:

| Action | Key | Used by |
|--------|-----|---------|
| Restore | `ui.dashboard.restore_book` (books), `ui.articles.restore` (articles) | Both already wired |
| Permanent-Delete | `ui.dashboard.delete_permanent` (books), `ui.articles.delete_permanent` (articles) | Both already wired |

8-language parity: not affected — no new strings.

---

## 7. Phase 2 plan

### Atomic Commit 1 — Articles-Trash-Card layout fix

Fix `layout.trashCard` in [ArticleList.tsx](../../frontend/src/pages/ArticleList.tsx#L1281) to wrap buttons when the grid column is narrow. Match books exactly:

```diff
 trashCard: {
-    display: "flex",
+    display: "flex", alignItems: "center", justifyContent: "space-between",
+    flexWrap: "wrap" as const,
     gap: 12,
-    alignItems: "flex-start",
     padding: 16,
     background: "var(--bg-card)",
     border: "1px solid var(--border)",
-    borderRadius: 6,
+    borderRadius: "var(--radius-md)",
     height: "100%",
 },
```

After this, the Permanent-Delete button always renders inside the
card boundary regardless of column width.

Vitest update:
- existing `trash view respects viewMode toggle` test already asserts `article-trash-card-{id}` exists. Extend it to also assert `article-trash-permanent-{id}` is present and clickable in card view.

### Atomic Commit 2 — Articles-Trash-Row button styling parity

Bring articles row-buttons to books visual weight: `btn-primary` for restore, `btn-danger` for permanent (drop the inline `color: var(--danger)` workaround once `btn-danger` provides the same color).

Files: [ArticleList.tsx:733-754](../../frontend/src/pages/ArticleList.tsx#L733)

Vitest: existing tests still cover the testids; visual-weight parity is checked manually.

### Atomic Commit 3 — Books-Trash-Card add `deleted_at` meta line (optional)

Mirror articles' richer trash card by adding the deletion-timestamp line below the author. New i18n key `ui.dashboard.trashed_at` mirroring `ui.articles.trashed_at`. 8 langs.

Defer if Aster wants minimal scope. **Recommendation**: ship commits 1+2, treat commit 3 as separate prompt.

### Tests

- Frontend Vitest:
  - Articles-Trash-Card renders Permanent-Delete and click fires handler.
  - Articles-Trash-Row click on permanent fires handler.
- Manual smoke (already in commit messages):
  1. /articles, soft-delete article.
  2. Open trash, switch to card-view (ViewToggle grid).
  3. Verify Permanent-Delete button visible inside card on a narrow column.
  4. Click, confirm restore + permanent flow works.
  5. Repeat at /, books-trash, no regression.

---

## 8. Stop conditions

Phase 1 done. No code touched. Wait for Go.

## 9. Recommendation

Ship commit 1 (the actual user-visible fix) immediately after Go. Commit 2 (row styling) is small enough to fold into the same Phase 2 if Aster wants. Commit 3 (timestamp on books card) is a polish item; skip unless Aster opts in.
