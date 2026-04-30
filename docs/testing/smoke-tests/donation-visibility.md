# Smoke Test: Donation Visibility

**Shipped:** 2026-04-30 (diagnosis only; primary fix is a config edit Aster does on local machine)
**Commits:** 9c77c82 (diagnosis), c86f64d (alert softening), 59b705b (FUNDING)
**Reference:** [docs/explorations/donation-visibility-diagnosis.md](../../explorations/donation-visibility-diagnosis.md)

S-series donation UI (Settings tab + onboarding dialog + 90-day banner) was already implemented but invisible because `backend/config/app.yaml` lacked the `donations:` block.

## Prerequisites

- Backend stopped.
- `backend/config/app.yaml.example` has `donations:` block (template).
- `backend/config/app.yaml` does NOT have `donations:` block (the bug).

## Flow 1 — Activate Settings tab (S-01)

1. Edit `backend/config/app.yaml`:
   - Copy entire `donations:` block from `app.yaml.example`.
   - Paste at top level. Confirm `enabled: true`.

2. Restart backend: `make dev`.

3. Hard-reload frontend.

4. Open Settings.

5. **Expected:** "Unterstützen" tab visible alongside other tabs. Click → SupportSection renders 4 channels:
   - Liberapay (recommended badge)
   - GitHub Sponsors
   - Ko-fi
   - PayPal

6. Click any channel link.
   **Expected:** external URL opens in new tab. Lands on the configured platform.

## Flow 2 — Verify gates short-circuit when `enabled: false`

1. Edit `app.yaml`: `donations.enabled: false`.
2. Restart backend, reload frontend.
3. **Expected:** "Unterstützen" tab GONE. SupportSection not rendered. No banner anywhere.

Restore to `enabled: true` after.

## Flow 3 — S-02 onboarding dialog (dev-only, organic for users)

S-02 fires when `books.length` goes 0→1 AND `bibliogon-donation-onboarding-seen` not in localStorage AND `donationsConfig` non-null.

Dev recipe:
1. DevTools → Application → Local Storage → delete `bibliogon-donation-onboarding-seen`.
2. Trash every existing book OR use a fresh DB.
3. Create one book.
4. **Expected:** dialog opens once; dismiss writes the localStorage flag; subsequent first-book creations don't re-fire.

## Flow 4 — S-03 90-day reminder (dev-only)

Five-gate: config + onboarding-seen + first-use ≥ 90 days + cooldown clear + Dashboard active.

Dev recipe (fast-forward):
1. DevTools → Local Storage:
   - Set `bibliogon-first-use-date` to a date 91+ days ago (e.g. `2026-01-01T00:00:00.000Z`).
   - Set `bibliogon-donation-onboarding-seen` to `true`.
   - Delete `bibliogon-donation-reminder-next-allowed` if set.
2. Reload Dashboard.
3. **Expected:** banner renders at top of book grid. Three buttons: Support / Not now / X.

## Known issues / by-design

- README has zero donation/support links (separate visibility-zero issue at project level).
- Fresh dev install can NEVER pass S-03 organically (first-use < 90 days). Five-gate check by design.
- localStorage from earlier testing can permanently mask S-02. Clear the key to retest.

## Failure modes

| Symptom | Likely cause |
|---------|---|
| "Unterstützen" tab missing after edit | `donations:` block missing or `enabled: false`. Re-check Flow 1. |
| Tab present but body empty | `channels: []` in app.yaml. Restore from `.example`. |
| Banner triggers in production unexpectedly | Cooldown not applied; check `bibliogon-donation-reminder-next-allowed` key in user's browser. |
