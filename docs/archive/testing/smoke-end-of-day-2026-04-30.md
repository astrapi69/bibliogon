# End-of-Day Smoke Verification — 2026-04-30

Aster walks through the four flows below to verify today's
shipments. No thinking required, just commands + click paths.

Today's commit window covered:
- Secrets refactor (3 commits): three-layer config + Settings UI gating + docs
- Donation visibility diagnosis + DONATE.md rebrand
- Trash-card permanent-delete bug fix
- Articles-backup pipeline (commit ed2e3ec from earlier session)

Total runtime budget for tonight's verification: ~30 min for
flows A+B+C. Flow D is optional.

---

## Flow A — API key migration (secrets refactor)

Verifies: T-XX three-layer config (commits 294e8fa, ad4301a, f2bf783).

### Steps

1. Rotate Anthropic API key:
   - Open https://console.anthropic.com
   - Revoke the currently exposed key (the one in `backend/config/app.yaml`)
   - Generate a new key, copy to clipboard

2. Create user override file:
   ```bash
   mkdir -p ~/.config/bibliogon
   cat > ~/.config/bibliogon/secrets.yaml << 'EOF'
   ai:
     api_key: <paste-new-key-here>
   EOF
   chmod 600 ~/.config/bibliogon/secrets.yaml
   ```

3. Empty the project key (do NOT delete the field; keep schema shape):
   ```bash
   # Edit backend/config/app.yaml: change the ai.api_key line to
   #   api_key: ""
   # so the field stays but the value is blank.
   ```

4. Restart backend:
   ```bash
   make dev-down && make dev
   ```

5. Verify backend startup log:
   - DEPRECATION warning is GONE (no secrets in project app.yaml anymore)
   - No errors related to config loading

6. Hard-reload frontend: `Ctrl+Shift+R` at `http://localhost:5173`

7. Open Settings → AI tab:
   - API-key input field is HIDDEN
   - Info-note visible: "API-Schluessel wird aus externer Konfiguration gelesen..."

8. Verify the meta-flag at the API:
   ```bash
   curl http://localhost:8000/api/settings/app | jq '._secrets_managed_externally'
   ```
   Expected: `true`

9. Test AI connection:
   - Click "Verbindung testen" in Settings → AI tab
   - OR trigger any AI feature (chapter review, blurb generation)
   - Should succeed with the new key from override file

### Expected outcome

API-key invisible in UI. AI features work. Backend log clean of
deprecation warnings.

### Rollback if anything breaks

```bash
# Put the key back in app.yaml temporarily.
# Edit backend/config/app.yaml: ai.api_key: <new-key>
# Delete the override file.
rm ~/.config/bibliogon/secrets.yaml
make dev-down && make dev
```

Setup falls back to legacy single-file behavior. Deprecation
warning will return; that's expected during rollback.

---

## Flow B — Donation visibility

Verifies: docs/explorations/donation-visibility-diagnosis.md
findings + S-01 Settings tab.

### Steps

1. Edit `backend/config/app.yaml`:
   - Copy the entire `donations:` block from
     `backend/config/app.yaml.example`
   - Paste at top level of `app.yaml` (any position, alphabetic
     by convention)
   - Confirm `enabled: true`

2. Restart backend:
   ```bash
   make dev-down && make dev
   ```

3. Hard-reload frontend.

4. Open Settings:
   - Tab "Unterstuetzen" visible alongside the existing tabs
   - Click it → SupportSection renders with channel list

5. Verify channels render with the four entries from app.yaml.example:
   - Liberapay (recommended badge)
   - GitHub Sponsors
   - Ko-fi
   - PayPal

6. Each channel link works:
   - Click any channel → external URL opens in new tab

### Expected outcome

Settings has a "Unterstuetzen" tab with working donation channel
links.

### NOT verified by this flow (by design)

S-02 (onboarding dialog) and S-03 (90-day banner) will NOT trigger
on dev environment due to gate conditions:

- S-02 needs first book creation (`books.length` 0→1)
- S-03 needs `firstUseDate >= 90 days ago` AND S-02 dismissed

Both fire organically for real users. Skip verification unless
following the dev recipes in
`docs/explorations/donation-visibility-diagnosis.md` section 6.

---

## Flow C — Trash-card permanent-delete fix

Verifies: T-01 pilot commit cfb3a3e (TrashCard CSS-Module +
flex-wrap fix).

### Steps

1. Open `/articles` (Articles dashboard)

2. Soft-delete an article:
   - Hover an article card → menu button (3-dot) → "In den Papierkorb"
   - Verify it disappears from the live list

3. Open trash:
   - Click trash-toggle icon in header (data-testid `article-list-trash-toggle`)
   - Trash-view header renders with ChevronLeft + Trash2 icon + count

4. Switch trash to grid view:
   - Click view-toggle "grid" button in trash header
   - Trash card renders for the deleted article

5. Verify BOTH action buttons visible on the card:
   - Wiederherstellen (primary, RotateCcw icon)
   - Endgueltig loeschen (danger, Trash2 icon)

   Earlier bug: only Restore visible, Permanent-Delete clipped
   off-screen at narrow grid columns. After today's fix
   (`flex-wrap: wrap` in `TrashCard.module.css`), both wrap inside
   the card boundary.

6. Click Endgueltig loeschen:
   - Confirm dialog appears
   - Confirm → article removed from trash + cannot be restored

7. Switch trash to list view:
   - Click view-toggle "list" button
   - Verify same actions work

8. Repeat steps 1-7 for Books dashboard (`/`):
   - Soft-delete a book → trash → grid view → both buttons visible
   - Same in list view

9. Side-by-side comparison:
   - Open `/` in one window, `/articles` in another
   - Both trash headers should look structurally identical:
     ChevronLeft + Trash2 icon + h2 title + count span +
     empty-trash button + ViewToggle

### Expected outcome

All actions work in both trash views, card AND list, for both
dashboards. No clipping, no missing buttons.

---

## Flow D — Backup with articles (OPTIONAL)

Verifies: ed2e3ec (articles in backup pipeline). Skip tonight if
out of time.

### Steps

1. Create 2-3 articles with featured images on `/articles`.

2. Articles dashboard → Backup button:
   - data-testid `article-backup-export-btn`
   - Browser downloads `<bibliogon-backup>.bgb`

3. Inspect ZIP:
   ```bash
   unzip -l ~/Downloads/bibliogon-backup-*.bgb | grep -E "articles|manifest"
   unzip -p ~/Downloads/bibliogon-backup-*.bgb manifest.json | jq .
   ```

4. Expected manifest content:
   - `"version": "2.0"`
   - `"article_count": 3` (matching number of created articles)
   - `"book_count": ...` (whatever was in DB)

5. Expected ZIP entries:
   - `articles/<id>/` directory per article
   - `articles/<id>/article.json` per article

### Known issue (deferred)

Earlier this session a debug pass found articles NOT in backup
despite the Phase 2 implementation. That investigation is paused;
debug doc + Phase 1 diagnosis pending. If Flow D fails, confirms
the bug still exists and Aster defers to tomorrow's debug session.

### Expected outcome

If passes: articles backup pipeline works end-to-end.
If fails: known issue, defer to tomorrow.

---

## After verification

If all four flows pass: today's work is shipped clean. Record the
result in `docs/journal/chat-journal-session-2026-04-30.md` (one
line per flow: pass / fail / skipped).

If any flow fails: open a new prompt for tomorrow with the failing
flow's exact symptom + which step broke. Do NOT debug tonight.

---

## Pre-flight check

Before starting, confirm working tree is clean and HEAD is at the
last commit of today:

```bash
git status
git log --oneline | head -5
```

HEAD should be `f2bf783` (docs config commit) or later.
