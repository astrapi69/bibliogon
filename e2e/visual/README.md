# Visual regression suite (VISUAL-REGRESSION-SCREENSHOTS-01)

Pixel-diff screenshots of 3 critical views across all 6 palettes x
light/dark = 36 committed baseline PNGs. Catches theme/layout
regressions that unit tests cannot see (CSS positioning, contrast,
real-browser layout).

## Run

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

## Follow-up

Mobile viewport (375x812) is a deliberate follow-up to keep the initial
baseline set manageable.
