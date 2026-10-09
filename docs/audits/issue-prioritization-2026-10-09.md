# Issue prioritisation audit, 2026-10-09

Read-only audit. The open issues carried **no** priority of any kind: there
are no P-labels in the repository, and the tiers that `ai-workflow.md`
defines live in `docs/ROADMAP.md` and `docs/backlog.md`, which reference
backlog IDs rather than issue numbers. ROADMAP's own header still reads
"Last updated: 2026-08-15" and "main holds v0.57.0" while the repository is
at v0.60.0, so the priority model and the work had drifted apart.

This audit scores every open issue and makes the result durable where the
work is: as `P0`..`P5` labels on the issues themselves.

## Summary

- **55 open issues** on 2026-10-09.
- Scored: **46**. Tracking mirrors: 2. Blocked on something outside the repo: 5. Superseded duplicates: 2.
- Distribution: **P0** 1, **P1** 5, **P2** 11, **P3** 19, **P4** 9, **P5** 1.

## Methodology, and one deviation

The project carries two priority systems that do not quite agree. The
tier DEFINITIONS in `ai-workflow.md` are semantic (P0 blocker/security, P1
architecture and hygiene debt, P2 high-value user features, P3
infrastructure and quality, P4 future phases, P5 speculative). The 4-Axes
method in `lessons-learned.md` produces a SCORE and maps score ranges onto
the same tier names. Run together they disagree: a correctness bug in a
shipped export scores like a feature and lands in P2, where nobody reading
the tier name would look for it.

Resolution used here, and worth writing down because the next audit will
hit it too:

- **The semantic definitions decide the tier.** They are what a reader of
  the label expects.
- **The 4-Axes score orders items INSIDE a tier.** That is what a score is
  good for.
- **P1 is read as "blocks a clean release"**, which its own definition
  already says. Correctness defects in shipped surfaces belong there: you
  would not cut a release with a comic-book PDF that spills onto a second
  sheet, for the same reason you would not cut one with a test-isolation
  gap. The tier set has no "bug" home otherwise.

Axes: **A1** user-visible impact, **A2** foundation impact (does it unblock
other items), **A3** strategic alignment, **A4** effort-discounted value.
Each 1-5, sum 4-20.

### The deviation

`lessons-learned.md` defines a **Foundation-Override**: A2 = 5 promotes an
item to P1. #918 (make `publishing_method` load-bearing) scores A2 = 5 - it
gates all four publishing adapters, #919 through #922. The override is
**not applied**, deliberately:

- Its purpose is "do the foundation before the things that depend on it".
  Nothing downstream is scheduled; the whole publishing arc is unstarted.
- Applying it would put a foundation for unstarted feature work in the same
  tier as a shipped export writing a wrong file, in a list someone works
  top-down.

#918 is therefore P2, first in its tier, with the dependency recorded. If
the publishing arc starts, the override applies and it moves to P1.

## Top 10, in order

Tier first, then score - so a P2 scoring 17 sits below a P1 scoring 13.
That is the point of the split above, not a sorting bug.

1. **#952** (P0, 15/20) - security: the weekly scan has been red for three weeks on 9 dependency CVEs (anyio, gitpython, pip, soupsieve)
2. **#793** (P1, 15/20) - Comic pages using the grid_2x1 and grid_3x2 templates spill onto a second PDF sheet
3. **#971** (P1, 15/20) - fix(dashboard): the header wraps to two lines at 1440px, and the pin that forbids it measures against the wrap
4. **#844** (P1, 14/20) - fix(git-backup): a removed chapter's Markdown side-file is never cleaned up
5. **#848** (P1, 13/20) - Manual chapter snapshots taken offline are never replayed to the server
6. **#880** (P1, 13/20) - security: GitHub token in localStorage is one XSS away from write access to the user's repositories - inventory, hardening, target picture
7. **#727** (P2, 17/20) - epic: full feature parity in PWA (Dexie mode)
8. **#918** (P2, 15/20) - feat(publishing): make the declared `publishing_method` field load-bearing
9. **#737** (P2, 14/20) - port(pwa): KDP publishing state + ARC reviewers in Dexie mode
10. **#744** (P2, 14/20) - port(pwa): writing-history CSV export client-side

## P0 - security, active blocker, production-data risk

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #952 | 15 | 4 | 3 | 4 | 4 | security: the weekly scan has been red for three weeks on 9 dependency CVEs (anyio, gitpython, pip, soupsieve) | Weekly gate red 4 weeks. gitpython backs git-sync, soupsieve backs the HTML importers, urllib3 sits under every request - all three eat foreign input. The Node half shipped in #970; this is the Python half. |

## P1 - blocks a clean release: correctness in shipped surfaces, hygiene debt

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #793 | 15 | 5 | 2 | 4 | 4 | Comic pages using the grid_2x1 and grid_3x2 templates spill onto a second PDF sheet | A shipped export writes a wrong artefact: grid_2x1 / grid_3x2 comic pages spill onto a second PDF sheet. Output corruption in a paid-for deliverable. |
| #971 | 15 | 4 | 3 | 4 | 4 | fix(dashboard): the header wraps to two lines at 1440px, and the pin that forbids it measures against the wrap | Book-Dashboard header wraps at 1440px (62px -> 76px), and the pin that forbids a wrap measures every narrower width against the 1440 height, so it grades itself on a curve. Same shape in the article-header pin. |
| #844 | 14 | 3 | 3 | 4 | 4 | fix(git-backup): a removed chapter's Markdown side-file is never cleaned up | A removed chapter's Markdown side-file survives in the git-backup repo, so deleted content comes back on the next clone or export. Data hygiene in a sync surface. |
| #848 | 13 | 3 | 3 | 4 | 3 | Manual chapter snapshots taken offline are never replayed to the server | A named manual snapshot taken offline never reaches the server: the user names a version, reconnects, and it is not there. Needs one decision (replay with the stale version / rewrite it / local-by-design) before any code. |
| #880 | 13 | 3 | 4 | 4 | 2 | security: GitHub token in localStorage is one XSS away from write access to the user's repositories - inventory, hardening, target picture | Umbrella. Steps 1-3 shipped in #885 and the exploitable findings moved to private advisories; what is left in public is the hardening list (no CSP on any deployment, window.open without noopener, PAT written into .git/config) and the step-4 target picture. Recommend splitting the hardening list into its own issues so the umbrella can close. |

## P2 - high-value user features

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #727 | 17 | 5 | 5 | 5 | 2 | epic: full feature parity in PWA (Dexie mode) | Epic for the Maximal-Offline arc - the standing strategic direction. Tier belongs to its children; the epic itself is the tracker. |
| #918 | 15 | 2 | 5 | 4 | 4 | feat(publishing): make the declared `publishing_method` field load-bearing | Makes the declared publishing_method field load-bearing - the gate every adapter (#919-#922) needs. A2=5 would trigger the documented Foundation-Override to P1; NOT applied, see the methodology note. |
| #737 | 14 | 3 | 2 | 5 | 4 | port(pwa): KDP publishing state + ARC reviewers in Dexie mode | KDP publishing state + ARC reviewers in Dexie mode. The wizard persists server-side only, so the offline build loses the user's progress. |
| #744 | 14 | 3 | 1 | 5 | 5 | port(pwa): writing-history CSV export client-side | Writing-history CSV export client-side. Small, self-contained, closes one more offline gap. |
| #745 | 14 | 3 | 2 | 5 | 4 | port(pwa): .biblio.yaml AI-template export/import client-side | The .biblio.yaml AI-template round-trip is the workflow that works with ANY AI, including a chat window. Losing it offline loses the most portable path. |
| #747 | 14 | 3 | 2 | 5 | 4 | port(pwa): publications mutations (create, delete, mark-published, verify-live) offline | Publications mutations offline - create, delete, mark-published, verify-live. The publication list already reads offline; the writes do not. |
| #748 | 14 | 3 | 2 | 5 | 4 | port(pwa): backup history + backup compare client-side | Backup history + compare client-side. Both are gated desktop-only today while the backup itself works offline. |
| #917 | 14 | 4 | 4 | 4 | 2 | epic: automated publishing — which platforms actually have an API, and what Bibliogon can build against | Epic: which publishing platforms actually have an API. The survey is the value; the adapters are its children. |
| #746 | 13 | 2 | 1 | 5 | 5 | port(pwa): translation links (sibling books) in Dexie mode | Translation links between sibling books in Dexie mode. Small. |
| #890 | 13 | 3 | 2 | 5 | 3 | offline(aplus): A+ Content in the web app (browser-direct generation + TS ruleset) | A+ Content is desktop-only today; browser-direct generation plus a TS ruleset is the Maximal-Offline answer for the surface #887 just shipped. |
| #889 | 11 | 3 | 1 | 3 | 4 | i18n(aplus): validator findings and missing-field reasons are English-only | Validator findings and missing-field reasons render in English in an 8-language product. The author who needs the explanation most is the one who does not read it. |

## P3 - infrastructure and quality

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #733 | 13 | 2 | 3 | 5 | 3 | port(pwa): ms-tools sanitizer, style-check parity and metrics CSV client-side | ms-tools sanitizer + style-check parity + metrics CSV client-side. A branch for it already exists on origin, so check for work in flight before starting. |
| #734 | 13 | 3 | 2 | 5 | 3 | port(pwa): DOCX + EPUB import in the browser | DOCX + EPUB import in the browser. Needs a browser-side converter; bigger than the Dexie ports above it. |
| #750 | 13 | 3 | 2 | 5 | 3 | port(pwa): grammar check with structured findings browser-direct (LanguageTool) | Grammar check with structured findings, browser-direct against LanguageTool. |
| #751 | 13 | 3 | 2 | 5 | 3 | port(pwa): whole-article/book translation offline (DeepL verify-first, AI-path parity) | Whole-article / whole-book translation offline. |
| #736 | 12 | 2 | 2 | 5 | 3 | port(pwa): write-book-template ZIP (.bgp) import in the browser | .bgp write-book-template ZIP import in the browser. |
| #738 | 12 | 2 | 2 | 5 | 3 | port(pwa): KDP metadata checker + category catalog client-side | KDP metadata checker + category catalog client-side. |
| #740 | 12 | 2 | 2 | 5 | 3 | port(pwa): .bgp write-book-template project export client-side | .bgp project export client-side. |
| #741 | 12 | 3 | 2 | 5 | 2 | port(pwa): KDP package export (EPUB + print PDF + metadata ZIP) client-side | KDP package export (EPUB + print PDF + metadata ZIP) client-side. The print PDF is the hard half. |
| #742 | 12 | 2 | 2 | 5 | 3 | port(pwa): comic-book PDF export client-side | Comic-book PDF export client-side. |
| #743 | 12 | 2 | 2 | 5 | 3 | port(pwa): bulk export (books + articles) client-side | Bulk export for books + articles client-side. |
| #749 | 12 | 3 | 2 | 5 | 2 | port(pwa): audiobook export via cloud TTS with the user's own key | Audiobook export via cloud TTS with the user's own key. |
| #704 | 11 | 2 | 3 | 3 | 3 | ci: prod-container browser smoke gate - launcher path is never browser-verified | The launcher path - the one real users install - is never browser-verified in CI. |
| #735 | 11 | 2 | 1 | 5 | 3 | port(pwa): Scrivener .scriv import in the browser | Scrivener .scriv import in the browser. |
| #739 | 11 | 2 | 1 | 5 | 3 | port(pwa): KDP cover validation via browser image APIs | KDP cover validation via the browser image APIs. |
| #925 | 11 | 2 | 3 | 2 | 4 | docs: the screenshot catalog index links three images that were never captured, and the gate that exists for this cannot see it | Three (now five) catalog entries point at PNGs that were never captured, and check_screenshots walks docs/help only, so the gate built for exactly this cannot see the one file whose job is referencing images. |
| #722 | 10 | 1 | 3 | 3 | 3 | mutmut tests_dir has drifted: 27 test files exercise the mutated scope but are not listed (2781 no_tests mutants) | mutmut's tests_dir misses 27 test files that exercise the mutated scope, so 2781 mutants report no_tests. The mutation gate is measuring the wrong thing and reports a score nobody can act on. |
| #965 | 10 | 1 | 2 | 3 | 4 | chore(learnset): learn-content-engine 0.36.0 available, check schema bump | learn-content-engine 0.36.0; check the schema bump. Supersedes #862 (0.26.0) and #904 (0.34.0), which are the same task at older versions. |
| #531 | 9 | 1 | 3 | 3 | 2 | God-file WARN-tier burn-down (continuation of #207) | God-file WARN-tier burn-down. Duplicate pair with #660 - same campaign, two issues. |
| #660 | 9 | 1 | 3 | 3 | 2 | God-File WARN-Tier Langzeitabbau (Nachfolger von #207) | God-file WARN-tier burn-down (continuation of #207). Duplicate pair with #531. |

## P4 - future phases

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #756 | 12 | 4 | 3 | 4 | 1 | port(pwa): multi-device sync (adaptive-learner Phase-13 lift, @astrapi69/local-sync) | Multi-device sync (@astrapi69/local-sync lift). The largest item on the board. |
| #754 | 11 | 3 | 3 | 4 | 1 | port(pwa): print-grade PDF in the browser (Typst WASM) | Print-grade PDF in the browser via Typst WASM. Large; would also unblock #741's hard half. |
| #755 | 11 | 3 | 3 | 4 | 1 | port(pwa): Git sync + backup via the GitHub REST API (Git Data endpoints) | Git sync + backup via the GitHub REST API. Interacts with #880's target picture - a browser-side PAT is exactly what that issue wants to get rid of. |
| #753 | 10 | 3 | 2 | 4 | 1 | port(pwa): local neural TTS in the browser (WASM/ONNX, no key) | Local neural TTS in the browser (WASM/ONNX). Large, and the desktop path already works. |
| #919 | 10 | 3 | 1 | 3 | 3 | feat(publishing): DEV Community adapter — publish an article via the Forem API | DEV Community adapter (Forem API). Blocked on #918. |
| #920 | 9 | 3 | 1 | 3 | 2 | feat(publishing): WordPress adapter — publish an article via the REST API | WordPress adapter. Blocked on #918. |
| #921 | 9 | 3 | 1 | 3 | 2 | feat(publishing): Ghost + Hashnode adapters | Ghost + Hashnode adapters. Blocked on #918. |
| #922 | 9 | 4 | 1 | 3 | 1 | feat(publishing): Lulu Print API — the one real book-publishing API | Lulu Print API - the one real book-publishing API, and the largest of the adapters. Blocked on #918. |
| #908 | 8 | 2 | 1 | 2 | 3 | Feature: Encrypted AI API Key Export/Import in Settings | Encrypted AI key export/import. Convenience on top of the per-provider key store #460 already shipped. |

## P5 - speculative

| # | Σ | A1 | A2 | A3 | A4 | Issue | Why this tier |
|---|---|----|----|----|----|-------|---------------|
| #706 | 6 | 1 | 2 | 2 | 1 | Exploration: extract the EditorMenu shape as @astrapi69/editor-menu-model — 12 open design decisions | Exploration with 12 open design decisions and no committed consumer. |

## Not work items

### Tracking mirrors

The red-run alarm from #951/#953 opens one issue per workflow and closes it
on the next green run. They mirror a state; they are not tasks, and they get
no priority label - labelling them would put a duplicate of the underlying
issue into the queue.

- **#967** - Visual Regression. closed by the green verification run on 2026-10-09.
- **#968** - Security Scan. open; closes when the Python half lands.

### Superseded duplicates

Three issues track the same task at three versions of the same dependency,
and two pairs of issues track one campaign each. Recommend closing the
older ones as superseded rather than carrying them:

- **#862** -> superseded by **#965** (chore(learnset): learn-content-engine 0.26.0 available, check schema bump).
- **#904** -> superseded by **#965** (chore(learnset): learn-content-engine 0.34.0 available, check schema bump).
- **#531** and **#660** are the same God-file WARN-tier burn-down, filed twice. Keep one.

### Blocked on something outside the repository

Not a tier. These need a machine, a browser or a volunteer that the
repository cannot provide; scoring them would put work in the queue that
nobody here can start.

- **#2** - D-01 Windows launcher smoke test - needs a Windows machine.
- **#3** - D-02 macOS .app bundle smoke test - needs a Mac.
- **#4** - D-03 Linux launcher smoke test - needs a desktop Linux session.
- **#5** - UI smoke test for the DEP-01/04/07 bumps - needs a human in a real browser.
- **#18** - Native-speaker review for pt / tr / ja launcher i18n - needs volunteers.

## Open questions

1. **#848** needs a product decision before any code: replay the offline
   snapshot with its stale `version`, rewrite it to the server's current
   one, or treat offline snapshots as local history by design. The issue
   argues the third is defensible, in which case closing it with that
   decision recorded IS the fix.
2. **#880** is an umbrella whose urgent half already moved to private
   advisories. The public remainder is a hardening list (no CSP on any
   deployment, `window.open` without `noopener`, the PAT written into
   `.git/config`). Splitting that list into issues would let the umbrella
   close; leaving it as one issue keeps a P1 open indefinitely.
3. **#727**'s 23 children are split across P2/P3/P4 by score. If the
   Maximal-Offline arc is the next release theme, the P3 block moves up as
   a unit rather than item by item.

## Limitations

- Scores are one reader's judgement against the issue bodies and the code,
  not a measurement. The axes make the judgement legible, not objective.
- Effort (A4) is estimated from the issue's own scope description. Three of
  the P4 items (#753, #754, #756) are WASM or sync work whose real effort is
  not knowable until someone spikes it.
- The 10 exploitable findings #880 mentions live in private advisories and
  were not visible to this audit. If any are still open they outrank
  everything in this document.

## Next audit

`lessons-learned.md` sets the triggers: 20+ new issues, a major phase close,
a strategic shift, or quarterly. The previous backlog audit was 2026-05-20,
which is why this one was overdue. Next due **2026-01-09** at the latest, or
when the publishing or Maximal-Offline arc starts in earnest.

