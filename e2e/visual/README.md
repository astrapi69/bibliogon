# Visual regression suite

Pixel-diff screenshots that catch theme/layout regressions unit tests
cannot see (CSS positioning, contrast, responsive layout). Two specs,
both in the `visual` project:

- **`theme-regression.spec.ts`** (VISUAL-REGRESSION-SCREENSHOTS-01) — 3
  critical views (Dashboard / BookEditor / Settings-Appearance) across
  all 6 palettes x light/dark = 36 baselines, desktop viewport.
- **`viewport-regression.spec.ts`** (VISUAL-REGRESSION-VIEWPORTS-01) —
  Phase 1 responsive baselines: 8 surfaces (BD empty/populated, AD
  empty, BookEditor, Metadaten Allgemein/Qualitaet, Settings
  Daten/Autoren) x 3 viewports (desktop 1920, tablet 768, mobile 375),
  default theme.

## Run

```bash
make test-visual          # alias for: cd e2e && playwright test --project=visual
make test-visual-update   # regenerate baselines (--update-snapshots)
```

Or directly:

```bash
cd e2e
npx playwright test --project=visual
```

The `visual` project is excluded from the default run and from the
`smoke` gate (visual tests are slow and only meaningful against a
committed baseline). It boots the same isolated backend + frontend dev
server the other projects use.

## Baseline

The committed PNGs under `theme-regression.spec.ts-snapshots/` ARE the
baseline. Playwright stores them with a `-visual-linux` suffix, so they
only compare against runs on the same platform.

A red run is one of two things:

1. **A real regression** — a colour token, layout, or component look
   changed unintentionally. Fix the bug; do NOT touch the baseline.
2. **An intended visual change** — you deliberately changed a theme or
   layout. Regenerate the baseline and commit the new PNGs:

   ```bash
   npx playwright test --project=visual --update-snapshots
   ```

Never silence a real regression with `--update-snapshots`. That is the
visual-test equivalent of deleting a failing unit test.

## Tolerance

`maxDiffPixelRatio: 0.01` (1%) + `animations: disabled` live in
`playwright.config.ts`. The 1% budget absorbs sub-pixel font/antialias
drift; a real regression moves far more than 1% of pixels.

## Bootstrapping new baselines

`viewport-regression.spec.ts` ships without committed baselines: the
linux PNGs must be generated once on a linux runner (the snapshots are
platform-suffixed). Either run `make test-visual-update` on a linux box
and commit `e2e/visual/viewport-regression.spec.ts-snapshots/`, or
trigger the **Visual Regression** GitHub workflow with the
`update_snapshots` input and download the `visual-regression-baselines`
artifact. Until the baselines exist the spec's first run "fails" while
writing them — that is the intended bootstrap, not a regression.

## CI

`.github/workflows/visual-regression.yml` runs the `visual` project
**nightly** (04:00 UTC) and on `workflow_dispatch` — never on PRs,
because committed screenshots legitimately change on every UI PR and
would otherwise block them. A failing nightly diff uploads the
actual/expected/diff PNGs as the `visual-regression-diff` artifact.

## Release audit trail

To archive a release's rendered surfaces, download the nightly run's
artifacts (or run `make test-visual` locally) and keep the PNGs under
`test-results/v{version}/` outside git, or as a CI artifact.
