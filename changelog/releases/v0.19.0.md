# Bibliogon v0.19.0

Content safety is the headline of this release. A silent data-loss path in autosave (status flipped to "saved" and the IndexedDB draft was deleted before the server round-trip completed) is closed, and the whole save pipeline is hardened against tab crashes, offline outages, concurrent edits from a second tab, and accidental overwrites. Plus the donation-integration S-series (Liberapay, GitHub Sponsors, Ko-fi, PayPal) and an MkDocs restructure that finally gives macOS and Linux launcher users proper documentation.

## Content safety

- **Autosave awaits server acknowledgment.** The save-status indicator no longer flips to "saved" and the IndexedDB draft is no longer deleted before `onSave` resolves. On failure the status stays in `error` and the draft is retained.
- **Save-failure toast with retry.** A dismissible toast with a Retry button that re-triggers the save immediately. Draft preserved until retry succeeds.
- **`beforeunload` / `pagehide` / `visibilitychange` flush.** New `useFlushOnUnload` hook; IndexedDB write plus a best-effort `fetch(..., {keepalive: true})` PATCH on tab close / mobile background / iOS pagehide.
- **Offline detection with reconnect flush.** New `OfflineBanner` mounted globally. Save failures suppress the retry toast while offline (banner is the signal). On reconnect, every IndexedDB draft is PATCHed with a summary toast ("Kapitel synchronisiert: N").
- **Optimistic locking on PATCH /chapters.** New `Chapter.version` column, required `version` field on update, 409 with structured detail on mismatch.
- **Conflict resolution dialog.** Side-by-side preview of local vs server content, "Keep" / "Discard" actions.
- **`chapter_versions` table with restore flow.** Immutable snapshot on every PATCH, last-20-per-chapter retention, three new endpoints plus a sidebar context-menu entry and restore modal.
- **AbortController per-chapter save dedup.** Latest save always wins; no more races between rapid keystrokes.
- **SQLite PRAGMA: WAL mode, `synchronous=NORMAL`, `foreign_keys=ON`.** Concurrent readers unblocked, correctness fix for cascade deletes, and as a side effect `make test` runtime dropped from ~2:03 to ~15s.
- **12 new backend tests, 15 new frontend tests, 2 Playwright E2E specs.**

## Donation integration

- **S-01** Support Settings tab: conditional 4th tab with one card per channel (Liberapay recommended, GitHub Sponsors, Ko-fi, PayPal). `donations.enabled: false` in `app.yaml` hides it.
- **S-02** One-time onboarding dialog after the first book is created. Every dismiss path sets a localStorage flag.
- **S-03** 90-day reminder banner on the Dashboard. Support / Not now / Close dismiss paths (180 / 90 / 90 day cooldowns).
- **`landing_page_url` override** collapses all three levels to a single link if set.
- **Support help page** in DE and EN with FAQ and channel descriptions.
- **i18n for all 8 languages.**

## Documentation

- **MkDocs installation restructure.** One "Installation" parent with Overview, Windows, macOS, Linux, and Uninstall children. URLs preserved.
- **macOS launcher page** (arm64, Gatekeeper, `xattr` fallback, `shasum`).
- **Linux launcher page** (glibc 2.35+, Docker group, `chmod +x`, `sha256sum`, optional `python3-tk`).
- **mkdocs.yml nav regenerated** from `_meta.yaml`, picking up previously stale entries (templates, ai, themes, developers/plugins).

## Breaking

- **PATCH /chapters requires `version`** (`422` without). Clients must send the server-side version or pre-fetch the chapter. The frontend and backend test helpers were updated; third-party callers must update too.

## Known pending post-release

Automated coverage is in place (530+ backend + 400+ Vitest tests, all green) but three areas need UI smoke testing on a running app:
- Zero-touch dependency upgrades carried over from v0.18.0 (React 19 / Vite 7 / TS 6 / lucide-react 1.x) — [issue #5](https://github.com/astrapi69/bibliogon/issues/5)
- Donation UI surfaces (S-01 / S-02 / S-03) — verified in issue #5
- Content safety: Playwright recovery and offline specs plus a manual checklist for the 5 UX paths E2E cannot cover cleanly (multi-tab 409 conflict, beforeunload on tab close, mobile Safari pagehide, version-history restore, offline→online flush) — [issue #8](https://github.com/astrapi69/bibliogon/issues/8)
